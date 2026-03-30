
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

PROVIDER_STATUS_VALUES = {'NACIONAL': 'Nacional', 'INTERNACIONAL': 'Internacional'}
PROVIDER_TYPE_VALUES = {'COMERCIAL': 'Comercial', 'ADMINISTRATIVO': 'Administrativo'}


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


def _compute_priority(provider_category):
    cat = (provider_category or '').strip()
    if cat == 'Alta':
        return 'Alta'
    if cat == 'Media':
        return 'Media'
    return 'Baja'


def _find_by_id(records, record_id):
    for record in records:
        if str(record['id']) == str(record_id):
            return record
    return None


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


def _normalize_payment_payload(payload, providers, provider_index):
    provider_id = payload.get('provider_id')
    provider_name = (payload.get('provider_name') or payload.get('proveedor') or '').strip()

    provider = None
    if provider_id:
        provider = _find_by_id(providers, provider_id)
    if not provider and provider_name:
        provider = provider_index.get(provider_name.lower())

    provider_category = provider['data_json'].get('category') if provider else 'Normal'

    orders_raw = (
        payload.get('orders')
        or payload.get('ordenes')
        or payload.get('order')
        or payload.get('oc_embarque')
        or payload.get('oc')
        or ''
    )
    if isinstance(orders_raw, list):
        orders = [str(o).strip() for o in orders_raw if str(o).strip()]
    elif isinstance(orders_raw, str) and orders_raw.strip():
        orders = [o.strip() for o in orders_raw.split(',') if o.strip()]
    else:
        orders = []

    amount = _amount(
        payload.get('amount')
        or payload.get('monto')
        or payload.get('valor')
        or payload.get('valor_pendiente')
    )

    date_value = payload.get('date') or payload.get('fecha')
    parsed_date = _parse_date(date_value)
    week_fields = _compute_week_fields(parsed_date)

    return {
        'provider_id': provider['id'] if provider else None,
        'provider_name': provider['data_json'].get('name') if provider else provider_name or None,
        'provider_category': provider_category,
        'provider_status': provider['data_json'].get('status', 'Nacional') if provider else 'Nacional',
        'provider_type': provider['data_json'].get('type', 'Comercial') if provider else 'Comercial',
        'orders': orders,
        'date': parsed_date.date().isoformat() if parsed_date else None,
        'week': week_fields.get('week'),
        'week_year': week_fields.get('week_year'),
        'week_start': week_fields.get('week_start'),
        'week_end': week_fields.get('week_end'),
        'amount': amount,
        'status': _normalize_status(payload.get('status') or payload.get('estado')),
        'priority': _compute_priority(provider_category),
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

    provider_index = {p['data_json']['name'].lower(): p for p in providers}

    data_json = _normalize_payment_payload(payload, providers, provider_index)
    if not data_json.get('provider_id') or data_json.get('amount', 0) <= 0:
        return jsonify({'error': 'Proveedor y monto mayor a 0 son requeridos'}), 400

    new_payment = {
        'id': next_id(payments),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': data_json,
    }
    payments.append(new_payment)

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
    invalidate_cache('dashboard')

    return jsonify(new_payment), 201


@payments_bp.route('/payments/<int:payment_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_payment(payment_id):
    payload = request.get_json(silent=True) or {}
    payments = load_records('pp_payments')
    providers = load_records('pp_providers')

    payment = _find_by_id(payments, payment_id)
    if not payment:
        return jsonify({'error': 'Pago no encontrado'}), 404

    provider_index = {p['data_json']['name'].lower(): p for p in providers}

    data_json = payment['data_json']
    updated_data = _normalize_payment_payload({**data_json, **payload}, providers, provider_index)
    if not updated_data.get('provider_id') or updated_data.get('amount', 0) <= 0:
        return jsonify({'error': 'Proveedor y monto mayor a 0 son requeridos'}), 400

    payment['data_json'] = updated_data
    payment['updated_at'] = utc_now_iso()

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
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

    provider_index = {p['data_json']['name'].lower(): p for p in providers}

    created = []
    for record in records:
        try:
            if not isinstance(record, dict):
                continue
            data_json = _normalize_payment_payload(record, providers, provider_index)
            if not data_json.get('provider_id') or data_json.get('amount', 0) <= 0:
                continue
            new_payment = {
                'id': next_id(payments),
                'created_at': utc_now_iso(),
                'updated_at': utc_now_iso(),
                'data_json': data_json,
            }
            payments.append(new_payment)
            created.append(new_payment)
        except Exception:
            continue

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
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
    headers = ['payment_id', 'provider_name', 'order', 'valor_pendiente', 'fecha', 'estado']
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

    provider_index = {p['data_json']['name'].lower(): p for p in providers}

    # Group rows by payment_id when present; otherwise each row is its own payment
    groups = {}
    for record in records:
        try:
            pid = str(record.get('payment_id', '') or '').strip()
            key = pid if pid else f'_single_{id(record)}'
            if key not in groups:
                groups[key] = {'base': dict(record), 'orders': [], 'amount': 0.0}
            order_val = str(
                record.get('order', '')
                or record.get('oc', '')
                or record.get('oc_embarque', '')
                or ''
            ).strip()
            if order_val:
                groups[key]['orders'].append(order_val)
            groups[key]['amount'] += _amount(
                record.get('valor_pendiente')
                or record.get('amount')
                or record.get('monto')
            )
        except Exception:
            continue

    created = []
    for key, group in groups.items():
        try:
            base = group['base']
            base['orders'] = group['orders']
            if group['amount'] > 0:
                base['amount'] = group['amount']
            data_json = _normalize_payment_payload(base, providers, provider_index)
            if not data_json.get('provider_id') or data_json.get('amount', 0) <= 0:
                continue
            new_payment = {
                'id': next_id(payments),
                'created_at': utc_now_iso(),
                'updated_at': utc_now_iso(),
                'data_json': data_json,
            }
            payments.append(new_payment)
            created.append(new_payment)
        except Exception:
            continue

    save_records('pp_payments', payments)
    save_records('pp_providers', providers)
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
