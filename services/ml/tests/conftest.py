import os
import sys
import pathlib

import pytest
import sqlalchemy

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))


@pytest.fixture
def database_url():
    """A throwaway Postgres database, emptied before each test."""
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    engine = sqlalchemy.create_engine(url)
    with engine.begin() as connection:
        connection.execute(sqlalchemy.text("DROP SCHEMA public CASCADE"))
        connection.execute(sqlalchemy.text("CREATE SCHEMA public"))
    engine.dispose()
    return url


@pytest.fixture
def service_env(monkeypatch, tmp_path, database_url):
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:1/0")
    monkeypatch.setenv("LEGAL_ML_PLATFORM_SECRET", "test-secret-of-a-reasonable-length-for-hs256")
    monkeypatch.setenv("MODEL_STORAGE_PATH", str(tmp_path / "models"))
    monkeypatch.setenv("UPLOAD_FOLDER", str(tmp_path / "data"))


@pytest.fixture
def migrated(service_env, database_url):
    import migrate

    migrate.upgrade(database_url)


@pytest.fixture
def app(migrated, monkeypatch):
    import fakeredis
    import redis

    import app as service

    monkeypatch.setattr(
        redis.Redis,
        "from_url",
        lambda *args, **kwargs: fakeredis.FakeStrictRedis(decode_responses=True),
    )
    return service.create_app()


@pytest.fixture
def client(app):
    return app.test_client()
