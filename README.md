# khushal-k8s-manifests

This repository contains Kubernetes manifests for the hello-grpc service and UI deployed to the cluster.

## Structure

```
hello-grpc/
  deployment.yaml                    # Contains Deployment and Service for hello-grpc
  hello-ui-deployment.yaml          # UI deployment and service
  hello-ui-root-ingress.yaml        # Ingress for UI at /ui endpoint
  hello-ui-api-ingress.yaml         # Ingress for API at /api endpoint
```

## GitOps Workflow

- This repository is used with ArgoCD for GitOps deployment.
- The hello-grpc CI/CD pipeline updates the image tag in `hello-grpc/deployment.yaml` when a new Docker image is built.
- ArgoCD watches this repository and automatically syncs changes to the cluster.

## Services

### hello-grpc Service
The hello-grpc service is a Python gRPC server that:
- Runs on port 50051
- Implements gRPC health checks
- Is deployed with 3 replicas
- Uses LoadBalancer service type for external access

### hello-ui Service
The hello-ui service is a web UI that:
- Serves a React-based frontend at `/ui`
- Provides a REST API at `/api/hello` that internally calls the gRPC service
- Runs on port 80
- Is deployed with 1 replica
- Uses ClusterIP service type

## Access Points

- **UI**: `http://shivi.local:30080/ui/` - Web interface for the gRPC client
- **API**: `http://shivi.local:30080/api/hello` - REST API endpoint (POST with JSON body)
- **ArgoCD**: `http://shivi.local:30080/argocd/` - GitOps management interface

## API Usage

The `/api/hello` endpoint expects a POST request with JSON body:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"name": "Your Name"}' \
  http://shivi.local:30080/api/hello
```

Response:
```json
{"message": "Hello, Your Name!"}
```

## ArgoCD Application

To deploy the hello-grpc service, create an ArgoCD Application that points to this repository:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: hello-grpc
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://github.com/khushalpujara/khushal-k8s-manifests'
    targetRevision: HEAD
    path: hello-grpc
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## CI/CD Integration

The hello-grpc application repository automatically updates the image tag in this repository when new code is pushed. The workflow:

1. Builds and pushes a new Docker image with a commit-specific tag
2. Updates the image tag in `hello-grpc/deployment.yaml`
3. Commits and pushes the change to this repository
4. ArgoCD detects the change and deploys the new image 