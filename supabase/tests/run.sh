#!/usr/bin/env bash
# Apply 002-004 to a throwaway local Postgres 16 with the auth stub, then run the SQL tests. Never touches Supabase.
# Usage: supabase/tests/run.sh   (needs Postgres server binaries; run as a non-root user, or as root with sudo -u postgres available)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; bin="${PG_BIN:-/usr/lib/postgresql/16/bin}"
dir="$(mktemp -d)"; chmod 777 "$dir"
as=(); [ "$(id -u)" = 0 ] && as=(sudo -u postgres)
"${as[@]}" "$bin/initdb" -D "$dir/db" -A trust -U postgres >/dev/null
"${as[@]}" "$bin/pg_ctl" -D "$dir/db" -o "-k $dir -p 54329 -c listen_addresses=''" -l "$dir/log" start >/dev/null
trap '"${as[@]}" "$bin/pg_ctl" -D "$dir/db" stop -m fast >/dev/null; rm -rf "$dir"' EXIT
q() { PGOPTIONS="-c client_min_messages=warning" psql -h "$dir" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
q -f "$here/stub.sql"
for m in 002_compete 003_audit_hardening 004_portals_sync; do q -f "$here/../migrations/$m.sql"; done
q -o /dev/null -f "$here/portals.test.sql"
echo "supabase tests: ok"
