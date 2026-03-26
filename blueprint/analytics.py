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
    week_map = defaultdict(lambda: {
        'week': None,
        'total': 0.0,
        'paid_total': 0.0,
        'pending_total': 0.0,
        'status': 'Pendiente',
    })

    for p in payments:
        data = p.get('data_json', {})
        week = data.get('week') or _week_from_date(data.get('date'))
        if week is None:
            continue
        amount = float(data.get('amount', 0) or 0)
        status = data.get('status', 'Pendiente')
        entry = week_map[week]
        entry['week'] = week
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


def build_provider_summary(payments):
    provider_map = defaultdict(lambda: {
        'provider_id': None,
        'provider_name': None,
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
    providers.sort(key=lambda x: x['total'], reverse=True)
    cumulative = 0.0
    for p in providers:
        cumulative += p['total']
        p['cumulative_total'] = cumulative
    return providers


def build_gantt_data(payments):
    return build_gantt_data_with_refs(payments, providers=None, products=None)


def build_gantt_data_with_refs(payments, providers=None, products=None):
    priority_rank = {'Baja': 1, 'Media': 2, 'Alta': 3}
    category_rank = {'Normal': 0, 'Baja': 1, 'Media': 2, 'Alta': 3}
    category_values = {'ALTA': 'Alta', 'MEDIA': 'Media', 'BAJA': 'Baja', 'NORMAL': 'Normal'}
    week_set = set()
    vendor_map = {}
    provider_index = {}
    product_index = {}

    if providers:
        provider_index = {str(p.get('id')): p for p in providers}
    if products:
        product_index = {str(p.get('id')): p for p in products}

    def _normalize_category(value):
        if not value:
            return 'Normal'
        key = str(value).strip().upper()
        return category_values.get(key, 'Normal')

    def max_category(categories):
        best = 'Normal'
        best_rank = -1
        for cat in categories:
            normalized = _normalize_category(cat)
            rank = category_rank.get(normalized or 'Normal', 0)
            if rank > best_rank:
                best_rank = rank
                best = normalized or 'Normal'
        return best or 'Normal'

    def priority_from_categories(provider_cat, product_cat):
        provider_norm = _normalize_category(provider_cat)
        product_norm = _normalize_category(product_cat)

        # Matriz de prioridad (Proveedor x Producto)
        # Producto Alta  -> Alta
        # Producto Media -> Alta si Proveedor Alta, sino Media
        # Producto Baja  -> Media si Proveedor Alta/Media, sino Baja
        provider_level = provider_norm if provider_norm in ('Alta', 'Media', 'Baja') else 'Baja'
        product_level = product_norm if product_norm in ('Alta', 'Media', 'Baja') else 'Baja'

        if product_level == 'Alta':
            return 'Alta'
        if product_level == 'Media':
            return 'Alta' if provider_level == 'Alta' else 'Media'
        return 'Baja' if provider_level == 'Baja' else 'Media'

    for p in payments:
        data = p.get('data_json', {})
        week = data.get('week') or _week_from_date(data.get('date'))
        if week is None:
            continue
        week_set.add(week)

        vendor_id = data.get('provider_id')
        provider = provider_index.get(str(vendor_id)) if vendor_id is not None else None
        provider_data = provider.get('data_json', {}) if provider else {}
        vendor_name = (provider_data.get('name') if provider else None) or data.get('provider_name') or 'Sin proveedor'
        vendor_category = _normalize_category(provider_data.get('category') or data.get('provider_category'))
        key = str(vendor_id) if vendor_id is not None else f"name:{vendor_name}"
        vendor_entry = vendor_map.setdefault(key, {
            'vendor_id': vendor_id,
            'vendor_name': vendor_name,
            'vendor_category': vendor_category,
            'weeks': {},
        })
        if not vendor_entry.get('vendor_category'):
            vendor_entry['vendor_category'] = vendor_category

        week_key = str(week)
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
        if payment_status == 'Pagado':
            cell['paid_total'] += payment_amount
        else:
            cell['pending_total'] += payment_amount
        cell['status'] = 'Pagado' if cell['pending_total'] == 0 and cell['paid_total'] > 0 else 'Pendiente'
        provider_category = vendor_category or 'Normal'
        item_categories = []
        items = data.get('items') or []
        for item in items:
            if not isinstance(item, dict):
                continue
            product_id = item.get('product_id')
            product = product_index.get(str(product_id)) if product_id is not None else None
            product_data = product.get('data_json', {}) if product else {}
            product_category = (product_data.get('category') if product else None) or item.get('product_category')
            if product_category:
                item_categories.append(product_category)
            detail = {
                'invoice': item.get('invoice'),
                'product_name': (product_data.get('label') or product_data.get('description') or product_data.get('name')) if product else item.get('product_name'),
                'product_category': _normalize_category(product_category),
                'amount': float(item.get('amount', 0) or item.get('quantity', 0) or 0),
                'status': payment_status,
            }
            cell['details'].append(detail)
        if not item_categories and data.get('product_category'):
            item_categories.append(data.get('product_category'))
        product_category = max_category(item_categories)
        priority = priority_from_categories(provider_category, product_category)
        if priority_rank.get(priority, 0) > priority_rank.get(cell['priority'], 0):
            cell['priority'] = priority

    weeks = sorted(week_set)
    vendors = list(vendor_map.values())
    vendors.sort(key=lambda v: (v.get('vendor_name') or '').lower())
    return {
        'weeks': weeks,
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
