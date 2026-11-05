"""The ML service: legal-ml-core mounted as a service of its own.

The platform signs one short-lived token per forwarded request, and the token's
subject owns the data, so this service has no users table and no login.
"""
import logging
import os

import redis
from flask import Flask, jsonify, request
from legal_ml_core import db, init_ml_feature
from sqlalchemy import text

DEFAULT_SECRET_FILE = "/run/ml-secret/secret"
DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

logger = logging.getLogger(__name__)


def required_env(name):
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def database_url():
    # SQLAlchemy's default driver for a bare postgresql:// is not the one
    # legal-ml-core installs.
    url = required_env("DATABASE_URL")
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def redis_url():
    return required_env("REDIS_URL")


def model_storage_path():
    return os.environ.get("MODEL_STORAGE_PATH", "/app/models")


def check_database():
    db.session.execute(text("SELECT 1"))


def check_redis(client):
    client.ping()


def create_app():
    app = Flask(__name__)
    # The package's collection routes end in a slash and the platform's
    # operations do not. A redirect would not survive the proxy.
    app.url_map.strict_slashes = False
    app.config.update(
        SQLALCHEMY_DATABASE_URI=database_url(),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True},
        AUTH_MODE="platform",
        PROJECT_SCOPE="package_table",
        LEGAL_ML_PLATFORM_SECRET=os.environ.get("LEGAL_ML_PLATFORM_SECRET", ""),
        LEGAL_ML_PLATFORM_SECRET_FILE=os.environ.get(
            "LEGAL_ML_PLATFORM_SECRET_FILE", DEFAULT_SECRET_FILE
        ),
        MAX_CONTENT_LENGTH=int(
            os.environ.get("MAX_CONTENT_LENGTH", DEFAULT_MAX_UPLOAD_BYTES)
        ),
        UPLOAD_FOLDER=os.environ.get("UPLOAD_FOLDER", "/app/data"),
    )

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(model_storage_path(), exist_ok=True)

    # No socket_timeout: predict blocks on Redis for up to 120s.
    redis_client = redis.Redis.from_url(
        redis_url(), decode_responses=True, socket_connect_timeout=2
    )
    db.init_app(app)
    init_ml_feature(app, redis_client, model_storage_path=model_storage_path())

    @app.before_request
    def refuse_oversized_uploads():
        # The package's upload route turns Flask's own 413 into a 500.
        limit = app.config["MAX_CONTENT_LENGTH"]
        if request.content_length is not None and request.content_length > limit:
            return jsonify(error="That file is too large."), 413

    @app.get("/health")
    def health():
        """200 when the database and Redis both answer, otherwise 503."""
        checks = {}
        for name, check in (
            ("database", check_database),
            ("redis", lambda: check_redis(redis_client)),
        ):
            try:
                check()
                checks[name] = "ok"
            except Exception:
                # Unauthenticated, so the reason goes to the log only.
                logger.exception("health check failed: %s", name)
                db.session.rollback()
                checks[name] = "error"
        healthy = all(status == "ok" for status in checks.values())
        return jsonify(status="ok" if healthy else "error", **checks), (
            200 if healthy else 503
        )

    return app
