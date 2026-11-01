"""Applies legal-ml-core's migrations. Safe to run on every start.

The package ships its revisions but leaves the Alembic environment to its host,
so `alembic_env/` holds that environment and the revisions come from the package.
"""
import pathlib
import sys
import time

import legal_ml_core
import sqlalchemy
from alembic import command
from alembic.config import Config

from app import database_url

HERE = pathlib.Path(__file__).resolve().parent
PACKAGE_VERSIONS = pathlib.Path(legal_ml_core.__file__).parent / "migrations" / "versions"
WAIT_SECONDS = 60


def alembic_config(url):
    config = Config()
    config.set_main_option("script_location", str(HERE / "alembic_env"))
    config.set_main_option("version_locations", str(PACKAGE_VERSIONS))
    # % is ConfigParser's interpolation character, and passwords can contain it.
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def wait_for_database(url, wait_seconds=WAIT_SECONDS):
    engine = sqlalchemy.create_engine(url)
    deadline = time.monotonic() + wait_seconds
    try:
        while True:
            try:
                with engine.connect():
                    return
            except sqlalchemy.exc.OperationalError:
                if time.monotonic() >= deadline:
                    raise
                print("Waiting for the database...", file=sys.stderr, flush=True)
                time.sleep(2)
    finally:
        engine.dispose()


def upgrade(url):
    command.upgrade(alembic_config(url), "head")


if __name__ == "__main__":
    url = database_url()
    wait_for_database(url)
    upgrade(url)
