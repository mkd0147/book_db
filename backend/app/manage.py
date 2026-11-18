"""Migration commands: python -m app.manage upgrade | revision MESSAGE."""
import argparse
from pathlib import Path
from alembic import command
from alembic.config import Config
from .db import database_path, make_engine, migrate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['upgrade', 'revision'])
    parser.add_argument('message', nargs='?', default='Schema change')
    args = parser.parse_args()
    engine = make_engine(database_path())
    if args.action == 'upgrade':
        migrate(engine)
    else:
        config = Config()
        config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.revision(config, message=args.message, autogenerate=True)


if __name__ == '__main__':
    main()
