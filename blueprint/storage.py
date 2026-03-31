import json
import os
import threading
from contextlib import contextmanager
from datetime import datetime
from flask import current_app

try:
    import psycopg2
    from psycopg2 import pool as pg_pool
    from psycopg2.extras import RealDictCursor, execute_values, Json
except Exception:
    psycopg2 = None
    pg_pool = None
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
    'pp_users': 'users',
    'pp_payments': 'payments',
    'pp_providers': 'providers',
    'pp_products': 'products',
    'pp_brands': 'brands',
    'pp_logs': 'logs',
}

_TABLE_RESOLUTION = {}
_ensured_tables = set()   # tables whose DDL has already been confirmed this process
_pool = None
_pool_lock = threading.Lock()


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
    prefix = ''.join(ch for ch in prefix if ch.isalnum() or ch == '_')
    if prefix and not prefix.endswith('_'):
        prefix = f"{prefix}_"
    return prefix


# ---------------------------------------------------------------------------
# Connection pool — created once per process, reused across all requests.
# Eliminates the TCP+TLS handshake overhead that was occurring on every call.
# ---------------------------------------------------------------------------

def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is not None:
            return _pool
        if not _db_enabled() or pg_pool is None:
            return None
        config = _db_config()
        min_conn, max_conn = 1, 10
        if 'url' in config:
            kwargs = {}
            if config.get('sslmode'):
                kwargs['sslmode'] = config['sslmode']
            new_pool = pg_pool.ThreadedConnectionPool(min_conn, max_conn, config['url'], **kwargs)
        else:
            new_pool = pg_pool.ThreadedConnectionPool(
                min_conn, max_conn,
                dbname=config['name'],
                user=config['user'],
                password=config['password'],
                host=config['host'],
                port=config['port'],
                sslmode=config['sslmode'],
            )
        _pool = new_pool
        return _pool


@contextmanager
def _db_conn():
    """Obtain a connection from the pool, commit on success, rollback on error."""
    pool = _get_pool()
    if pool is None:
        raise RuntimeError('DB not configured or psycopg2 not installed.')
    conn = pool.getconn()
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        pool.putconn(conn)


# Legacy direct-connect — kept only for infrequent migration utilities.
def _db_connect():
    if not _db_enabled():
        return None
    if psycopg2 is None:
        raise RuntimeError('psycopg2 is required for database storage but is not installed.')
    config = _db_config()
    if 'url' in config:
        sslmode = config.get('sslmode')
        conn = psycopg2.connect(config['url'], sslmode=sslmode) if sslmode else psycopg2.connect(config['url'])
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
    """Create table if needed. Result is cached per process — DDL runs at most once."""
    if table_name in _ensured_tables:
        return
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
    _ensured_tables.add(table_name)


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


def _row_to_record(row):
    return {
        'id': row['id'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        'data_json': _deserialize_json(row['data_json']),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_records(file_key, default_value=None):
    """Load all records for a collection."""
    if default_value is None:
        default_value = []
    if _db_enabled():
        with _db_conn() as conn:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT id, created_at, updated_at, data_json FROM {table_name} ORDER BY id"
                )
                rows = cur.fetchall() or []
        records = [_row_to_record(r) for r in rows]
        return records if records else default_value

    path = _data_path(file_key)
    _ensure_file(path, default_value)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_records(file_key, records):
    """Replace an entire collection (full table rewrite)."""
    if _db_enabled():
        with _db_conn() as conn:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor() as cur:
                cur.execute(f"DELETE FROM {table_name}")
                if records:
                    rows = [
                        (
                            r.get('id'),
                            r.get('created_at'),
                            r.get('updated_at'),
                            Json(r.get('data_json') or {}),
                        )
                        for r in records
                    ]
                    execute_values(
                        cur,
                        f"INSERT INTO {table_name} (id, created_at, updated_at, data_json) VALUES %s",
                        rows,
                    )
        return

    path = _data_path(file_key)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def load_record(file_key, record_id):
    """Load a single record by ID — avoids a full table scan."""
    if _db_enabled():
        with _db_conn() as conn:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT id, created_at, updated_at, data_json FROM {table_name} WHERE id = %s",
                    (record_id,),
                )
                row = cur.fetchone()
        return _row_to_record(row) if row else None

    records = _load_json_records(file_key, default_value=[])
    for r in records:
        if str(r.get('id')) == str(record_id):
            return r
    return None


def save_record(file_key, record):
    """Upsert a single record — avoids rewriting the entire table."""
    if _db_enabled():
        with _db_conn() as conn:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {table_name} (id, created_at, updated_at, data_json)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        updated_at = EXCLUDED.updated_at,
                        data_json  = EXCLUDED.data_json
                    """,
                    (
                        record.get('id'),
                        record.get('created_at'),
                        record.get('updated_at'),
                        Json(record.get('data_json') or {}),
                    ),
                )
        return

    # JSON file fallback: load all, upsert in-memory, write back
    records = _load_json_records(file_key, default_value=[])
    found = False
    for i, r in enumerate(records):
        if str(r.get('id')) == str(record.get('id')):
            records[i] = record
            found = True
            break
    if not found:
        records.append(record)
    path = _data_path(file_key)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def next_id_db(file_key):
    """Get the next available integer ID without loading all records."""
    if _db_enabled():
        with _db_conn() as conn:
            table_name = _resolve_table(file_key, conn)
            _ensure_table(conn, table_name)
            with conn.cursor() as cur:
                cur.execute(f"SELECT COALESCE(MAX(id), 0) + 1 FROM {table_name}")
                return cur.fetchone()[0]

    records = _load_json_records(file_key, default_value=[])
    return next_id(records)


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


def migrate_old_tables_to_new():
    """Migra datos de tablas antiguas (proyeccionpagossupli_pp_*) a las correctas
    (proyeccionpagossupli_*) y elimina las tablas antiguas."""
    if not _db_enabled():
        raise RuntimeError('DB config missing.')

    prefix = _db_table_prefix()
    old_names = {
        'pp_users':     f'{prefix}pp_users',
        'pp_payments':  f'{prefix}pp_payments',
        'pp_providers': f'{prefix}pp_providers',
        'pp_products':  f'{prefix}pp_products',
        'pp_brands':    f'{prefix}pp_brands',
        'pp_logs':      f'{prefix}pp_logs',
    }

    summary = {}
    conn = _db_connect()
    try:
        for file_key, old_table in old_names.items():
            new_table = f'{prefix}{DB_TABLES[file_key]}'
            result = {'old_table': old_table, 'new_table': new_table,
                      'old_records': 0, 'migrated': 0, 'dropped_old': False}

            with conn.cursor() as cur:
                cur.execute('SELECT to_regclass(%s)', (old_table,))
                old_exists = cur.fetchone()[0] is not None

            if old_exists:
                with conn.cursor() as cur:
                    cur.execute(f'SELECT COUNT(*) FROM {old_table}')
                    result['old_records'] = cur.fetchone()[0]

            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {new_table} (
                        id INTEGER PRIMARY KEY,
                        created_at TEXT,
                        updated_at TEXT,
                        data_json JSONB
                    )
                    """
                )
            conn.commit()

            with conn.cursor() as cur:
                cur.execute(f'SELECT COUNT(*) FROM {new_table}')
                new_count = cur.fetchone()[0]

            if old_exists and result['old_records'] > 0 and new_count == 0:
                with conn.cursor() as cur:
                    cur.execute(
                        f'INSERT INTO {new_table} (id, created_at, updated_at, data_json) '
                        f'SELECT id, created_at, updated_at, data_json FROM {old_table}'
                    )
                    result['migrated'] = cur.rowcount
                conn.commit()

            if old_exists:
                with conn.cursor() as cur:
                    cur.execute(f'DROP TABLE IF EXISTS {old_table}')
                conn.commit()
                result['dropped_old'] = True

            _TABLE_RESOLUTION.pop(file_key, None)
            summary[file_key] = result
    finally:
        conn.close()

    return summary


def next_id(records):
    if not records:
        return 1
    return max(r.get('id', 0) for r in records) + 1


def utc_now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
