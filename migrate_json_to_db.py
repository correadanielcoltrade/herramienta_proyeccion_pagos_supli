from app import create_app
from blueprint.storage import migrate_json_to_db, migrate_old_tables_to_new


def main():
    app = create_app()
    with app.app_context():
        print('=== Paso 1: Migrando datos JSON -> tablas correctas ===')
        summary = migrate_json_to_db()
        for key, info in summary.items():
            print(f"  {key} -> {info['table']}: {info['records']} registros")

        print('\n=== Paso 2: Limpiando tablas antiguas (proyeccionpagossupli_pp_*) ===')
        old_summary = migrate_old_tables_to_new()
        for key, info in old_summary.items():
            migrado = f"migrados={info['migrated']}" if info['migrated'] > 0 else 'sin datos que migrar'
            eliminada = 'eliminada' if info['dropped_old'] else 'no existia'
            print(f"  {info['old_table']}: {migrado}, tabla vieja={eliminada}")

    print('\nMigracion completada.')


if __name__ == '__main__':
    main()
