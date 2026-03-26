from datetime import datetime, timedelta, timezone
import secrets
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from blueprint.storage import load_records, save_records, next_id, utc_now_iso
from blueprint.security import create_token, decode_token, auth_required


auth_bp = Blueprint('auth', __name__)


def _find_user_by_email(users, email):
    email_l = email.strip().lower()
    for user in users:
        if user['data_json']['email'].lower() == email_l:
            return user
    return None


def _find_user_by_id(users, user_id):
    user_id_str = str(user_id)
    for user in users:
        if str(user.get('id')) == user_id_str:
            return user
    return None


def _utc_iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _parse_utc_iso(value):
    if not value:
        return None
    try:
        if isinstance(value, str) and value.endswith('Z'):
            value = value[:-1] + '+00:00'
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _generate_reset_code():
    return f"{secrets.randbelow(1000000):06d}"


@auth_bp.route('/register', methods=['POST'])
def register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get('email') or '').strip().lower()
    password = (payload.get('password') or '').strip()
    name = (payload.get('name') or '').strip()
    requested_role = (payload.get('role') or 'USER').strip().upper()

    if not email or not password:
        return jsonify({'error': 'Email y password son requeridos'}), 400

    users = load_records('pp_users')
    if _find_user_by_email(users, email):
        return jsonify({'error': 'Email ya registrado'}), 409

    allow_role = 'USER'
    if not users:
        allow_role = requested_role if requested_role in ['ADMIN', 'USER'] else 'ADMIN'
    else:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1].strip()
            try:
                payload_token = decode_token(token)
                if payload_token.get('role') == 'ADMIN':
                    allow_role = requested_role if requested_role in ['ADMIN', 'USER'] else 'USER'
            except Exception:
                allow_role = 'USER'

    new_user = {
        'id': next_id(users),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'email': email,
            'password_hash': generate_password_hash(password),
            'role': allow_role,
            'name': name,
        }
    }
    users.append(new_user)
    save_records('pp_users', users)

    token = create_token(new_user)
    return jsonify({'token': token, 'role': allow_role}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get('email') or '').strip().lower()
    password = (payload.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email y password son requeridos'}), 400

    users = load_records('pp_users')
    user = _find_user_by_email(users, email)
    if not user:
        return jsonify({'error': 'Credenciales inválidas'}), 401

    if not check_password_hash(user['data_json']['password_hash'], password):
        return jsonify({'error': 'Credenciales inválidas'}), 401

    token = create_token(user)
    return jsonify({'token': token, 'role': user['data_json'].get('role', 'USER')}), 200


@auth_bp.route('/change-password', methods=['POST'])
@auth_required()
def change_password():
    payload = request.get_json(silent=True) or {}
    current_password = (payload.get('current_password') or '').strip()
    new_password = (payload.get('new_password') or '').strip()

    if not current_password or not new_password:
        return jsonify({'error': 'Password actual y nueva son requeridos'}), 400

    if len(new_password) < 6:
        return jsonify({'error': 'La nueva password debe tener al menos 6 caracteres'}), 400

    users = load_records('pp_users')
    user = _find_user_by_id(users, request.user.get('id'))
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    if not check_password_hash(user['data_json']['password_hash'], current_password):
        return jsonify({'error': 'Password actual incorrecta'}), 401

    user['data_json']['password_hash'] = generate_password_hash(new_password)
    user['updated_at'] = utc_now_iso()
    user['data_json'].pop('reset_code', None)
    user['data_json'].pop('reset_expires_at', None)
    user['data_json'].pop('reset_requested_at', None)
    save_records('pp_users', users)

    return jsonify({'message': 'Password actualizada'}), 200


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    payload = request.get_json(silent=True) or {}
    email = (payload.get('email') or '').strip().lower()

    if not email:
        return jsonify({'error': 'Email es requerido'}), 400

    users = load_records('pp_users')
    user = _find_user_by_email(users, email)
    reset_code = None
    if user:
        reset_code = _generate_reset_code()
        now = datetime.now(tz=timezone.utc)
        user['data_json']['reset_code'] = reset_code
        user['data_json']['reset_requested_at'] = _utc_iso(now)
        user['data_json']['reset_expires_at'] = _utc_iso(now + timedelta(minutes=15))
        user['updated_at'] = utc_now_iso()
        save_records('pp_users', users)

    return jsonify({
        'message': 'Si el email existe, se generó un código de recuperación.',
        'reset_code': reset_code
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    payload = request.get_json(silent=True) or {}
    email = (payload.get('email') or '').strip().lower()
    reset_code = (payload.get('reset_code') or '').strip()
    new_password = (payload.get('new_password') or '').strip()

    if not email or not reset_code or not new_password:
        return jsonify({'error': 'Email, código y nueva password son requeridos'}), 400

    if len(new_password) < 6:
        return jsonify({'error': 'La nueva password debe tener al menos 6 caracteres'}), 400

    users = load_records('pp_users')
    user = _find_user_by_email(users, email)
    if not user:
        return jsonify({'error': 'Código inválido o expirado'}), 400

    stored_code = (user['data_json'].get('reset_code') or '').strip()
    expires_at = _parse_utc_iso(user['data_json'].get('reset_expires_at'))
    now = datetime.now(tz=timezone.utc)

    if stored_code != reset_code:
        return jsonify({'error': 'Código inválido o expirado'}), 400

    if not expires_at or expires_at < now:
        return jsonify({'error': 'Código inválido o expirado'}), 400

    user['data_json']['password_hash'] = generate_password_hash(new_password)
    user['updated_at'] = utc_now_iso()
    user['data_json'].pop('reset_code', None)
    user['data_json'].pop('reset_expires_at', None)
    user['data_json'].pop('reset_requested_at', None)
    save_records('pp_users', users)

    return jsonify({'message': 'Password restablecida'}), 200
