# ML service

`legal-ml-core` as a service of its own: the Flask API and the worker that a Legal
Blocks export starts when it includes the ML module. One image holds both, as
`api` and `worker` commands.

It lives here rather than in its own repo because it has no contributors of its
own, and because this way its image is released with the platform, under the
platform's version.

The service has no login. The platform signs one HS256 token per forwarded
request, and the token's `sub` owns the data. Never publish the port in an export.

| Setting | Default | |
|---|---|---|
| `DATABASE_URL` | required | Postgres |
| `REDIS_URL` | required | |
| `LEGAL_ML_PLATFORM_SECRET_FILE` | `/run/ml-secret/secret` | Read on each request, so the platform can write it after this service starts |
| `LEGAL_ML_PLATFORM_SECRET` | | The secret itself. Wins over the file |
| `MAX_CONTENT_LENGTH` | 100 MB | Upload limit, in bytes |
| `MODEL_STORAGE_PATH` | `/app/models` | Keep on a volume |
| `UPLOAD_FOLDER` | `/app/data` | Keep on a volume |

`GET /health` needs no token and answers 200 when Postgres and Redis both respond,
503 otherwise. It does not cover the worker.

The API applies `legal-ml-core`'s migrations on every start. An up-to-date database
is left as it is.

The LLM routes are mounted, but stay off without setup. With no `FEATURE_GATE`
nobody gets the shared key, and users' own keys need `LLM_ENCRYPTION_KEY`.

To upgrade `legal-ml-core`, change the tag in `requirements.txt`.

## Tests

The tests need Postgres, and they drop what is in it. Point `TEST_DATABASE_URL` at
a throwaway database, never a real one:

```sh
docker build -t legal-blocks-ml services/ml
docker run --rm -v "$PWD/services/ml:/src:ro" -w /src --entrypoint sh \
  -e TEST_DATABASE_URL=postgresql+psycopg2://... -e PYTHONDONTWRITEBYTECODE=1 legal-blocks-ml \
  -c "pip install -q --target /tmp/t pytest fakeredis && PYTHONPATH=/tmp/t python -m pytest -p no:cacheprovider tests"
```
