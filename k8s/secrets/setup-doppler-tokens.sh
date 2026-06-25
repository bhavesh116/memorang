#!/usr/bin/env bash
# Create Doppler service tokens and apply them as a Kubernetes secret.
#
# Memorang uses separate Doppler configs per service:
#   prd_frontend, prd_backend, prd_worker
#
# Prerequisites:
#   doppler login
#   kubectl configured for your cluster
#
# Usage:
#   ./k8s/secrets/setup-doppler-tokens.sh
#
# Optional overrides:
#   DOPPLER_PROJECT     Doppler project slug (default: memorang)
#   FRONTEND_CONFIG     Doppler config for frontend (default: prd_frontend)
#   BACKEND_CONFIG      Doppler config for backend (default: prd_backend)
#   WORKER_CONFIG       Doppler config for worker (default: prd_worker)
#   K8S_NAMESPACE       Kubernetes namespace (default: default)
#   APPLY_TO_CLUSTER    Set to 0 to only write the local secret file (default: 1)

set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-memorang}"
FRONTEND_CONFIG="${FRONTEND_CONFIG:-prd_frontend}"
BACKEND_CONFIG="${BACKEND_CONFIG:-prd_backend}"
WORKER_CONFIG="${WORKER_CONFIG:-prd_worker}"
K8S_NAMESPACE="${K8S_NAMESPACE:-default}"
APPLY_TO_CLUSTER="${APPLY_TO_CLUSTER:-1}"
SECRET_FILE="$(cd "$(dirname "$0")" && pwd)/doppler-tokens.yaml"

if ! doppler me >/dev/null 2>&1; then
  echo "Doppler CLI is not authenticated. Run: doppler login"
  exit 1
fi

create_token() {
  local name="$1"
  local config="$2"
  doppler configs tokens create "$name" \
    --project "$DOPPLER_PROJECT" \
    --config "$config" \
    --access read \
    --plain
}

echo "Creating service tokens in project=${DOPPLER_PROJECT} ..."

FRONTEND_TOKEN="$(create_token "k8s-memorang-frontend" "$FRONTEND_CONFIG")"
BACKEND_TOKEN="$(create_token "k8s-memorang-backend" "$BACKEND_CONFIG")"
WORKER_TOKEN="$(create_token "k8s-memorang-worker" "$WORKER_CONFIG")"

cat >"$SECRET_FILE" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: doppler-tokens
  namespace: ${K8S_NAMESPACE}
type: Opaque
stringData:
  FRONTEND_DOPPLER_TOKEN: "${FRONTEND_TOKEN}"
  BACKEND_DOPPLER_TOKEN: "${BACKEND_TOKEN}"
  WORKER_DOPPLER_TOKEN: "${WORKER_TOKEN}"
EOF

chmod 600 "$SECRET_FILE"
echo "Wrote ${SECRET_FILE}"

if [[ "$APPLY_TO_CLUSTER" == "1" ]]; then
  kubectl apply -f "$SECRET_FILE"
  echo "Applied secret doppler-tokens to namespace ${K8S_NAMESPACE}"
else
  echo "Skipped kubectl apply (APPLY_TO_CLUSTER=0)"
fi

echo "Done."
