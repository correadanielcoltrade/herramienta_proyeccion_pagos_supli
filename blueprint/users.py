from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash
from blueprint.storage import load_records, save_records, next_id, utc_now_iso
from blueprint.security import auth_required


users_bp = Blueprint('users', __name__)


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


def _sanitize_user(user):
    data = user.get('data_json', {})
    return {
        'id': user.get('id'),
        'created_at': user.get('created_at'),
        'updated_at': user.get('updated_at'),
        'data_json': {
            'email': data.get('email'),
            'role': data.get('role', 'USER'),
            'name': data.get('name', ''),
        }
    }


@users_bp.route('/users', methods=['GET'])
@auth_required(['ADMIN'])
def list_users():
    users = load_records('pp_users')
    sanitized = [_sanitize_user(user) for user in users]
    return jsonify(sanitized), 200


@users_bp.route('/users', methods=['POST'])
@auth_required(['ADMIN'])
def create_user():
    payload = request.get_json(silent=True) or {}
    email = (payload.get('email') or '').strip().lower()
    password = (payload.get('password') or '').strip()
    name = (payload.get('name') or '').strip()
    role = (payload.get('role') or 'USER').strip().upper()

    if not email or not password:
        return jsonify({'error': 'Email y password son requeridos'}), 400

    if role not in ['ADMIN', 'USER']:
        role = 'USER'

    users = load_records('pp_users')
    if _find_user_by_email(users, email):
        return jsonify({'error': 'Email ya registrado'}), 409

    new_user = {
        'id': next_id(users),
        'created_at': utc_now_iso(),
        'updated_at': utc_now_iso(),
        'data_json': {
            'email': email,
            'password_hash': generate_password_hash(password),
            'role': role,
            'name': name,
        }
    }
    users.append(new_user)
    save_records('pp_users', users)

    return jsonify(_sanitize_user(new_user)), 201


@users_bp.route('/users/<int:user_id>', methods=['PUT'])
@auth_required(['ADMIN'])
def update_user(user_id):
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    email = (payload.get('email') or '').strip().lower()
    role = (payload.get('role') or '').strip().upper()
    password = (payload.get('password') or '').strip()

    users = load_records('pp_users')
    user = _find_user_by_id(users, user_id)
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    if email:
        existing = _find_user_by_email(users, email)
        if existing and existing.get('id') != user.get('id'):
            return jsonify({'error': 'Email ya registrado'}), 409
        user['data_json']['email'] = email

    if name:
        user['data_json']['name'] = name

    if role in ['ADMIN', 'USER']:
        user['data_json']['role'] = role

    if password:
        if len(password) < 6:
            return jsonify({'error': 'La nueva password debe tener al menos 6 caracteres'}), 400
        user['data_json']['password_hash'] = generate_password_hash(password)

    user['updated_at'] = utc_now_iso()
    save_records('pp_users', users)

    return jsonify(_sanitize_user(user)), 200
