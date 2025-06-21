# khushal-k8s-manifests

This repository contains Kubernetes manifests for the hello-grpc service deployed to the cluster.

## Structure

```
hello-grpc/
  deployment.yaml  # Contains Deployment and Service for hello-grpc
```

## GitOps Workflow

- This repository is used with ArgoCD for GitOps deployment.
- The hello-grpc CI/CD pipeline updates the image tag in `hello-grpc/deployment.yaml` when a new Docker image is built.
- ArgoCD watches this repository and automatically syncs changes to the cluster.

## hello-grpc Service

The hello-grpc service is a Python gRPC server that:
- Runs on port 50051
- Implements gRPC health checks
- Is deployed with 3 replicas
- Uses LoadBalancer service type for external access

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