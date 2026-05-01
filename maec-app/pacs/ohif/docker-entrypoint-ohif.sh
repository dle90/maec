#!/bin/sh
set -e

# Default to docker-compose internal hostname if not set
: "${ORTHANC_BACKEND_URL:=http://orthanc:8042}"

# Substitute ORTHANC_BACKEND_URL into the nginx config template
# Using explicit variable list prevents envsubst from mangling nginx's own $variables
envsubst '${ORTHANC_BACKEND_URL}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
