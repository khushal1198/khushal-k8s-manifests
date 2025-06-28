# khushal-k8s-manifests

This repository contains Kubernetes manifests for the hello-grpc service and UI deployed to the cluster.

## Structure

```
hello-grpc/
  deployment.yaml                    # Contains Deployment and Service for hello-grpc
  hello-ui-deployment.yaml          # UI deployment and service
  hello-ui-root-ingress.yaml        # Ingress for UI at /ui endpoint
  hello-ui-api-ingress.yaml         # Ingress for API at /api endpoint
  hello-ui-static-ingress.yaml      # Ingress for static files at /static endpoint
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
- Serves static assets (CSS, JS) at `/static`
- Runs on port 80
- Is deployed with 1 replica
- Uses ClusterIP service type

## Access Points

The application services are accessible via the NGINX ingress controller on port 30080:

- **UI**: `http://shivi.local:30080/ui/` - Web interface for the gRPC client
- **API**: `http://shivi.local:30080/api/hello` - REST API endpoint (POST with JSON body)
- **Static Files**: `http://shivi.local:30080/static/...` - CSS, JS, and other assets

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

## Adding New Services

To add a new service to the cluster and expose it via the ingress:

### 1. Deploy Your Service

Create your deployment and service manifests:

```yaml
# your-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: your-service
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: your-service
  template:
    metadata:
      labels:
        app: your-service
    spec:
      containers:
      - name: your-service
        image: your-image:tag
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: your-service
  namespace: default
spec:
  selector:
    app: your-service
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
```

### 2. Create an Ingress

Create an ingress to expose your service at a specific path:

```yaml
# your-service-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: your-service-ingress
  namespace: default
  annotations:
    # Add any required annotations for your service
    # nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: shivi.local
    http:
      paths:
      - path: /your-service
        pathType: Prefix
        backend:
          service:
            name: your-service
            port:
              number: 80
```

### 3. Common Ingress Patterns

#### Simple Service (no path rewriting)
```yaml
- path: /your-service
  pathType: Prefix
  backend:
    service:
      name: your-service
      port:
        number: 80
```

#### Service with Path Rewriting
```yaml
annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /$2
# Path: /your-service(/|$)(.*)
```

#### Service with Custom Headers
```yaml
annotations:
  nginx.ingress.kubernetes.io/configuration-snippet: |
    proxy_set_header X-Custom-Header "value";
```

#### Service with Authentication
```yaml
annotations:
  nginx.ingress.kubernetes.io/auth-type: basic
  nginx.ingress.kubernetes.io/auth-secret: basic-auth
```

### 4. Apply and Test

```bash
# Apply your manifests
kubectl apply -f your-service-deployment.yaml
kubectl apply -f your-service-ingress.yaml

# Test your service
curl http://shivi.local:30080/your-service/
```

### 5. Update Documentation

Add your new service to the "Access Points" section above:

```markdown
- **Your Service**: `http://shivi.local:30080/your-service/` - Description of your service
```

## Ingress Configuration

The setup uses NGINX ingress controller with the following ingress resources:

### UI Ingress (`hello-ui-root-ingress.yaml`)
- Routes `/ui` requests to the UI service
- Uses `nginx.ingress.kubernetes.io/rewrite-target: /static/index.html` to serve the React app

### API Ingress (`hello-ui-api-ingress.yaml`)
- Routes `/api` requests to the UI service (which acts as a BFF proxy to gRPC)
- No rewrite - passes requests directly to the service

### Static Files Ingress (`hello-ui-static-ingress.yaml`)
- Routes `/static` requests to the UI service
- Serves CSS, JavaScript, and other static assets
- No rewrite - serves files directly from the `/static` path

All ingresses use:
- `ingressClassName: nginx` (modern Kubernetes format)
- `host: shivi.local` for explicit host matching
- `pathType: Prefix` for flexible path matching

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

## Network Access

### Local Development
- Access via `http://shivi.local:30080/ui/` on the local network
- Requires mDNS/Avahi for hostname resolution or manual `/etc/hosts` entry

### Production
- Configure proper DNS records for the hostname
- Consider using a LoadBalancer or external ingress for production traffic

## Infrastructure Services

Infrastructure services (ArgoCD, Jenkins, pgAdmin, Grafana, etc.) are managed separately via Ansible and are not part of this application repository. 