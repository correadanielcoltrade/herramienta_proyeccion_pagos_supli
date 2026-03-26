import json
import os
from datetime import datetime
from flask import current_app

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor, execute_values, Json
except Exception:
    psycopg2 = None
    RealDictCursor = None
    execute_values = None
    Json = None

DATA_FILES = {
    'pp_users': 'pp_users.json',
    'pp_payments': 'pp_payments.json',
    'pp_providers': 'pp_providers.json',
    'pp_products': 'pp_products.json',
    'pp_brands': 'pp_brands.json',
    'pp_logs': 'pp_logs.json',
}

DB_TABLES = {
    'pp_users': 'pp_users',
    'pp_payments': 'pp_payments',
    'pp_providers': 'pp_providers',
    'pp_products': 'pp_products',
    'pp_brands': 'pp_brands',
    'pp_logs': 'pp_logs',
}

_TABLE_RESOLUTION = {}


def _data_path(file_key):
    base_dir = current_app.config['DATA_DIR']
    os.makedirs(base_dir, exist_ok=True)
    return os.path.join(base_dir, DATA_FILES[file_key])


def _db_config():
    url = os.getenv('DATABASE_URL')
    if url:
        return {
            'url': url,
            'sslmode': os.getenv('DB_SSLMODE') or None,
        }

    host = os.getenv('DB_HOST')
    name = os.getenv('DB_NAME')
    user = os.getenv('DB_USER')
    password = os.getenv('DB_PASSWORD')
    port = os.getenv('DB_PORT') or '5432'
    sslmode = os.getenv('DB_SSLMODE') or 'require'

    if not (host and name and user and password):
        return None

    return {
        'host': host,
        'name': name,
        'user': user,
        'password': password,
        'port': port,
        'sslmode': sslmode,
    }


def _db_enabled():
    return _db_config() is not None


def _db_table_prefix():
    prefix = os.getenv('DB_TABLE_PREFIX') or 'proyeccionpagossupli'
    prefix = prefix.strip()
    # Sanitize to avoid invalid identifiers.
    prefix = ''.join(ch for ch in prefix if ch.isalnum() or ch == '_')
    if prefix and not prefix.endswith('_'):
        prefix = f"{prefix}_"
    return prefix


def _db_connect():
    if not _db_enabled():
        return None
    if psycopg2 is None:
        raise RuntimeError('psycopg2 is required for database storage but is not installed.')
    config = _db_config()
    if 'url' in config:
        sslmode = config.get('sslmode')
        if sslmode:
            conn = psycopg2.connect(config['url'], sslmode=sslmode)
        else:
            conn = psycopg2.connect(config['url'])
    else:
        conn = psycopg2.connect(
            dbname=config['name'],
            user=config['user'],
            password=config['password'],
            host=config['host'],
            port=config['port'],
            sslmode=config['sslmode'],
        )
    conn.autocommit = False
    return conn


def _db_table(file_key):
    return f"{_db_table_prefix()}{DB_TABLES[file_key]}"


def _table_candidates(file_key):
    base = DB_TABLES[file_key]
    prefix = _db_table_prefix()
    if not prefix:
        return [base]
    return [f"{prefix}{base}", base]


def _resolve_table(file_key, conn):
    cached = _TABLE_RESOLUTION.get(file_key)
    if cached:
        return cached

    candidates = _table_candidates(file_key)
    if len(candidates) == 1:
        _TABLE_RESOLUTION[file_key] = candidates[0]
        return candidates[0]

    prefixed, fallback = candidates[0], candidates[1]
    prefixed_exists = False
    fallback_exists = False
    prefixed_count = 0
    fallback_count = 0

    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass(%s)", (prefixed,))
        prefixed_exists = cur.fetchone()[0] is not None
        cur.execute("SELECT to_regclass(%s)", (fallback,))
        fallback_exists = cur.fetchone()[0] is not None

        if prefixed_exists:
            cur.execute(f"SELECT COUNT(*) FROM {prefixed}")
            prefixed_count = cur.fetchone()[0]
        if fallback_exists:
            cur.execute(f"SELECT COUNT(*) FROM {fallback}")
            fallback_count = cur.fetchone()[0]

    if prefixed_exists and prefixed_count > 0:
        chosen = prefixed
    elif fallback_exists and fallback_count > 0:
        chosen = fallback
    elif prefixed_exists:
        chosen = prefixed
    elif fallback_exists:
        chosen = fallback
    else:
        chosen = prefixed

    _TABLE_RESOLUTION[file_key] = chosen
    return chosen


def _ensure_table(conn, table_name):
    with conn.cursor() as cur:
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                updated_at TEXT,
                data_json JSONB
            )
            """
        )
    conn.commit()


def _deserialize_json(value):
    if value is None:
        return {}
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {}
    return {}


def _ensure_file(path, default_value):
    if not os.path.exists(path):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(default_value, f, ensure_ascii=False, indent=2)


def _load_json_records(file_key, default_value=None):
    if default_value is None:
        default_value = []
    path = _data_path(file_key)
    if not os.path.exists(path):
        return default_value
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_records(file_key, default_value=None):
    if default_value is None:
        default_value = []
    if _db_enabled():
        conn = _db_connect()
        try:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT id, created_at, updated_at, data_json FROM {table_name} ORDER BY id"
                )
                rows = cur.fetchall() or []
            conn.commit()
        finally:
            conn.close()

        records = []
        for row in rows:
            records.append({
                'id': row.get('id'),
                'created_at': row.get('created_at'),
                'updated_at': row.get('updated_at'),
                'data_json': _deserialize_json(row.get('data_json')),
            })
        return records if records else default_value

    path = _data_path(file_key)
    _ensure_file(path, default_value)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_records(file_key, records):
    if _db_enabled():
        conn = _db_connect()
        try:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor() as cur:
                cur.execute(f"DELETE FROM {table_name}")
                if records:
                    rows = []
                    for record in records:
                        rows.append((
                            record.get('id'),
                            record.get('created_at'),
                            record.get('updated_at'),
                            Json(record.get('data_json') or {}),
                        ))
                    execute_values(
                        cur,
                        f"INSERT INTO {table_name} (id, created_at, updated_at, data_json) VALUES %s",
                        rows,
                    )
            conn.commit()
        finally:
            conn.close()
        return

    path = _data_path(file_key)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def migrate_json_to_db():
    if not _db_enabled():
        raise RuntimeError('DB config missing. Set DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (or DATABASE_URL).')
    summary = {}
    for file_key in DATA_FILES.keys():
        records = _load_json_records(file_key, default_value=[])
        save_records(file_key, records)
        summary[file_key] = {
            'table': _db_table(file_key),
            'records': len(records),
        }
    return summary


def next_id(records):
    if not records:
        return 1
    return max(r.get('id', 0) for r in records) + 1


def utc_now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
