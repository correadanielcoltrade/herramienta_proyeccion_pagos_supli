from flask import Blueprint, request, jsonify, send_file
from blueprint.security import auth_required
from blueprint.storage import load_records, save_records, next_id, utc_now_iso
from blueprint.cache import invalidate_cache
from blueprint.excel import load_excel_records, build_excel_template, EXCEL_MIME


catalogs_bp = Blueprint('catalogs', __name__)

CATEGORY_VALUES = {'ALTA': 'Alta', 'MEDIA': 'Media', 'BAJA': 'Baja', 'NORMAL': 'Normal'}
STATUS_VALUES = {'NACIONAL': 'Nacional', 'INTERNACIONAL': 'Internacional'}
TYPE_VALUES = {'COMERCIAL': 'Comercial', 'ADMINISTRATIVO': 'Administrativo'}


def _clean_text(value):
    if value is None:
        return ''
    return str(value).strip()


def _normalize_category(value):
    if not value:
        return 'Normal'
    key = _clean_text(value).upper()
    return CATEGORY_VALUES.get(key, 'Normal')


def _normalize_status(value):
    if not value:
        return 'Nacional'
    key = _clean_text(value).upper()
    return STATUS_VALUES.get(key, 'Nacional')


def _normalize_type(value):
    if not value:
        return 'Comercial'
    key = _clean_text(value).upper()
    return TYPE_VALUES.get(key, 'Comercial')


def _find_by_id(records, record_id):
    for record in records:
        if str(record.get('id')) == str(record_id):
            return record
    return None


def _lookup(record, *names):
    if not record:
        return None
    lower_map = {str(key).strip().lower(): key for key in record.keys()}
    for name in names:
        key = lower_map.get(name.lower())
        if key is not None:
            return record.get(key)
    return None


def _brand_index(brands):
    return {b['data_json']['name'].strip().lower(): b for b in brands if b['data_json'].get('name')}


def _provider_index(providers):
    return {p['data_json']['name'].strip().lower(): p for p in providers if p['data_json'].get('name')}


def _product_key_from_payload(payload):
    sku = _clean_text(payload.get('sku') or '')
    description = _clean_text(payload.get('description') or payload.get('label') or payload.get('name') or '')
    if sku:
        return f'sku:{sku.lower()}'
    if description:
        return f'desc:{description.lower()}'
    return None


def _product_key_from_record(record):
    data = record.get('data_json', {})
    sku = _clean_text(data.get('sku') or '')
    description = _clean_text(data.get('description') or data.get('label') or data.get('name') or '')
    if sku:
        return f'sku:{sku.lower()}'
    if description:
        return f'desc:{description.lower()}'
    return None


def _products_index(products):
    index = {}
    for product in products:
        key = _product_key_from_record(product)
        if key:
            index[key] = product
    return index


def _coerce_id_list(payload):
    ids = payload.get('ids') or payload.get('records') or payload.get('items')
    if isinstance(ids, list):
        return [str(item) for item in ids if str(item)]
    return []


def _remove_by_ids(records, ids):
    id_set = {str(item) for item in ids}
    kept = [record for record in records if str(record.get('id')) not in id_set]
    deleted = len(records) - len(kept)
    return kept, deleted


def _ensure_excel_file(file_storage):
    filename = file_storage.filename or ''
    extension = filename.lower().split('.')[-1]
    return extension in ['xlsx', 'xlsm']


def _get_or_create_brand(name, category, brands, brand_index):
    if not name:
        return None
    key = name.strip().lower()
    existing = brand_index.get(key)
    if existing:
        if category and existing['data_json'].get('category') != category:
            existing['data_json']['category'] = category
            existing['updated_at'] = utc_now_iso()
        return existing
    record = {
        'id': next_id(brands),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'name': name.strip(),
            'category': category or 'Normal',
        }
    }
    brands.append(record)
    brand_index[key] = record
    return record


def _resolve_brand(payload, brands, brand_index):
    brand_id = payload.get('brand_id')
    brand_name = payload.get('brand_name') or payload.get('brand') or payload.get('marca')
    brand_category = _normalize_category(payload.get('brand_category') or payload.get('categoria_marca'))

    if brand_id:
        return _find_by_id(brands, brand_id)
    if brand_name:
        return _get_or_create_brand(brand_name, brand_category, brands, brand_index)
    return None


def _apply_brand_to_product(product, brand):
    if not product or not brand:
        return
    product['data_json']['brand_id'] = brand['id']
    product['data_json']['brand_name'] = brand['data_json'].get('name')


def _product_payload_from_record(record):
    return {
        'sku': _lookup(record, 'sku'),
        'upc': _lookup(record, 'upc'),
        'brand_id': _lookup(record, 'brand_id'),
        'brand_name': _lookup(record, 'brand_name', 'brand', 'marca'),
        'description': _lookup(record, 'description', 'descripcion', 'descripción'),
        'label': _lookup(record, 'label', 'nombre', 'name', 'producto'),
        'product_type': _lookup(record, 'product_type', 'tipo_producto'),
        'channel': _lookup(record, 'channel', 'canal'),
        'category': _lookup(record, 'category', 'categoria', 'categoría'),
    }


@catalogs_bp.route('/brands', methods=['GET'])
@auth_required()
def list_brands():
    brands = load_records('pp_brands')
    return jsonify(brands), 200


@catalogs_bp.route('/brands', methods=['POST'])
@auth_required(['ADMIN'])
def create_brand():
    payload = request.get_json(silent=True) or {}
    name = _clean_text(payload.get('name') or payload.get('marca'))
    if not name:
        return jsonify({'error': 'Nombre requerido'}), 400
    brands = load_records('pp_brands')
    brand_index = _brand_index(brands)
    brand = _get_or_create_brand(name, _normalize_category(payload.get('category')), brands, brand_index)
    save_records('pp_brands', brands)
    return jsonify(brand), 201


@catalogs_bp.route('/brands/<int:brand_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_brand(brand_id):
    payload = request.get_json(silent=True) or {}
    brands = load_records('pp_brands')
    brand = _find_by_id(brands, brand_id)
    if not brand:
        return jsonify({'error': 'Marca no encontrada'}), 404
    if payload.get('name'):
        brand['data_json']['name'] = _clean_text(payload.get('name'))
    if payload.get('category'):
        brand['data_json']['category'] = _normalize_category(payload.get('category'))
    brand['updated_at'] = utc_now_iso()
    save_records('pp_brands', brands)
    return jsonify(brand), 200


@catalogs_bp.route('/brands/upload', methods=['POST'])
@auth_required(['ADMIN'])
def upload_brands():
    if 'file' not in request.files:
        return jsonify({'error': 'Archivo requerido'}), 400
    file_storage = request.files['file']
    if not _ensure_excel_file(file_storage):
        return jsonify({'error': 'Solo se permite Excel (.xlsx)'}), 400
    try:
        records = load_excel_records(file_storage)
    except Exception:
        return jsonify({'error': 'No se pudo leer el Excel'}), 400
    if not records:
        return jsonify({'error': 'No se encontraron registros'}), 400

    brands = load_records('pp_brands')
    brand_index = _brand_index(brands)
    created = 0
    updated = 0
    for record in records:
        name = _clean_text(_lookup(record, 'name', 'marca'))
        if not name:
            continue
        category = _normalize_category(_lookup(record, 'category', 'categoria', 'categoría'))
        existing = brand_index.get(name.lower())
        if existing:
            if category and existing['data_json'].get('category') != category:
                existing['data_json']['category'] = category
                existing['updated_at'] = utc_now_iso()
                updated += 1
            continue
        brand = _get_or_create_brand(name, category, brands, brand_index)
        if brand:
            created += 1

    save_records('pp_brands', brands)
    return jsonify({'created': created, 'updated': updated}), 201


@catalogs_bp.route('/brands/bulk-delete', methods=['POST'])
@auth_required(['ADMIN'])
def bulk_delete_brands():
    payload = request.get_json(silent=True) or {}
    ids = _coerce_id_list(payload)
    if not ids:
        return jsonify({'error': 'Ids requeridos'}), 400
    brands = load_records('pp_brands')
    brands, deleted = _remove_by_ids(brands, ids)
    save_records('pp_brands', brands)
    return jsonify({'deleted': deleted}), 200


@catalogs_bp.route('/providers', methods=['GET'])
@auth_required()
def list_providers():
    providers = load_records('pp_providers')
    return jsonify(providers), 200


@catalogs_bp.route('/providers', methods=['POST'])
@auth_required(['ADMIN'])
def create_provider():
    payload = request.get_json(silent=True) or {}
    name = _clean_text(payload.get('name') or payload.get('proveedor') or payload.get('vendor'))
    if not name:
        return jsonify({'error': 'Nombre requerido'}), 400
    providers = load_records('pp_providers')
    provider_index = _provider_index(providers)
    key = name.lower()
    existing = provider_index.get(key)
    if existing:
        existing['data_json']['category'] = _normalize_category(payload.get('category') or existing['data_json'].get('category'))
        existing['data_json']['status'] = _normalize_status(payload.get('status') or existing['data_json'].get('status'))
        existing['data_json']['type'] = _normalize_type(payload.get('type') or existing['data_json'].get('type'))
        existing['updated_at'] = utc_now_iso()
        save_records('pp_providers', providers)
        invalidate_cache('dashboard')
        return jsonify(existing), 200

    record = {
        'id': next_id(providers),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'name': name,
            'category': _normalize_category(payload.get('category')),
            'status': _normalize_status(payload.get('status')),
            'type': _normalize_type(payload.get('type')),
        }
    }
    providers.append(record)
    save_records('pp_providers', providers)
    invalidate_cache('dashboard')
    return jsonify(record), 201


@catalogs_bp.route('/providers/<int:provider_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_provider(provider_id):
    payload = request.get_json(silent=True) or {}
    providers = load_records('pp_providers')
    provider = _find_by_id(providers, provider_id)
    if not provider:
        return jsonify({'error': 'Proveedor no encontrado'}), 404
    if payload.get('name'):
        provider['data_json']['name'] = _clean_text(payload.get('name'))
    if payload.get('category'):
        provider['data_json']['category'] = _normalize_category(payload.get('category'))
    if payload.get('status'):
        provider['data_json']['status'] = _normalize_status(payload.get('status'))
    if payload.get('type'):
        provider['data_json']['type'] = _normalize_type(payload.get('type'))
    provider['updated_at'] = utc_now_iso()
    save_records('pp_providers', providers)
    invalidate_cache('dashboard')
    return jsonify(provider), 200


@catalogs_bp.route('/providers/upload', methods=['POST'])
@auth_required(['ADMIN'])
def upload_providers():
    if 'file' not in request.files:
        return jsonify({'error': 'Archivo requerido'}), 400
    file_storage = request.files['file']
    if not _ensure_excel_file(file_storage):
        return jsonify({'error': 'Solo se permite Excel (.xlsx)'}), 400
    try:
        records = load_excel_records(file_storage)
    except Exception:
        return jsonify({'error': 'No se pudo leer el Excel'}), 400
    if not records:
        return jsonify({'error': 'No se encontraron registros'}), 400

    providers = load_records('pp_providers')
    provider_index = _provider_index(providers)
    created = 0
    updated = 0
    for record in records:
        name = _clean_text(_lookup(record, 'name', 'proveedor', 'vendor', 'nombre'))
        if not name:
            continue
        category = _normalize_category(_lookup(record, 'category', 'categoria', 'categoría'))
        status = _normalize_status(_lookup(record, 'status', 'estado'))
        provider_type = _normalize_type(_lookup(record, 'type', 'tipo'))
        existing = provider_index.get(name.lower())
        if existing:
            existing['data_json']['category'] = category or existing['data_json'].get('category')
            existing['data_json']['status'] = status or existing['data_json'].get('status')
            existing['data_json']['type'] = provider_type or existing['data_json'].get('type')
            existing['updated_at'] = utc_now_iso()
            updated += 1
            continue
        record_new = {
            'id': next_id(providers),
            'created_at': utc_now_iso(),
            'updated_at': utc_now_iso(),
            'data_json': {
                'name': name,
                'category': category,
                'status': status,
                'type': provider_type,
            }
        }
        providers.append(record_new)
        provider_index[name.lower()] = record_new
        created += 1

    save_records('pp_providers', providers)
    invalidate_cache('dashboard')
    return jsonify({'created': created, 'updated': updated}), 201


@catalogs_bp.route('/providers/bulk-delete', methods=['POST'])
@auth_required(['ADMIN'])
def bulk_delete_providers():
    payload = request.get_json(silent=True) or {}
    ids = _coerce_id_list(payload)
    if not ids:
        return jsonify({'error': 'Ids requeridos'}), 400
    providers = load_records('pp_providers')
    providers, deleted = _remove_by_ids(providers, ids)
    save_records('pp_providers', providers)
    invalidate_cache('dashboard')
    return jsonify({'deleted': deleted}), 200


@catalogs_bp.route('/products', methods=['GET'])
@auth_required()
def list_products():
    products = load_records('pp_products')
    return jsonify(products), 200


@catalogs_bp.route('/products', methods=['POST'])
@auth_required(['ADMIN'])
def create_product():
    payload = request.get_json(silent=True) or {}
    description = _clean_text(payload.get('description') or payload.get('label') or payload.get('name'))
    if not description and not payload.get('sku'):
        return jsonify({'error': 'Descripción o SKU requerido'}), 400

    products = load_records('pp_products')
    brands = load_records('pp_brands')
    brand_index = _brand_index(brands)
    product_index = _products_index(products)

    key = _product_key_from_payload(payload)
    existing = product_index.get(key) if key else None
    if existing:
        data = existing['data_json']
        if payload.get('sku'):
            data['sku'] = _clean_text(payload.get('sku'))
        if payload.get('upc'):
            data['upc'] = _clean_text(payload.get('upc'))
        if description:
            data['description'] = description
            data['name'] = description
            if not data.get('label'):
                data['label'] = description
        if payload.get('label'):
            data['label'] = _clean_text(payload.get('label'))
        if payload.get('product_type'):
            data['product_type'] = _clean_text(payload.get('product_type'))
        if payload.get('channel'):
            data['channel'] = _clean_text(payload.get('channel'))
        if payload.get('category'):
            data['category'] = _normalize_category(payload.get('category'))
        brand = _resolve_brand(payload, brands, brand_index)
        if brand:
            _apply_brand_to_product(existing, brand)
        existing['updated_at'] = utc_now_iso()
        save_records('pp_products', products)
        save_records('pp_brands', brands)
        invalidate_cache('dashboard')
        return jsonify(existing), 200

    brand = _resolve_brand(payload, brands, brand_index)
    label_value = _clean_text(payload.get('label')) or description
    record = {
        'id': next_id(products),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'sku': _clean_text(payload.get('sku')),
            'upc': _clean_text(payload.get('upc')),
            'description': description,
            'label': label_value,
            'product_type': _clean_text(payload.get('product_type')) or 'PUSH',
            'channel': _clean_text(payload.get('channel')) or 'Omnicanal',
            'category': _normalize_category(payload.get('category')),
            'name': description or label_value or _clean_text(payload.get('sku')),
        }
    }
    _apply_brand_to_product(record, brand)
    products.append(record)

    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')
    return jsonify(record), 201


@catalogs_bp.route('/products/<int:product_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_product(product_id):
    payload = request.get_json(silent=True) or {}
    products = load_records('pp_products')
    brands = load_records('pp_brands')
    brand_index = _brand_index(brands)
    product = _find_by_id(products, product_id)
    if not product:
        return jsonify({'error': 'Producto no encontrado'}), 404

    data = product['data_json']
    if payload.get('sku') is not None:
        data['sku'] = _clean_text(payload.get('sku'))
    if payload.get('upc') is not None:
        data['upc'] = _clean_text(payload.get('upc'))
    if payload.get('description'):
        data['description'] = _clean_text(payload.get('description'))
        data['name'] = data['description']
        if not data.get('label'):
            data['label'] = data['description']
    if payload.get('label'):
        data['label'] = _clean_text(payload.get('label'))
    if payload.get('product_type'):
        data['product_type'] = _clean_text(payload.get('product_type'))
    if payload.get('channel'):
        data['channel'] = _clean_text(payload.get('channel'))
    if payload.get('category'):
        data['category'] = _normalize_category(payload.get('category'))

    brand = _resolve_brand(payload, brands, brand_index)
    if brand:
        _apply_brand_to_product(product, brand)

    product['updated_at'] = utc_now_iso()
    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')
    return jsonify(product), 200


@catalogs_bp.route('/products/upload', methods=['POST'])
@auth_required(['ADMIN'])
def upload_products():
    if 'file' not in request.files:
        return jsonify({'error': 'Archivo requerido'}), 400
    file_storage = request.files['file']
    if not _ensure_excel_file(file_storage):
        return jsonify({'error': 'Solo se permite Excel (.xlsx)'}), 400
    try:
        records = load_excel_records(file_storage)
    except Exception:
        return jsonify({'error': 'No se pudo leer el Excel'}), 400
    if not records:
        return jsonify({'error': 'No se encontraron registros'}), 400

    products = load_records('pp_products')
    brands = load_records('pp_brands')
    brand_index = _brand_index(brands)
    product_index = _products_index(products)
    created = 0
    updated = 0

    for record in records:
        payload = _product_payload_from_record(record)
        description = _clean_text(payload.get('description') or payload.get('label') or payload.get('name'))
        if not description and not payload.get('sku'):
            continue
        key = _product_key_from_payload(payload)
        existing = product_index.get(key) if key else None
        if existing:
            data = existing['data_json']
            if payload.get('sku'):
                data['sku'] = _clean_text(payload.get('sku'))
            if payload.get('upc'):
                data['upc'] = _clean_text(payload.get('upc'))
            if description:
                data['description'] = description
                data['name'] = description
                if not data.get('label'):
                    data['label'] = description
            if payload.get('label'):
                data['label'] = _clean_text(payload.get('label'))
            if payload.get('product_type'):
                data['product_type'] = _clean_text(payload.get('product_type'))
            if payload.get('channel'):
                data['channel'] = _clean_text(payload.get('channel'))
            if payload.get('category'):
                data['category'] = _normalize_category(payload.get('category'))
            brand = _resolve_brand(payload, brands, brand_index)
            if brand:
                _apply_brand_to_product(existing, brand)
            existing['updated_at'] = utc_now_iso()
            updated += 1
            continue

        brand = _resolve_brand(payload, brands, brand_index)
        label_value = _clean_text(payload.get('label')) or description
        record_new = {
            'id': next_id(products),
            'created_at': utc_now_iso(),
            'updated_at': utc_now_iso(),
            'data_json': {
                'sku': _clean_text(payload.get('sku')),
                'upc': _clean_text(payload.get('upc')),
                'description': description,
                'label': label_value,
                'product_type': _clean_text(payload.get('product_type')) or 'PUSH',
                'channel': _clean_text(payload.get('channel')) or 'Omnicanal',
                'category': _normalize_category(payload.get('category')),
                'name': description or label_value or _clean_text(payload.get('sku')),
            }
        }
        _apply_brand_to_product(record_new, brand)
        products.append(record_new)
        if key:
            product_index[key] = record_new
        created += 1

    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')
    return jsonify({'created': created, 'updated': updated}), 201


@catalogs_bp.route('/products/bulk-delete', methods=['POST'])
@auth_required(['ADMIN'])
def bulk_delete_products():
    payload = request.get_json(silent=True) or {}
    ids = _coerce_id_list(payload)
    if not ids:
        return jsonify({'error': 'Ids requeridos'}), 400
    products = load_records('pp_products')
    products, deleted = _remove_by_ids(products, ids)
    save_records('pp_products', products)
    invalidate_cache('dashboard')
    return jsonify({'deleted': deleted}), 200


@catalogs_bp.route('/templates/brands', methods=['GET'])
@auth_required(['ADMIN'])
def template_brands():
    buffer = build_excel_template(['name', 'category'], sheet_name='Marcas')
    return send_file(
        buffer,
        mimetype=EXCEL_MIME,
        as_attachment=True,
        download_name='template_marcas.xlsx'
    )


@catalogs_bp.route('/templates/providers', methods=['GET'])
@auth_required(['ADMIN'])
def template_providers():
    buffer = build_excel_template(['name', 'category', 'status', 'type'], sheet_name='Proveedores')
    return send_file(
        buffer,
        mimetype=EXCEL_MIME,
        as_attachment=True,
        download_name='template_proveedores.xlsx'
    )


@catalogs_bp.route('/templates/products', methods=['GET'])
@auth_required(['ADMIN'])
def template_products():
    headers = ['sku', 'upc', 'brand_name', 'description', 'product_type', 'channel', 'category']
    buffer = build_excel_template(headers, sheet_name='Productos')
    return send_file(
        buffer,
        mimetype=EXCEL_MIME,
        as_attachment=True,
        download_name='template_productos.xlsx'
    )
