from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os


def create_app():
    load_dotenv()

    app = Flask(__name__, static_folder='static', template_folder='templates')
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret')
    app.config['JWT_EXP_HOURS'] = int(os.getenv('JWT_EXP_HOURS', '8'))
    app.config['DATA_DIR'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

    from blueprint.auth import auth_bp
    from blueprint.payments import payments_bp
    from blueprint.dashboard import dashboard_bp
    from blueprint.catalogs import catalogs_bp
    from blueprint.users import users_bp
    from blueprint.purchases import purchases_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(purchases_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(catalogs_bp)
    app.register_blueprint(users_bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/admin/db-migrate', methods=['POST'])
    def db_migrate():
        secret = request.headers.get('X-Migrate-Secret', '')
        expected = os.getenv('MIGRATE_SECRET', '')
        if not expected or secret != expected:
            return jsonify({'error': 'Unauthorized'}), 401
        from blueprint.storage import migrate_old_tables_to_new
        try:
            summary = migrate_old_tables_to_new()
            return jsonify({'ok': True, 'summary': summary}), 200
        except Exception as exc:
            return jsonify({'ok': False, 'error': str(exc)}), 500

    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
