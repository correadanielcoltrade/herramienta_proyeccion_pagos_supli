import os
from datetime import datetime, timedelta, timezone
from functools import wraps
import jwt
from flask import current_app, request, jsonify


def create_token(user):
    exp_hours = current_app.config.get('JWT_EXP_HOURS', 8)
    payload = {
        'sub': str(user['id']),
        'email': user['data_json']['email'],
        'role': user['data_json'].get('role', 'USER'),
        'exp': datetime.now(tz=timezone.utc) + timedelta(hours=exp_hours),
        'iat': datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')


def decode_token(token):
    return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])


def auth_required(roles=None):
    roles = roles or []

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Token requerido'}), 401

            token = auth_header.split(' ', 1)[1].strip()
            try:
                payload = decode_token(token)
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token expirado'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'Token inválido'}), 401

            request.user = {
                'id': payload.get('sub'),
                'email': payload.get('email'),
                'role': payload.get('role', 'USER'),
            }

            if roles and request.user['role'] not in roles:
                return jsonify({'error': 'No autorizado'}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
