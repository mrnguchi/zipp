#!/bin/sh
# Run on an explicitly configured staging Docker host; never source a release manifest.
set -eu
mode=${1:?deploy or rollback required}
runtime=${2:?runtime digest required}
migration=${3:?migration digest required}
: "${EXPECTED_IMAGE_PREFIX:?allowed image namespace required}"
: "${ZIPP_RUNTIME_ENV_FILE:?runtime env file required}"
: "${ZIPP_MIGRATION_ENV_FILE:?migration env file required}"
case "$mode" in deploy|rollback) ;; *) echo 'Invalid deployment mode' >&2; exit 1 ;; esac
case "$runtime" in "$EXPECTED_IMAGE_PREFIX"@sha256:*) ;; *) echo 'Invalid runtime namespace' >&2; exit 1 ;; esac
case "$migration" in "$EXPECTED_IMAGE_PREFIX"-migrate@sha256:*) ;; *) echo 'Invalid migration namespace' >&2; exit 1 ;; esac
printf '%s\n' "$runtime" "$migration" | grep -Eqv '@sha256:[a-f0-9]{64}$' && { echo 'Digest required' >&2; exit 1; }
test -f "$ZIPP_RUNTIME_ENV_FILE"
test -f "$ZIPP_MIGRATION_ENV_FILE"
test "$ZIPP_RUNTIME_ENV_FILE" != "$ZIPP_MIGRATION_ENV_FILE"
export ZIPP_IMAGE="$runtime" ZIPP_MIGRATION_IMAGE="$migration"
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
compose="$directory/compose.staging.yaml"
docker compose -p zipp-staging -f "$compose" config --quiet
docker compose -p zipp-staging -f "$compose" pull api worker migrate
if [ "$mode" = deploy ]; then
  docker compose -p zipp-staging -f "$compose" run --rm --no-deps migrate
else
  : "${ROLLBACK_SCHEMA_COMPATIBLE:?review forward schema compatibility before rollback}"
  test "$ROLLBACK_SCHEMA_COMPATIBLE" = true
fi
# Only compatible application images are rolled back; there is no destructive down migration.
docker compose -p zipp-staging -f "$compose" up -d --no-deps --wait --wait-timeout 120 api worker
