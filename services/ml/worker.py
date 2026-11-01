"""The ML worker: legal-ml-core's queue consumers, from the same image as the API."""
from legal_ml_core import run_ml_worker

from app import database_url, model_storage_path, redis_url

if __name__ == "__main__":
    run_ml_worker(redis_url(), database_url(), model_storage_path())
