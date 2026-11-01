#!/bin/sh
# One image, two roles. The API runs the migrations, so in a compose file the
# worker depends on the API being healthy.
set -e

case "${1:-api}" in
api)
	python migrate.py
	# gthread, because predict waits on Redis for up to 120s and a sync worker
	# would be killed for it. The timeout then only catches a hung process.
	exec gunicorn --bind 0.0.0.0:8001 --worker-class gthread --workers 2 \
		--threads 4 --timeout 180 --access-logfile - "app:create_app()"
	;;
worker)
	exec python worker.py
	;;
*)
	exec "$@"
	;;
esac
