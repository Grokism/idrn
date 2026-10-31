#!/bin/bash
# Build, push, and deploy this static SPA to a Kubernetes cluster.
# This app has NO secrets, so there is no secret bundle to create.
set -euo pipefail

# --- Config (override via env) ---
IMAGE="${IMAGE:-ghcr.io/grokism/idrn-fe:latest}"
NAMESPACE="${NAMESPACE:-bookins-paas}"
APP_SLUG="${APP_SLUG:-idrn}"

echo "==> Building image: ${IMAGE}"
docker build -t "${IMAGE}" .

echo "==> Pushing image: ${IMAGE}"
docker push "${IMAGE}"

echo "==> Applying Kubernetes manifests to namespace: ${NAMESPACE}"
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

echo "==> Restarting rollout"
kubectl -n "${NAMESPACE}" rollout restart deployment/"${APP_SLUG}-fe"

cat <<EOF

Done. The service is available in-cluster at:
  http://${APP_SLUG}-fe.${NAMESPACE}.svc.cluster.local:80

Next: map your public hostname (https://idrn.bookins.io) to that in-cluster service.
If you use Cloudflare Tunnel, add a public hostname in the Cloudflare Zero Trust
dashboard pointing https://idrn.bookins.io -> http://${APP_SLUG}-fe.${NAMESPACE}.svc.cluster.local:80
EOF
