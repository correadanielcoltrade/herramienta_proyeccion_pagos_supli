from flask import Flask, render_template
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

    app.register_blueprint(auth_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(catalogs_bp)
    app.register_blueprint(users_bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
