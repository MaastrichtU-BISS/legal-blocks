# The API and the worker are one image, chosen by the command:
#
#   docker build -t legal-blocks-ml services/ml
#   docker run legal-blocks-ml api
#   docker run legal-blocks-ml worker
#
# Dependencies only: model weights are fetched on first use, into the volumes.
FROM python:3.11-slim

# git, to install legal-ml-core from its tag.
RUN apt-get update && apt-get install -y --no-install-recommends git \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# The CPU build first, because the default one pulls several GB of CUDA.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py worker.py migrate.py entrypoint.sh ./
COPY alembic_env ./alembic_env

# Same uid as the platform image, so this service can read the platform's
# secret from the volume they share.
RUN adduser --system --uid 10001 --group --home /app app \
	&& mkdir -p /app/models /app/data \
	&& chown -R app:app /app
USER app

ENV HF_HOME=/app/models/.huggingface

EXPOSE 8001
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["api"]
