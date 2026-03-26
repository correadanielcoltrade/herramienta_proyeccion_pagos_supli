import time

_CACHE = {}


def get_cached(key):
    entry = _CACHE.get(key)
    if not entry:
        return None
    value, expires_at = entry
    if time.time() > expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def set_cached(key, value, ttl=30):
    _CACHE[key] = (value, time.time() + ttl)


def invalidate_cache(prefix=None):
    if prefix is None:
        _CACHE.clear()
        return
    keys = [k for k in _CACHE.keys() if k.startswith(prefix)]
    for k in keys:
        _CACHE.pop(k, None)
