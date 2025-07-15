#!/bin/bash

# --- Configuration ---
export PROJECT_ID="grokweb-419218"
export GKE_CLUSTER="grokism-v2"
export GKE_ZONE="us-central1"
export NAMESPACE="idrn"
export BE_IMAGE_NAME="idrn-be"
export FE_IMAGE_NAME="idrn-fe"
export BE_IMAGE_TAG="gcr.io/${PROJECT_ID}/${BE_IMAGE_NAME}:latest"
export FE_IMAGE_TAG="gcr.io/${PROJECT_ID}/${FE_IMAGE_NAME}:latest"
export BE_CONTEXT_PATH="/home/robert/git/idrn/idrnBe"
export FE_CONTEXT_PATH="/home/robert/git/idrn/idrnFe"
export K8S_MANIFEST_PATH="/home/robert/git/idrn/k8s"
export BE_DEPLOYMENT_NAME="idrn-be-deployment"
export FE_DEPLOYMENT_NAME="idrn-fe-deployment"

# --- Script ---

echo "--- Authenticating with Google Cloud ---"
gcloud auth configure-docker gcr.io

# --- Build and Push Backend Image ---
echo "--- Building backend image: ${BE_IMAGE_TAG} ---"
docker build -t "${BE_IMAGE_TAG}" "${BE_CONTEXT_PATH}"

echo "--- Pushing backend image: ${BE_IMAGE_TAG} ---"
docker push "${BE_IMAGE_TAG}"

# --- Build and Push Frontend Image ---
echo "--- Building frontend image: ${FE_IMAGE_TAG} ---"
docker build -t "${FE_IMAGE_TAG}" "${FE_CONTEXT_PATH}"

echo "--- Pushing frontend image: ${FE_IMAGE_TAG} ---"
docker push "${FE_IMAGE_TAG}"

# --- Deploy to GKE ---
echo "--- Connecting to GKE cluster: ${GKE_CLUSTER} ---"
gcloud container clusters get-credentials "${GKE_CLUSTER}" --zone "${GKE_ZONE}" --project "${PROJECT_ID}"

echo "--- Applying all Kubernetes manifests from '${K8S_MANIFEST_PATH}' ---"
kubectl apply -f "${K8S_MANIFEST_PATH}/namespace.yaml"
# Use a regex to replace the image tag, regardless of the old tag value
sed -i -E "s|image: gcr.io/grokweb-419218/idrn-be:.*|image: ${BE_IMAGE_TAG}|" "${K8S_MANIFEST_PATH}/idrn-be-deployment.yaml"
sed -i -E "s|image: gcr.io/grokweb-419218/idrn-fe:.*|image: ${FE_IMAGE_TAG}|" "${K8S_MANIFEST_PATH}/idrn-fe-deployment.yaml"
kubectl apply -f "${K8S_MANIFEST_PATH}"

echo "--- Triggering rolling update ---"
kubectl patch deployment "${BE_DEPLOYMENT_NAME}" -n "${NAMESPACE}" -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"RESTART_TIMESTAMP\":\"$(date +%s)\"}}}}}"
kubectl patch deployment "${FE_DEPLOYMENT_NAME}" -n "${NAMESPACE}" -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"RESTART_TIMESTAMP\":\"$(date +%s)\"}}}}}"

echo "--- Waiting for rollout to complete ---"
kubectl rollout status deployment "${BE_DEPLOYMENT_NAME}" -n "${NAMESPACE}"
kubectl rollout status deployment "${FE_DEPLOYMENT_NAME}" -n "${NAMESPACE}"

echo "--- Deployment successful! ---"
