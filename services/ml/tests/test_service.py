import io
import time
import uuid

import jwt
import pytest
import redis
import sqlalchemy

SECRET = "test-secret-of-a-reasonable-length-for-hs256"


def headers(subject, secret=SECRET, lifetime=30, **claims):
    now = int(time.time())
    token = jwt.encode(
        {"sub": subject, "iat": now, "exp": now + lifetime, **claims}, secret, "HS256"
    )
    return {"Authorization": f"Bearer {token}"}


def upload(client, subject):
    return client.post(
        "/api/datasets/upload",
        headers=headers(subject),
        data={
            "name": "cases",
            "task_type": "classification",
            "file": (io.BytesIO(b"text,label\na,yes\nb,no\n"), "cases.csv"),
        },
        content_type="multipart/form-data",
    )


def tables(url):
    engine = sqlalchemy.create_engine(url)
    try:
        return set(sqlalchemy.inspect(engine).get_table_names())
    finally:
        engine.dispose()


def revision(url):
    engine = sqlalchemy.create_engine(url)
    try:
        with engine.connect() as connection:
            rows = connection.execute(sqlalchemy.text("SELECT version_num FROM alembic_version"))
            return [row[0] for row in rows]
    finally:
        engine.dispose()


def test_migrations_build_an_empty_database(migrated, database_url):
    assert {"datasets", "models", "training_jobs", "ml_projects"} <= tables(database_url)


def test_migrations_leave_a_migrated_database_alone(migrated, database_url):
    import migrate

    before = revision(database_url)
    engine = sqlalchemy.create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            sqlalchemy.text(
                "INSERT INTO ml_projects (id, owner_id, name) VALUES (:id, '1', 'kept')"
            ),
            {"id": str(uuid.uuid4())},
        )
    migrate.upgrade(database_url)
    with engine.connect() as connection:
        count = connection.execute(sqlalchemy.text("SELECT count(*) FROM ml_projects")).scalar()
    engine.dispose()
    assert revision(database_url) == before
    assert count == 1


def test_a_database_url_with_a_percent_in_the_password_is_accepted():
    import migrate

    config = migrate.alembic_config("postgresql://ml:p%40ss@db/ml")
    assert config.get_main_option("sqlalchemy.url") == "postgresql://ml:p%40ss@db/ml"


def test_a_bare_postgres_url_uses_the_installed_driver(monkeypatch):
    import app as service

    monkeypatch.setenv("DATABASE_URL", "postgresql://ml:ml@db/ml")
    assert service.database_url() == "postgresql+psycopg2://ml:ml@db/ml"


def test_health_reports_database_and_redis(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "database": "ok", "redis": "ok"}


def test_health_is_503_when_redis_is_down(client, monkeypatch):
    import app as service

    def down(_client):
        raise redis.ConnectionError("down at 10.0.0.1")

    monkeypatch.setattr(service, "check_redis", down)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.get_json() == {"status": "error", "database": "ok", "redis": "error"}


def test_health_is_503_when_the_database_is_down(client, monkeypatch):
    import app as service

    def down():
        raise sqlalchemy.exc.OperationalError("SELECT 1", {}, Exception("down"))

    monkeypatch.setattr(service, "check_database", down)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.get_json() == {"status": "error", "database": "error", "redis": "ok"}


def test_requests_need_a_platform_token(client):
    assert client.get("/api/datasets").status_code == 401
    assert client.get("/api/datasets", headers=headers("1", secret="x" * 40)).status_code == 401
    assert client.get("/api/datasets", headers=headers("1", lifetime=600)).status_code == 401
    assert client.get("/api/datasets", headers=headers("1")).status_code == 200


def test_the_secret_can_arrive_after_the_service_starts(client, app, tmp_path):
    secret_file = tmp_path / "secret"
    app.config["LEGAL_ML_PLATFORM_SECRET"] = ""
    app.config["LEGAL_ML_PLATFORM_SECRET_FILE"] = str(secret_file)
    assert client.get("/api/datasets", headers=headers("1")).status_code == 503
    secret_file.write_text(SECRET)
    assert client.get("/api/datasets", headers=headers("1")).status_code == 200


def test_each_subject_sees_only_their_own_datasets(client):
    created = upload(client, "1")
    assert created.status_code in (200, 201), created.get_data(as_text=True)
    mine = client.get("/api/datasets", headers=headers("1")).get_data(as_text=True)
    theirs = client.get("/api/datasets", headers=headers("2")).get_data(as_text=True)
    assert "cases" in mine
    assert "cases" not in theirs


def test_a_project_must_exist_in_the_package_table(client, database_url):
    project = str(uuid.uuid4())
    engine = sqlalchemy.create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            sqlalchemy.text(
                "INSERT INTO ml_projects (id, owner_id, name) VALUES (:id, '1', 'mine')"
            ),
            {"id": project},
        )
    engine.dispose()
    path = "/api/annotation/projects/{}/queue/next"
    assert client.get(path.format(project), headers=headers("1")).status_code == 200
    assert client.get(path.format(project), headers=headers("2")).status_code == 404
    assert client.get(path.format(uuid.uuid4()), headers=headers("1")).status_code == 404


def test_llm_routes_are_closed_without_setup(client, app):
    llm_rules = [r for r in app.url_map.iter_rules() if r.rule.startswith("/api/llm")]
    assert llm_rules
    for rule in llm_rules:
        if "GET" not in rule.methods or rule.arguments:
            continue
        response = client.get(rule.rule, headers=headers("1"))
        assert response.status_code < 500, (rule.rule, response.get_data(as_text=True))


def test_uploads_over_the_limit_are_refused(client, app):
    app.config["MAX_CONTENT_LENGTH"] = 10
    assert upload(client, "1").status_code == 413


@pytest.mark.parametrize("name", ["DATABASE_URL", "REDIS_URL"])
def test_missing_settings_stop_the_service(service_env, monkeypatch, name):
    import app as service

    monkeypatch.delenv(name)
    with pytest.raises(RuntimeError, match=name):
        service.create_app()
