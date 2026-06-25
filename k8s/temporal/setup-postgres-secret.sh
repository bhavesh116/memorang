#!/usr/bin/env bash
# Create Temporal Postgres secret from LANGGRAPH_POSTGRES_URL in Doppler.
#
# Usage:
#   DOPPLER_PROJECT=memorang DOPPLER_CONFIG=prd_backend ./k8s/temporal/setup-postgres-secret.sh
#
# Requires: doppler login, kubectl

set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-memorang}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd_backend}"
SECRET_FILE="$(cd "$(dirname "$0")" && pwd)/postgres-secret.yaml"

if ! doppler me >/dev/null 2>&1; then
  echo "Run: doppler login"
  exit 1
fi

URL="$(doppler secrets get LANGGRAPH_POSTGRES_URL --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --plain)"

python3 - <<'PY' "$URL" "$SECRET_FILE"
import sys
from urllib.parse import urlparse, unquote

url = sys.argv[1]
out = sys.argv[2]
parsed = urlparse(url)
if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
    raise SystemExit(f"Invalid LANGGRAPH_POSTGRES_URL: {url}")

host = parsed.hostname
port = str(parsed.port or 5432)
user = unquote(parsed.username or "postgres")
password = unquote(parsed.password or "")

content = f"""apiVersion: v1
kind: Secret
metadata:
  name: memorang-temporal-postgres-secret
type: Opaque
stringData:
  POSTGRES_HOST: "{host}"
  POSTGRES_PORT: "{port}"
  POSTGRES_USER: "{user}"
  POSTGRES_PASSWORD: "{password}"
"""

with open(out, "w") as f:
    f.write(content)
print(f"Wrote {out}")
PY

chmod 600 "$SECRET_FILE"
kubectl apply -f "$SECRET_FILE"
echo "Applied memorang-temporal-postgres-secret"
