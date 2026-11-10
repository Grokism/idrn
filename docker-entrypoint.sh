#!/bin/sh
set -eu

# Start the internal Express + MongoDB API server on 127.0.0.1:3000.
# Only Nginx (:80) is exposed outside the container; Nginx reverse-proxies /api/* to 127.0.0.1:3000.
export API_PORT="${API_PORT:-3000}"
export API_HOST="${API_HOST:-127.0.0.1}"

node /app/server.mjs &

exec nginx -g "daemon off;"
