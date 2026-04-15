from collections import defaultdict
from datetime import datetime, date


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _week_from_date(value):
    parsed = _parse_date(value)
    if not parsed:
        return None
    return parsed.isocalendar()[1]


def build_week_summary(payments):
    week_map = {}

    for p in payments:
        data = p.get('data_json', {})
        week = data.get('week') or _week_from_date(data.get('date'))
        if week is None:
            continue
        week_year = data.get('week_year')
        if week_year is None:
            parsed = _parse_date(data.get('date'))
            if parsed:
                week_year = parsed.isocalendar()[0]
        amount = float(data.get('amount', 0) or 0)
        status = data.get('status', 'Pendiente')
        sort_key = (int(week_year) if week_year else 0, int(week))
        if sort_key not in week_map:
            week_map[sort_key] = {
                'week': int(week),
                'week_year': int(week_year) if week_year else None,
                'total': 0.0,
                'paid_total': 0.0,
                'pending_total': 0.0,
                'status': 'Pendiente',
            }
        entry = week_map[sort_key]
        entry['total'] += amount
        if status == 'Pagado':
            entry['paid_total'] += amount
        else:
            entry['pending_total'] += amount

    weeks = [week_map[k] for k in sorted(week_map.keys())]
    cumulative = 0.0
    for w in weeks:
        cumulative += w['total']
        w['cumulative_total'] = cumulative
        w['status'] = 'Pagado' if w['pending_total'] == 0 else 'Pendiente'
    return weeks


def build_provider_summary(payments, provider_records=None):
    provider_index = {}
    if provider_records:
        provider_index = {str(p.get('id')): p for p in provider_records}

    provider_map = defaultdict(lambda: {
        'provider_id': None,
        'provider_name': None,
        'provider_type': 'Comercial',
        'total': 0.0,
        'paid_total': 0.0,
        'pending_total': 0.0,
    })

    for p in payments:
        provider_id = p['data_json'].get('provider_id')
        provider_name = p['data_json'].get('provider_name')
        amount = float(p['data_json'].get('amount', 0) or 0)
        status = p['data_json'].get('status', 'Pendiente')
        entry = provider_map[provider_id]
        entry['provider_id'] = provider_id
        entry['provider_name'] = provider_name
        entry['total'] += amount
        if status == 'Pagado':
            entry['paid_total'] += amount
        else:
            entry['pending_total'] += amount

    providers = list(provider_map.values())

    # Enrich with provider type from provider_records
    for provider in providers:
        provider_id = provider.get('provider_id')
        if provider_id and str(provider_id) in provider_index:
            provider_record = provider_index[str(provider_id)]
            provider_type = provider_record.get('data_json', {}).get('type', 'Comercial')
            provider['provider_type'] = provider_type

    providers.sort(key=lambda x: x['total'], reverse=True)
    cumulative = 0.0
    for p in providers:
        cumulative += p['total']
        p['cumulative_total'] = cumulative
    return providers


def priority_from_category(provider_cat):
    cat = (provider_cat or '').strip()
    if cat == 'Alta':
        return 'Alta'
    if cat == 'Media':
        return 'Media'
    return 'Baja'


def build_gantt_data(payments):
    return build_gantt_data_with_refs(payments, providers=None)


def build_gantt_data_with_refs(payments, providers=None):
    priority_rank = {'Baja': 1, 'Media': 2, 'Alta': 3}
    category_values = {'ALTA': 'Alta', 'MEDIA': 'Media', 'BAJA': 'Baja', 'NORMAL': 'Normal'}
    week_set = set()
    vendor_map = {}
    provider_index = {}

    if providers:
        provider_index = {str(p.get('id')): p for p in providers}

    def _normalize_category(value):
        if not value:
            return 'Normal'
        key = str(value).strip().upper()
        return category_values.get(key, 'Normal')

    for p in payments:
        data = p.get('data_json', {})
        week = data.get('week') or _week_from_date(data.get('date'))
        if week is None:
            continue
        week_year = data.get('week_year')
        if week_year is None:
            parsed = _parse_date(data.get('date'))
            if parsed:
                week_year = parsed.isocalendar()[0]

        year_int = int(week_year) if week_year else 0
        week_int = int(week)
        week_set.add((year_int, week_int))
        week_key = f"{year_int}-{week_int}" if year_int else str(week_int)

        vendor_id = data.get('provider_id')
        provider = provider_index.get(str(vendor_id)) if vendor_id is not None else None
        provider_data = provider.get('data_json', {}) if provider else {}
        vendor_name = (
            (provider_data.get('name') if provider else None)
            or data.get('provider_name')
            or 'Sin proveedor'
        )
        vendor_category = _normalize_category(
            provider_data.get('category') or data.get('provider_category')
        )
        vendor_type = provider_data.get('type', 'Comercial') if provider else 'Comercial'
        key = str(vendor_id) if vendor_id is not None else f'name:{vendor_name}'
        vendor_entry = vendor_map.setdefault(key, {
            'vendor_id': vendor_id,
            'vendor_name': vendor_name,
            'vendor_category': vendor_category,
            'vendor_type': vendor_type,
            'weeks': {},
        })
        if not vendor_entry.get('vendor_category'):
            vendor_entry['vendor_category'] = vendor_category
        if not vendor_entry.get('vendor_type'):
            vendor_entry['vendor_type'] = vendor_type

        cell = vendor_entry['weeks'].setdefault(week_key, {
            'total': 0.0,
            'priority': 'Baja',
            'details': [],
            'paid_total': 0.0,
            'pending_total': 0.0,
            'status': 'Pendiente',
        })

        payment_amount = float(data.get('amount', 0) or 0)
        cell['total'] += payment_amount
        payment_status = data.get('status', 'Pendiente')
        payment_type = data.get('payment_type') or data.get('tipo_pago') or data.get('provider_status') or 'Nacional'
        if payment_status == 'Pagado':
            cell['paid_total'] += payment_amount
        else:
            cell['pending_total'] += payment_amount
        cell['status'] = (
            'Pagado'
            if cell['pending_total'] == 0 and cell['paid_total'] > 0
            else 'Pendiente'
        )

        orders = data.get('orders', [])
        if not isinstance(orders, list):
            orders = [str(orders)] if orders else []
        order_count = len(orders)
        for order in orders:
            if isinstance(order, dict):
                order_label = str(order.get('order') or order.get('oc') or '-')
                order_amount = float(order.get('amount', 0) or 0)
                if order_amount == 0 and order_count:
                    order_amount = payment_amount / order_count
            else:
                order_label = str(order)
                order_amount = payment_amount / order_count if order_count else payment_amount
            detail = {
                'order': order_label,
                'amount': order_amount,
                'status': payment_status,
                'payment_type': payment_type,
            }
            cell['details'].append(detail)

        priority = priority_from_category(vendor_category)
        if priority_rank.get(priority, 0) > priority_rank.get(cell['priority'], 0):
            cell['priority'] = priority

    weeks_sorted = sorted(week_set)
    weeks_out = [
        {
            'year': y if y else None,
            'week': w,
            'key': f"{y}-{w}" if y else str(w),
            'label': f"Sem {w} ({y})" if y else f"Sem {w}",
        }
        for y, w in weeks_sorted
    ]
    vendors = list(vendor_map.values())
    vendors.sort(key=lambda v: (v.get('vendor_name') or '').lower())
    return {
        'weeks': weeks_out,
        'vendors': vendors,
    }


def build_summary(payments):
    total_general = 0.0
    paid_total = 0.0
    pending_total = 0.0
    paid_count = 0
    pending_count = 0
    for p in payments:
        data = p.get('data_json', {})
        amount = float(data.get('amount', 0) or 0)
        status = data.get('status', 'Pendiente')
        total_general += amount
        if status == 'Pagado':
            paid_total += amount
            paid_count += 1
        else:
            pending_total += amount
            pending_count += 1
    return {
        'total_general': total_general,
        'total_by_week': build_week_summary(payments),
        'total_by_provider': build_provider_summary(payments),
        'paid_total': paid_total,
        'pending_total': pending_total,
        'paid_count': paid_count,
        'pending_count': pending_count,
    }
