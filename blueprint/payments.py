
import io
import csv
import json
from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify, send_file
from blueprint.security import auth_required
from blueprint.storage import load_records, save_records, next_id, utc_now_iso
from blueprint.cache import invalidate_cache
from blueprint.excel import load_excel_records, build_excel_template, EXCEL_MIME

payments_bp = Blueprint('payments', __name__)

STATUS_VALUES = {'PAGADO': 'Pagado', 'PENDIENTE': 'Pendiente'}
CATEGORY_VALUES = {'ALTA': 'Alta', 'MEDIA': 'Media', 'BAJA': 'Baja'}
CATEGORY_RANK = {'Normal': 0, 'Baja': 1, 'Media': 2, 'Alta': 3}

PROVIDER_STATUS_VALUES = {'NACIONAL': 'Nacional', 'INTERNACIONAL': 'Internacional'}
PROVIDER_TYPE_VALUES = {'COMERCIAL': 'Comercial', 'ADMINISTRATIVO': 'Administrativo'}

PRODUCT_TYPE_VALUES = {'PUSH': 'PUSH', 'PULL': 'PULL', 'IN&OUT': 'IN&OUT'}
CHANNEL_VALUES = {
    'OMNICANAL': 'Omnicanal',
    'RETAIL': 'Retail',
    'TELCOM': 'Telcom',
    'E-COMMERCE': 'E-Commerce',
    'RESELLERS': 'Resellers',
    'CORPORATIVO': 'Corporativo',
}


def _normalize_status(value):
    if not value:
        return 'Pendiente'
    key = str(value).strip().upper()
    return STATUS_VALUES.get(key, 'Pendiente')


def _normalize_category(value):
    if not value:
        return 'Normal'
    key = str(value).strip().upper()
    return CATEGORY_VALUES.get(key, 'Normal')


def _normalize_provider_status(value):
    if not value:
        return 'Nacional'
    key = str(value).strip().upper()
    return PROVIDER_STATUS_VALUES.get(key, 'Nacional')


def _normalize_provider_type(value):
    if not value:
        return 'Comercial'
    key = str(value).strip().upper()
    return PROVIDER_TYPE_VALUES.get(key, 'Comercial')


def _normalize_product_type(value):
    if not value:
        return None
    key = str(value).strip().upper()
    return PRODUCT_TYPE_VALUES.get(key, value)


def _normalize_channel(value):
    if not value:
        return None
    key = str(value).strip().upper()
    return CHANNEL_VALUES.get(key, value)


def _summary_category(categories):
    best = 'Normal'
    best_rank = -1
    for cat in categories:
        rank = CATEGORY_RANK.get(cat or 'Normal', 0)
        if rank > best_rank:
            best_rank = rank
            best = cat or 'Normal'
    return best or 'Normal'


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
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


def _compute_week_fields(parsed_date):
    if not parsed_date:
        return {'week': None, 'week_year': None, 'week_start': None, 'week_end': None}
    iso_year, iso_week, iso_weekday = parsed_date.isocalendar()
    week_start = parsed_date.date() - timedelta(days=iso_weekday - 1)
    week_end = week_start + timedelta(days=6)
    return {
        'week': iso_week,
        'week_year': iso_year,
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
    }


def _amount(value):
    if value is None:
        return 0.0
    try:
        return float(str(value).replace(',', '').strip())
    except ValueError:
        return 0.0


def _compute_priority(provider_category, product_category):
    provider_is_high = (provider_category or '').strip().lower() == 'alta'
    product_is_high = (product_category or '').strip().lower() == 'alta'
    if provider_is_high and product_is_high:
        return 'Alta'
    if provider_is_high or product_is_high:
        return 'Media'
    return 'Baja'


def _find_by_id(records, record_id):
    for record in records:
        if str(record['id']) == str(record_id):
            return record
    return None


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


def _get_or_create_provider(name, category, providers, provider_index, status=None, provider_type=None):
    if not name:
        return None
    key = name.strip().lower()
    existing = provider_index.get(key)
    if existing:
        if category and existing['data_json'].get('category') != category:
            existing['data_json']['category'] = category
            existing['updated_at'] = utc_now_iso()
        if status and existing['data_json'].get('status') != status:
            existing['data_json']['status'] = status
            existing['updated_at'] = utc_now_iso()
        if provider_type and existing['data_json'].get('type') != provider_type:
            existing['data_json']['type'] = provider_type
            existing['updated_at'] = utc_now_iso()
        return existing
    record = {
        'id': next_id(providers),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'name': name.strip(),
            'category': category or 'Normal',
            'status': status or 'Nacional',
            'type': provider_type or 'Comercial',
        }
    }
    providers.append(record)
    provider_index[key] = record
    return record


def _product_label(sku, description, fallback=None):
    if sku and description:
        return f"{sku} - {description}"
    if description:
        return description
    if sku:
        return sku
    return fallback or ''


def _build_product_data(payload, brands, brand_index):
    sku = (payload.get('sku') or payload.get('SKU') or '').strip()
    upc = (payload.get('upc') or payload.get('UPC') or '').strip()
    description = (payload.get('description') or payload.get('descripcion') or payload.get('Descripción') or payload.get('product_name') or payload.get('producto') or '').strip()
    brand_id = payload.get('brand_id') or payload.get('marca_id')
    brand_name = (payload.get('brand_name') or payload.get('marca') or '').strip()
    brand_category = _normalize_category(payload.get('brand_category') or payload.get('categoria_marca'))
    product_type = _normalize_product_type(payload.get('product_type') or payload.get('tipo_producto'))
    channel = _normalize_channel(payload.get('channel') or payload.get('canal'))
    category = _normalize_category(payload.get('category') or payload.get('categoria'))

    brand = None
    if brand_id:
        brand = _find_by_id(brands, brand_id)
    if not brand and brand_name:
        brand = _get_or_create_brand(brand_name, brand_category, brands, brand_index)

    label = _product_label(sku, description, fallback=description)

    return {
        'sku': sku or None,
        'upc': upc or None,
        'brand_id': brand['id'] if brand else None,
        'brand_name': brand['data_json'].get('name') if brand else brand_name or None,
        'description': description or None,
        'product_type': product_type,
        'channel': channel,
        'category': category,
        'label': label,
    }


def _product_key_from_data(data):
    value = data.get('sku') or data.get('label') or data.get('description') or data.get('name')
    if not value:
        return None
    return str(value).strip().lower()


def _product_index(products):
    index = {}
    for product in products:
        key = _product_key_from_data(product.get('data_json', {}))
        if key:
            index[key] = product
    return index


def _get_or_create_product(payload, products, product_index, brands, brand_index):
    data = _build_product_data(payload, brands, brand_index)
    key = _product_key_from_data(data)
    if key and key in product_index:
        existing = product_index[key]
        existing['data_json'].update({k: v for k, v in data.items() if v})
        existing['updated_at'] = utc_now_iso()
        return existing

    record = {
        'id': next_id(products),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': data,
    }
    products.append(record)
    if key:
        product_index[key] = record
    return record

def _coerce_items(payload):
    items_payload = payload.get('items') or payload.get('detalle') or payload.get('detalles')
    if isinstance(items_payload, str):
        try:
            items_payload = json.loads(items_payload)
        except Exception:
            items_payload = None
    if items_payload is None:
        items_payload = [{
            'invoice': payload.get('invoice') or payload.get('factura') or payload.get('nro_factura'),
            'product_id': payload.get('product_id'),
            'product_name': payload.get('product_name') or payload.get('producto') or payload.get('product'),
            'product_category': payload.get('product_category') or payload.get('categoria_producto') or payload.get('categoria'),
            'amount': payload.get('amount') or payload.get('monto'),
            'quantity': payload.get('quantity') or payload.get('cantidad'),
            'due_date': payload.get('due_date') or payload.get('fecha_vencimiento'),
        }]
    if not isinstance(items_payload, list):
        return []
    return items_payload


def _normalize_items(payload, products, product_index, brands, brand_index):
    items_payload = _coerce_items(payload)
    items = []
    for item in items_payload:
        if not isinstance(item, dict):
            continue
        product = None
        product_id = item.get('product_id')
        product_name = item.get('product_name') or item.get('producto') or item.get('product') or item.get('description') or item.get('descripcion')
        product_category = _normalize_category(item.get('product_category') or item.get('categoria_producto') or item.get('categoria'))
        quantity = _amount(item.get('quantity') or item.get('cantidad') or item.get('qty'))
        amount = _amount(item.get('amount') or item.get('monto') or item.get('valor'))
        if amount <= 0 and quantity:
            amount = quantity
        invoice = item.get('invoice') or item.get('factura') or item.get('nro_factura')
        due_date_value = item.get('due_date') or item.get('fecha_vencimiento') or item.get('fecha_ven')
        parsed_due_date = _parse_date(due_date_value)

        if product_id:
            product = _find_by_id(products, product_id)
        if not product:
            product_payload = dict(item)
            if product_name:
                product_payload['description'] = product_name
            if product_category:
                product_payload['category'] = product_category
            product = _get_or_create_product(product_payload, products, product_index, brands, brand_index)

        product_category = product['data_json'].get('category') if product else product_category
        if product:
            label = product['data_json'].get('label') or product['data_json'].get('description') or product['data_json'].get('name')
        else:
            label = product_name

        if not (product or product_name):
            continue

        items.append({
            'invoice': invoice,
            'product_id': product['id'] if product else None,
            'product_name': label,
            'product_category': product_category,
            'amount': amount,
            'quantity': quantity,
            'due_date': parsed_due_date.date().isoformat() if parsed_due_date else None,
        })
    return items


def _normalize_payment_payload(payload, providers, products, provider_index, product_index, brands, brand_index):
    provider_id = payload.get('provider_id')
    provider_name = payload.get('provider_name') or payload.get('proveedor') or payload.get('vendor') or payload.get('provider')
    provider_category = _normalize_category(payload.get('provider_category') or payload.get('categoria_proveedor'))
    provider_status = _normalize_provider_status(payload.get('provider_status') or payload.get('status_proveedor'))
    provider_type = _normalize_provider_type(payload.get('provider_type') or payload.get('tipo_proveedor'))

    provider = None
    if provider_id:
        provider = _find_by_id(providers, provider_id)

    if not provider:
        provider = _get_or_create_provider(provider_name, provider_category, providers, provider_index, provider_status, provider_type)

    provider_category = provider['data_json'].get('category') if provider else provider_category

    items = _normalize_items(payload, products, product_index, brands, brand_index)
    product_categories = [item.get('product_category') for item in items if item.get('product_category')]
    product_category = _summary_category(product_categories)

    amount_items = sum(item.get('amount', 0) for item in items)
    amount_value = amount_items if amount_items > 0 else _amount(payload.get('amount') or payload.get('monto'))

    invoices = [item.get('invoice') for item in items if item.get('invoice')]
    product_ids = [item.get('product_id') for item in items if item.get('product_id')]
    product_names = [item.get('product_name') for item in items if item.get('product_name')]

    date_value = payload.get('date') or payload.get('fecha')
    parsed_date = _parse_date(date_value)
    week_fields = _compute_week_fields(parsed_date)

    return {
        'provider_id': provider['id'] if provider else None,
        'provider_name': provider['data_json'].get('name') if provider else provider_name,
        'provider_category': provider_category,
        'provider_status': provider['data_json'].get('status') if provider else provider_status,
        'provider_type': provider['data_json'].get('type') if provider else provider_type,
        'product_ids': product_ids,
        'product_names': product_names,
        'product_category': product_category,
        'items': items,
        'invoices': invoices,
        'date': parsed_date.date().isoformat() if parsed_date else None,
        'week': week_fields.get('week'),
        'week_year': week_fields.get('week_year'),
        'week_start': week_fields.get('week_start'),
        'week_end': week_fields.get('week_end'),
        'amount': amount_value,
        'status': _normalize_status(payload.get('status') or payload.get('estado')),
        'priority': _compute_priority(provider_category, product_category),
        'raw': payload,
    }


def _load_upload_records(file_storage):
    try:
        return load_excel_records(file_storage)
    except Exception:
        return []


def _detect_group_key(records):
    if not records:
        return None
    candidates = ['payment_id', 'pago_id', 'grupo_pago', 'lote_pago', 'batch_id', 'group_id']
    for key in candidates:
        if any(record.get(key) for record in records):
            return key
    return None


def _group_records(records):
    group_key = _detect_group_key(records)
    if not group_key:
        return [[record] for record in records]
    groups = {}
    for record in records:
        key = record.get(group_key)
        if key is None:
            groups.setdefault(f'__single__{id(record)}', []).append(record)
            continue
        groups.setdefault(str(key), []).append(record)
    return list(groups.values())


def _ensure_excel(file_storage):
    filename = file_storage.filename or ''
    extension = filename.lower().split('.')[-1]
    return extension in ['xlsx', 'xlsm']
@payments_bp.route('/payments', methods=['GET'])
@auth_required()
def list_payments():
    payments = load_records('pp_payments')

    provider_id = request.args.get('provider_id')
    week = request.args.get('week')
    status = request.args.get('status')

    filtered = []
    for payment in payments:
        data = payment['data_json']
        if not data.get('week'):
            parsed_date = _parse_date(data.get('date'))
            if parsed_date:
                week_fields = _compute_week_fields(parsed_date)
                for key, value in week_fields.items():
                    if value is not None:
                        data[key] = value
        payment_week = data.get('week')
        if provider_id and str(data.get('provider_id')) != str(provider_id):
            continue
        if week and str(payment_week) != str(week):
            continue
        if status and data.get('status') != status:
            continue
        filtered.append(payment)

    return jsonify(filtered), 200


@payments_bp.route('/payments', methods=['POST'])
@auth_required(['ADMIN'])
def create_payment():
    payload = request.get_json(silent=True) or {}
    payments = load_records('pp_payments')
    providers = load_records('pp_providers')
    products = load_records('pp_products')
    brands = load_records('pp_brands')

    provider_index = {p['data_json']['name'].lower(): p for p in providers}
    product_index = _product_index(products)
    brand_index = {b['data_json']['name'].lower(): b for b in brands}

    data_json = _normalize_payment_payload(payload, providers, products, provider_index, product_index, brands, brand_index)
    if not data_json.get('provider_id') or not data_json.get('items'):
        return jsonify({'error': 'Proveedor y al menos un producto son requeridos'}), 400

    new_payment = {
        'id': next_id(payments),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': data_json,
    }
    payments.append(new_payment)

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')

    return jsonify(new_payment), 201


@payments_bp.route('/payments/<int:payment_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_payment(payment_id):
    payload = request.get_json(silent=True) or {}
    payments = load_records('pp_payments')
    providers = load_records('pp_providers')
    products = load_records('pp_products')
    brands = load_records('pp_brands')

    payment = _find_by_id(payments, payment_id)
    if not payment:
        return jsonify({'error': 'Pago no encontrado'}), 404

    provider_index = {p['data_json']['name'].lower(): p for p in providers}
    product_index = _product_index(products)
    brand_index = {b['data_json']['name'].lower(): b for b in brands}

    data_json = payment['data_json']
    updated_data = _normalize_payment_payload({**data_json, **payload}, providers, products, provider_index, product_index, brands, brand_index)
    if not updated_data.get('provider_id') or not updated_data.get('items'):
        return jsonify({'error': 'Proveedor y al menos un producto son requeridos'}), 400

    payment['data_json'] = updated_data
    payment['updated_at'] = utc_now_iso()

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')

    return jsonify(payment), 200


@payments_bp.route('/payments/<int:payment_id>/status', methods=['PATCH'])
@auth_required()
def update_payment_status(payment_id):
    payload = request.get_json(silent=True) or {}
    new_status = _normalize_status(payload.get('status'))
    payments = load_records('pp_payments')
    logs = load_records('pp_logs')

    payment = _find_by_id(payments, payment_id)
    if not payment:
        return jsonify({'error': 'Pago no encontrado'}), 404

    old_status = payment['data_json'].get('status', 'Pendiente')
    payment['data_json']['status'] = new_status
    payment['updated_at'] = utc_now_iso()

    log_record = {
        'id': next_id(logs),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'payment_id': payment_id,
            'old_status': old_status,
            'new_status': new_status,
            'user_id': request.user.get('id'),
        }
    }
    logs.append(log_record)

    save_records('pp_payments', payments)
    save_records('pp_logs', logs)
    invalidate_cache('dashboard')

    return jsonify(payment), 200


@payments_bp.route('/payments/bulk', methods=['POST'])
@auth_required(['ADMIN'])
def bulk_payments():
    payload = request.get_json(silent=True) or {}
    records = payload if isinstance(payload, list) else payload.get('records', [])
    if not isinstance(records, list):
        return jsonify({'error': 'Formato inválido'}), 400

    payments = load_records('pp_payments')
    providers = load_records('pp_providers')
    products = load_records('pp_products')
    brands = load_records('pp_brands')

    provider_index = {p['data_json']['name'].lower(): p for p in providers}
    product_index = _product_index(products)
    brand_index = {b['data_json']['name'].lower(): b for b in brands}

    created = []
    for group in _group_records(records):
        if not group:
            continue
        base = dict(group[0])
        base['items'] = group
        data_json = _normalize_payment_payload(base, providers, products, provider_index, product_index, brands, brand_index)
        if not data_json.get('provider_id') or not data_json.get('items'):
            continue
        new_payment = {
            'id': next_id(payments),
            'created_at': utc_now_iso(),
            'updated_at': utc_now_iso(),
            'data_json': data_json,
        }
        payments.append(new_payment)
        created.append(new_payment)

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')

    return jsonify({'created': len(created)}), 201


@payments_bp.route('/payments/bulk-delete', methods=['POST'])
@auth_required(['ADMIN'])
def bulk_delete_payments():
    payload = request.get_json(silent=True) or {}
    ids = payload.get('ids', [])
    if not isinstance(ids, list) or not ids:
        return jsonify({'error': 'Ids requeridos'}), 400

    payments = load_records('pp_payments')
    ids_set = {str(i) for i in ids}
    remaining = [p for p in payments if str(p.get('id')) not in ids_set]
    deleted = len(payments) - len(remaining)

    if deleted:
        save_records('pp_payments', remaining)
        invalidate_cache('dashboard')

    return jsonify({'deleted': deleted}), 200


@payments_bp.route('/templates/payments', methods=['GET'])
@auth_required(['ADMIN'])
def template_payments():
    headers = [
        'payment_id',
        'provider_name',
        'product_name',
        'invoice',
        'quantity',
        'due_date',
        'date',
        'status',
    ]
    buffer = build_excel_template(headers, sheet_name='Pagos')
    return send_file(
        buffer,
        mimetype=EXCEL_MIME,
        as_attachment=True,
        download_name='template_pagos.xlsx'
    )


@payments_bp.route('/payments/upload', methods=['POST'])
@auth_required(['ADMIN'])
def upload_payments():
    if 'file' not in request.files:
        return jsonify({'error': 'Archivo requerido'}), 400
    if not _ensure_excel(request.files['file']):
        return jsonify({'error': 'Solo se permite Excel (.xlsx)'}), 400

    records = _load_upload_records(request.files['file'])
    if not records:
        return jsonify({'error': 'No se pudieron leer registros'}), 400

    payments = load_records('pp_payments')
    providers = load_records('pp_providers')
    products = load_records('pp_products')
    brands = load_records('pp_brands')

    provider_index = {p['data_json']['name'].lower(): p for p in providers}
    product_index = _product_index(products)
    brand_index = {b['data_json']['name'].lower(): b for b in brands}

    created = []
    for group in _group_records(records):
        if not group:
            continue
        base = dict(group[0])
        base['items'] = group
        data_json = _normalize_payment_payload(base, providers, products, provider_index, product_index, brands, brand_index)
        if not data_json.get('provider_id') or not data_json.get('items'):
            continue
        new_payment = {
            'id': next_id(payments),
            'created_at': utc_now_iso(),
            'updated_at': utc_now_iso(),
            'data_json': data_json,
        }
        payments.append(new_payment)
        created.append(new_payment)

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
    save_records('pp_products', products)
    save_records('pp_brands', brands)
    invalidate_cache('dashboard')

    return jsonify({'created': len(created)}), 201


@payments_bp.route('/exports/weeks', methods=['GET'])
@auth_required()
def export_by_week():
    payments = load_records('pp_payments')
    from blueprint.analytics import build_week_summary

    rows = build_week_summary(payments)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['week', 'total', 'paid_total', 'pending_total', 'cumulative_total', 'status'])
    for row in rows:
        writer.writerow([
            row['week'],
            f"{row['total']:.2f}",
            f"{row['paid_total']:.2f}",
            f"{row['pending_total']:.2f}",
            f"{row['cumulative_total']:.2f}",
            row['status'],
        ])
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='reporte_semanas.csv'
    )


@payments_bp.route('/exports/providers', methods=['GET'])
@auth_required()
def export_by_provider():
    payments = load_records('pp_payments')
    from blueprint.analytics import build_provider_summary

    rows = build_provider_summary(payments)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['provider_id', 'provider_name', 'total', 'paid_total', 'pending_total', 'cumulative_total'])
    for row in rows:
        writer.writerow([
            row['provider_id'],
            row['provider_name'],
            f"{row['total']:.2f}",
            f"{row['paid_total']:.2f}",
            f"{row['pending_total']:.2f}",
            f"{row['cumulative_total']:.2f}",
        ])
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='reporte_proveedores.csv'
    )
