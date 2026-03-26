from app import create_app
from blueprint.storage import migrate_json_to_db


def main():
    app = create_app()
    with app.app_context():
        summary = migrate_json_to_db()
    print('Migracion completada.')
    for key, info in summary.items():
        print(f"{key} -> {info['table']}: {info['records']} registros")


if __name__ == '__main__':
    main()
