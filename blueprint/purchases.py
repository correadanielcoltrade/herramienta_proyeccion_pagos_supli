import unicodedata
from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify, send_file

from blueprint.security import auth_required
from blueprint.storage import (
    load_records,
    save_records,
    load_record,
    save_record,
    next_id,
    next_id_db,
    utc_now_iso,
)
from blueprint.excel import load_excel_records, build_excel_template, EXCEL_MIME


purchases_bp = Blueprint('purchases', __name__)

UPLOAD_KEY_ALIASES = {
    'proveedor': 'provider_name',
    'provider': 'provider_name',
    'provider_name': 'provider_name',
    'vendor': 'provider_name',
    'orden_de_compra': 'order',
    'orden_compra': 'order',
    'ordencompra': 'order',
    'orden': 'order',
    'oc': 'order',
    'fecha': 'date',
    'date': 'date',
    'marca': 'brand_name',
    'sku': 'sku',
    'producto': 'product_name',
    'product': 'product_name',
    'descripcion': 'product_name',
    'cantidades': 'quantity',
    'cantidad': 'quantity',
    'qty': 'quantity',
    'precio_unitario': 'unit_price',
    'precio_unit': 'unit_price',
    'precio': 'unit_price',
    'valor_unitario': 'unit_price',
    'precio_total': 'line_total',
    'total': 'line_total',
    'observaciones': 'observations',
    'observacion': 'observations',
    'obs': 'observations',
}


def _normalize_upload_key(value):
    if value is None:
        return ''
    text = unicodedata.normalize('NFKD', str(value))
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.strip().lower()
    text = text.replace(' ', '_').replace('/', '_').replace('-', '_')
    while '__' in text:
        text = text.replace('__', '_')
    return text.strip('_')


def _normalize_upload_record(record):
    if not isinstance(record, dict):
        return {}
    normalized = {}
    for key, value in record.items():
        norm_key = _normalize_upload_key(key)
        if not norm_key:
            continue
        norm_key = UPLOAD_KEY_ALIASES.get(norm_key, norm_key)
        if norm_key in normalized and normalized[norm_key] not in (None, ''):
            if value in (None, ''):
                continue
        normalized[norm_key] = value
    return normalized


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, (int, float)):
        try:
            return datetime(1899, 12, 30) + timedelta(days=float(value))
        except Exception:
            return None
    text = str(value).strip()
    for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d', '%d-%m-%Y', '%m-%d-%Y']:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _number(value):
    if value is None:
        return 0.0
    try:
        return float(str(value).replace(',', '').strip())
    except ValueError:
        return 0.0


def _clean_text(value):
    if value is None:
        return ''
    return str(value).strip()


def _find_by_id(records, record_id):
    for record in records:
        if str(record.get('id')) == str(record_id):
            return record
    return None


def _get_or_create_provider(name, providers, provider_index):
    if not name:
        return None
    key = name.strip().lower()
    existing = provider_index.get(key)
    if existing:
        return existing
    record = {
        'id': next_id(providers),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'name': name.strip(),
            'category': 'Normal',
            'status': 'Nacional',
            'type': 'Comercial',
        }
    }
    providers.append(record)
    provider_index[key] = record
    return record


def _product_index(products):
    return {str(p.get('id')): p for p in products if p.get('id') is not None}


def _normalize_item(item, products_by_id):
    if not isinstance(item, dict):
        return None
    product_id = item.get('product_id') or item.get('producto_id')
    product_id = str(product_id) if product_id not in (None, '') else None
    product_name = _clean_text(item.get('product_name') or item.get('producto') or item.get('name'))
    sku = _clean_text(item.get('sku'))
    brand_name = _clean_text(item.get('brand_name') or item.get('marca') or item.get('brand'))
    quantity = _number(item.get('quantity') or item.get('cantidad') or item.get('cantidades'))
    unit_price = _number(item.get('unit_price') or item.get('precio_unitario') or item.get('precio'))
    line_total_raw = _number(item.get('line_total') or item.get('total') or item.get('precio_total'))

    product = products_by_id.get(product_id) if product_id else None
    if product:
        pdata = product.get('data_json', {})
        if not product_name:
            product_name = _clean_text(pdata.get('label') or pdata.get('description') or pdata.get('name') or pdata.get('sku'))
        if not sku:
            sku = _clean_text(pdata.get('sku'))
        if not brand_name:
            brand_name = _clean_text(pdata.get('brand_name'))

    if unit_price <= 0 and quantity > 0 and line_total_raw > 0:
        unit_price = line_total_raw / quantity
    total = quantity * unit_price
    if not (product_id or product_name or sku or brand_name):
        return None

    return {
        'product_id': int(product_id) if product_id and product_id.isdigit() else None,
        'product_name': product_name or None,
        'sku': sku or None,
        'brand_name': brand_name or None,
        'quantity': quantity,
        'unit_price': unit_price,
        'total': total,
    }


def _normalize_purchase_payload(payload, providers, provider_index, products):
    provider_id = payload.get('provider_id')
    provider_name = _clean_text(payload.get('provider_name') or payload.get('proveedor') or payload.get('vendor'))

    provider = None
    if provider_id:
        provider = _find_by_id(providers, provider_id)
    if not provider and provider_name:
        provider = provider_index.get(provider_name.lower())
    if not provider and provider_name:
        provider = _get_or_create_provider(provider_name, providers, provider_index)

    order = _clean_text(payload.get('order') or payload.get('orden') or payload.get('orden_de_compra') or payload.get('oc'))
    date_value = payload.get('date') or payload.get('fecha')
    parsed_date = _parse_date(date_value)
    observations = _clean_text(payload.get('observations') or payload.get('observaciones') or payload.get('obs'))

    items_raw = payload.get('items') or payload.get('productos') or []
    if not isinstance(items_raw, list):
        items_raw = []
    products_by_id = _product_index(products)
    items = []
    for raw in items_raw:
        item = _normalize_item(raw, products_by_id)
        if item:
            items.append(item)

    total = sum(item.get('total', 0) for item in items)

    return {
        'provider_id': provider['id'] if provider else None,
        'provider_name': provider['data_json'].get('name') if provider else provider_name or None,
        'order': order or None,
        'date': parsed_date.date().isoformat() if parsed_date else None,
        'observations': observations or None,
        'items': items,
        'total': total,
    }


def _load_upload_records(file_storage):
    try:
        return load_excel_records(file_storage)
    except Exception:
        return []


def _ensure_excel(file_storage):
    filename = file_storage.filename or ''
    extension = filename.lower().split('.')[-1]
    return extension in ['xlsx', 'xlsm']


@purchases_bp.route('/purchases', methods=['GET'])
@auth_required()
def list_purchases():
    purchases = load_records('pp_purchases')
    return jsonify(purchases), 200


@purchases_bp.route('/purchases', methods=['POST'])
@auth_required(['ADMIN'])
def create_purchase():
    payload = request.get_json(silent=True) or {}
    providers = load_records('pp_providers')
    products = load_records('pp_products')
    provider_index = {p['data_json']['name'].lower(): p for p in providers}

    data_json = _normalize_purchase_payload(payload, providers, provider_index, products)
    if not data_json.get('provider_id'):
        return jsonify({'error': 'Proveedor requerido'}), 400
    if not data_json.get('order'):
        return jsonify({'error': 'Orden de compra requerida'}), 400
    if not data_json.get('items'):
        return jsonify({'error': 'Debes agregar al menos un producto'}), 400

    new_purchase = {
        'id': next_id_db('pp_purchases'),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': data_json,
    }

    save_record('pp_purchases', new_purchase)
    save_records('pp_providers', providers)

    return jsonify(new_purchase), 201


@purchases_bp.route('/purchases/<int:purchase_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_purchase(purchase_id):
    payload = request.get_json(silent=True) or {}

    purchase = load_record('pp_purchases', purchase_id)
    if not purchase:
        return jsonify({'error': 'Compra no encontrada'}), 404

    providers = load_records('pp_providers')
    products = load_records('pp_products')
    provider_index = {p['data_json']['name'].lower(): p for p in providers}

    data_json = _normalize_purchase_payload({**purchase.get('data_json', {}), **payload}, providers, provider_index, products)
    if not data_json.get('provider_id'):
        return jsonify({'error': 'Proveedor requerido'}), 400
    if not data_json.get('order'):
        return jsonify({'error': 'Orden de compra requerida'}), 400
    if not data_json.get('items'):
        return jsonify({'error': 'Debes agregar al menos un producto'}), 400

    purchase['data_json'] = data_json
    purchase['updated_at'] = utc_now_iso()

    save_record('pp_purchases', purchase)
    save_records('pp_providers', providers)

    return jsonify(purchase), 200


@purchases_bp.route('/purchases/bulk-delete', methods=['POST'])
@auth_required(['ADMIN'])
def bulk_delete_purchases():
    payload = request.get_json(silent=True) or {}
    ids = payload.get('ids', [])
    if not isinstance(ids, list) or not ids:
        return jsonify({'error': 'Ids requeridos'}), 400

    purchases = load_records('pp_purchases')
    ids_set = {str(i) for i in ids}
    remaining = [p for p in purchases if str(p.get('id')) not in ids_set]
    deleted = len(purchases) - len(remaining)

    if deleted:
        save_records('pp_purchases', remaining)

    return jsonify({'deleted': deleted}), 200


@purchases_bp.route('/templates/purchases', methods=['GET'])
@auth_required(['ADMIN'])
def template_purchases():
    headers = [
        'proveedor',
        'orden_de_compra',
        'fecha',
        'marca',
        'sku',
        'producto',
        'cantidades',
        'precio_unitario',
        'observaciones',
    ]
    buffer = build_excel_template(headers, sheet_name='Compras')
    return send_file(
        buffer,
        mimetype=EXCEL_MIME,
        as_attachment=True,
        download_name='template_compras.xlsx'
    )


@purchases_bp.route('/purchases/upload', methods=['POST'])
@auth_required(['ADMIN'])
def upload_purchases():
    if 'file' not in request.files:
        return jsonify({'error': 'Archivo requerido'}), 400
    if not _ensure_excel(request.files['file']):
        return jsonify({'error': 'Solo se permite Excel (.xlsx)'}), 400

    records = _load_upload_records(request.files['file'])
    if not records:
        return jsonify({'error': 'No se pudieron leer registros'}), 400

    purchases = load_records('pp_purchases')
    providers = load_records('pp_providers')
    products = load_records('pp_products')
    provider_index = {p['data_json']['name'].lower(): p for p in providers}
    products_by_id = _product_index(products)

    groups = {}
    for record in records:
        try:
            record = _normalize_upload_record(record)
            provider_name = _clean_text(record.get('provider_name'))
            order = _clean_text(record.get('order'))
            if not provider_name or not order:
                continue
            date_raw = record.get('date')
            parsed_date = _parse_date(date_raw)
            date_key = parsed_date.date().isoformat() if parsed_date else ''
            group_key = f'{provider_name.lower()}|{order}|{date_key}'
            if group_key not in groups:
                groups[group_key] = {
                    'base': {
                        'provider_name': provider_name,
                        'order': order,
                        'date': parsed_date.date().isoformat() if parsed_date else None,
                        'observations': _clean_text(record.get('observations')),
                    },
                    'items': [],
                }
            item = _normalize_item(record, products_by_id)
            if item:
                groups[group_key]['items'].append(item)
        except Exception:
            continue

    created = []
    skipped = []
    for key, group in groups.items():
        try:
            base = group['base']
            base['items'] = group['items']
            data_json = _normalize_purchase_payload(base, providers, provider_index, products)
            if not data_json.get('provider_id'):
                skipped.append({'key': key, 'reason': 'proveedor no encontrado', 'provider': base.get('provider_name')})
                continue
            if not data_json.get('order'):
                skipped.append({'key': key, 'reason': 'orden de compra requerida'})
                continue
            if not data_json.get('items'):
                skipped.append({'key': key, 'reason': 'sin productos'})
                continue
            new_purchase = {
                'id': next_id(purchases),
                'created_at': utc_now_iso(),
                'updated_at': utc_now_iso(),
                'data_json': data_json,
            }
            purchases.append(new_purchase)
            created.append(new_purchase)
        except Exception as exc:
            skipped.append({'key': key, 'reason': str(exc)})
            continue

    save_records('pp_purchases', purchases)
    save_records('pp_providers', providers)

    return jsonify({'created': len(created), 'skipped': len(skipped), 'skipped_detail': skipped}), 201


@purchases_bp.route('/purchases/summary', methods=['GET'])
@auth_required()
def purchases_summary():
    purchases = load_records('pp_purchases')

    # Date range filter (ISO date strings YYYY-MM-DD)
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()
    if date_from or date_to:
        def _in_range(p):
            d = (p.get('data_json', {}).get('date') or '')
            if not d:
                return False
            if date_from and d < date_from:
                return False
            if date_to and d > date_to:
                return False
            return True
        purchases = [p for p in purchases if _in_range(p)]

    providers_catalog = load_records('pp_providers')
    brands_catalog = load_records('pp_brands')
    products_catalog = load_records('pp_products')

    # Category lookup indexes (by lowercase name / sku)
    CAT_ORDER = {'Alta': 0, 'Media': 1, 'Baja': 2, 'Normal': 3}

    provider_cat_idx = {
        p['data_json'].get('name', '').strip().lower(): p['data_json'].get('category', 'Normal')
        for p in providers_catalog
    }
    brand_cat_idx = {
        b['data_json'].get('name', '').strip().lower(): b['data_json'].get('category', 'Normal')
        for b in brands_catalog
    }
    product_cat_idx = {}
    for prod in products_catalog:
        d = prod.get('data_json', {})
        cat = d.get('category', 'Normal')
        for key in [d.get('sku', ''), d.get('name', ''), d.get('description', ''), d.get('label', '')]:
            key = (key or '').strip().lower()
            if key:
                product_cat_idx[key] = cat

    total_invested = 0.0
    total_ocs = len(purchases)
    providers_map = {}
    brands_map = {}
    products_map = {}
    provider_brand_map = {}
    provider_product_map = {}
    brand_product_map = {}
    monthly_map = {}

    # Category analysis buckets
    by_prov_cat = {}   # provider category -> aggregates
    by_brand_cat = {}  # brand category -> aggregates
    by_prod_cat = {}   # product category -> aggregates
    cat_matrix = {}    # 'prov_cat|||brand_cat' -> total

    def _cat_bucket(mapping, cat):
        if cat not in mapping:
            mapping[cat] = {'total': 0.0, 'qty': 0.0, 'providers': set(), 'brands': set(), 'products': set()}
        return mapping[cat]

    for purchase in purchases:
        data = purchase.get('data_json', {})
        provider_name = (data.get('provider_name') or 'Sin proveedor').strip()
        provider_id = data.get('provider_id')
        date_str = data.get('date') or ''
        month_key = date_str[:7] if len(date_str) >= 7 else ('Sin fecha' if not date_str else date_str)
        provider_cat = provider_cat_idx.get(provider_name.lower(), 'Normal')

        items = data.get('items') or []

        if provider_name not in providers_map:
            providers_map[provider_name] = {
                'total': 0.0, 'oc_count': 0, 'qty': 0.0,
                'brands': set(), 'products': set(),
                'provider_id': provider_id, 'category': provider_cat,
            }
        providers_map[provider_name]['oc_count'] += 1

        for item in items:
            brand = (_clean_text(item.get('brand_name')) or 'Sin marca')
            sku = _clean_text(item.get('sku')) or ''
            product = (_clean_text(item.get('product_name')) or sku or 'Sin producto')
            qty = _number(item.get('quantity'))
            total = _number(item.get('total'))

            brand_cat = brand_cat_idx.get(brand.lower(), 'Normal')
            prod_cat = (
                product_cat_idx.get(product.lower())
                or product_cat_idx.get(sku.lower())
                or 'Normal'
            )

            total_invested += total

            # Provider aggregates
            providers_map[provider_name]['total'] += total
            providers_map[provider_name]['qty'] += qty
            providers_map[provider_name]['brands'].add(brand)
            providers_map[provider_name]['products'].add(product)

            # Brand aggregates
            if brand not in brands_map:
                brands_map[brand] = {'total': 0.0, 'qty': 0.0, 'providers': set(), 'products': set(), 'category': brand_cat}
            brands_map[brand]['total'] += total
            brands_map[brand]['qty'] += qty
            brands_map[brand]['providers'].add(provider_name)
            brands_map[brand]['products'].add(product)

            # Product aggregates
            if product not in products_map:
                products_map[product] = {'total': 0.0, 'qty': 0.0, 'brands': set(), 'providers': set(), 'category': prod_cat}
            products_map[product]['total'] += total
            products_map[product]['qty'] += qty
            products_map[product]['brands'].add(brand)
            products_map[product]['providers'].add(provider_name)

            # Combos
            pb_key = f'{provider_name}|||{brand}'
            provider_brand_map[pb_key] = provider_brand_map.get(pb_key, 0.0) + total
            pp_key = f'{provider_name}|||{product}'
            provider_product_map[pp_key] = provider_product_map.get(pp_key, 0.0) + total
            bp_key = f'{brand}|||{product}'
            brand_product_map[bp_key] = brand_product_map.get(bp_key, 0.0) + total

            monthly_map[month_key] = monthly_map.get(month_key, 0.0) + total

            # By-category buckets
            pb = _cat_bucket(by_prov_cat, provider_cat)
            pb['total'] += total; pb['qty'] += qty
            pb['providers'].add(provider_name); pb['brands'].add(brand); pb['products'].add(product)

            bb = _cat_bucket(by_brand_cat, brand_cat)
            bb['total'] += total; bb['qty'] += qty
            bb['providers'].add(provider_name); bb['brands'].add(brand); bb['products'].add(product)

            cb = _cat_bucket(by_prod_cat, prod_cat)
            cb['total'] += total; cb['qty'] += qty
            cb['providers'].add(provider_name); cb['brands'].add(brand); cb['products'].add(product)

            # Matrix: provider_cat x brand_cat
            mx_key = f'{provider_cat}|||{brand_cat}'
            cat_matrix[mx_key] = cat_matrix.get(mx_key, 0.0) + total

    # Serialize providers
    providers_list = []
    for name, v in providers_map.items():
        providers_list.append({
            'name': name,
            'category': v['category'],
            'total': round(v['total'], 2),
            'oc_count': v['oc_count'],
            'qty': round(v['qty'], 2),
            'brand_count': len(v['brands']),
            'product_count': len(v['products']),
            'brands': sorted(v['brands']),
            'products': sorted(v['products']),
        })
    providers_list.sort(key=lambda x: -x['total'])

    brands_list = []
    for k, v in brands_map.items():
        brands_list.append({
            'name': k,
            'category': v['category'],
            'total': round(v['total'], 2),
            'qty': round(v['qty'], 2),
            'provider_count': len(v['providers']),
            'product_count': len(v['products']),
            'providers': sorted(v['providers']),
            'products': sorted(v['products']),
        })
    brands_list.sort(key=lambda x: -x['total'])

    products_list = []
    for k, v in products_map.items():
        products_list.append({
            'name': k,
            'category': v['category'],
            'total': round(v['total'], 2),
            'qty': round(v['qty'], 2),
            'brand_count': len(v['brands']),
            'provider_count': len(v['providers']),
            'brands': sorted(v['brands']),
            'providers': sorted(v['providers']),
        })
    products_list.sort(key=lambda x: -x['total'])

    def _split_combo(key):
        parts = key.split('|||', 1)
        return parts[0], parts[1] if len(parts) > 1 else ''

    top_provider_brand = sorted(
        [{'provider': _split_combo(k)[0], 'brand': _split_combo(k)[1], 'total': round(v, 2)}
         for k, v in provider_brand_map.items()],
        key=lambda x: -x['total']
    )[:30]

    top_provider_product = sorted(
        [{'provider': _split_combo(k)[0], 'product': _split_combo(k)[1], 'total': round(v, 2)}
         for k, v in provider_product_map.items()],
        key=lambda x: -x['total']
    )[:30]

    top_brand_product = sorted(
        [{'brand': _split_combo(k)[0], 'product': _split_combo(k)[1], 'total': round(v, 2)}
         for k, v in brand_product_map.items()],
        key=lambda x: -x['total']
    )[:30]

    monthly_trend = [
        {'month': k, 'total': round(v, 2)}
        for k, v in sorted(monthly_map.items())
    ]

    def _serialize_cat_bucket(mapping, label_key='category'):
        result = []
        for cat, v in mapping.items():
            result.append({
                label_key: cat,
                'total': round(v['total'], 2),
                'qty': round(v['qty'], 2),
                'provider_count': len(v['providers']),
                'brand_count': len(v['brands']),
                'product_count': len(v['products']),
                'providers': sorted(v['providers']),
                'brands': sorted(v['brands']),
                'products': sorted(v['products']),
            })
        result.sort(key=lambda x: CAT_ORDER.get(x[label_key], 99))
        return result

    category_matrix = sorted(
        [{'provider_cat': _split_combo(k)[0], 'brand_cat': _split_combo(k)[1], 'total': round(v, 2)}
         for k, v in cat_matrix.items()],
        key=lambda x: (CAT_ORDER.get(x['provider_cat'], 99), CAT_ORDER.get(x['brand_cat'], 99))
    )

    return jsonify({
        'kpis': {
            'total_invested': round(total_invested, 2),
            'total_ocs': total_ocs,
            'unique_providers': len(providers_map),
            'unique_brands': len(brands_map),
            'unique_products': len(products_map),
            'avg_per_oc': round(total_invested / total_ocs, 2) if total_ocs else 0,
        },
        'providers': providers_list[:50],
        'brands': brands_list[:50],
        'products': products_list[:50],
        'top_provider_brand': top_provider_brand,
        'top_provider_product': top_provider_product,
        'top_brand_product': top_brand_product,
        'monthly_trend': monthly_trend,
        'by_provider_category': _serialize_cat_bucket(by_prov_cat),
        'by_brand_category': _serialize_cat_bucket(by_brand_cat),
        'by_product_category': _serialize_cat_bucket(by_prod_cat),
        'category_matrix': category_matrix,
    }), 200


@purchases_bp.route('/exports/purchases', methods=['GET'])
@auth_required()
def export_purchases():
    purchases = load_records('pp_purchases')
    headers = [
        'purchase_id',
        'proveedor',
        'orden_de_compra',
        'fecha',
        'marca',
        'sku',
        'producto',
        'cantidad',
        'precio_unitario',
        'precio_total',
        'observaciones',
    ]
    rows = []
    for purchase in purchases:
        data = purchase.get('data_json', {})
        items = data.get('items') or []
        if not items:
            rows.append([
                purchase.get('id'),
                data.get('provider_name') or '',
                data.get('order') or '',
                data.get('date') or '',
                '',
                '',
                '',
                '',
                '',
                '',
                data.get('observations') or '',
            ])
            continue
        for item in items:
            rows.append([
                purchase.get('id'),
                data.get('provider_name') or '',
                data.get('order') or '',
                data.get('date') or '',
                item.get('brand_name') or '',
                item.get('sku') or '',
                item.get('product_name') or '',
                item.get('quantity') or 0,
                float(item.get('unit_price') or 0),
                float(item.get('total') or 0),
                data.get('observations') or '',
            ])
    buffer = build_excel_template(headers, sample_rows=rows, sheet_name='Compras')
    return send_file(
        buffer,
        mimetype=EXCEL_MIME,
        as_attachment=True,
        download_name='compras.xlsx'
    )
