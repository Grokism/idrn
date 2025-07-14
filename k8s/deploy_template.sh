# --- Kubernetes Manifests ---
export K8S_MANIFEST_PATH="/home/robert/git/idrn/k8s"

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

echo "--- Deleting existing frontend deployment to force a refresh ---"
kubectl delete deployment "${FE_DEPLOYMENT_NAME}" -n "${NAMESPACE}" --ignore-not-found=true
# Add a short wait to allow for termination
sleep 30

echo "--- Applying all Kubernetes manifests from '${K8S_MANIFEST_PATH}' ---"
# Use a regex to replace the image tag, regardless of the old tag value
sed -i -E "s|image: gcr.io/${PROJECT_ID}/${BE_IMAGE_NAME}:.*|image: ${BE_IMAGE_TAG}|" "${K8S_MANIFEST_PATH}/biprod-be-deployment.yaml"
sed -i -E "s|image: gcr.io/${PROJECT_ID}/${FE_IMAGE_NAME}:.*|image: ${FE_IMAGE_TAG}|" "${K8S_MANIFEST_PATH}/biprod-fe-deployment.yaml"
kubectl apply -f "${K8S_MANIFEST_PATH}"

echo "--- Waiting for rollout to complete ---"
kubectl rollout status deployment "${BE_DEPLOYMENT_NAME}" -n "${NAMESPACE}"
kubectl rollout status deployment "${FE_DEPLOYMENT_NAME}" -n "${NAMESPACE}"

echo "--- Deployment successful! ---"
