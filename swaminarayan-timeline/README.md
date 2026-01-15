# Swaminarayan Timeline - Kubernetes Manifests

This directory contains the Kubernetes manifests for deploying the Swaminarayan Timeline application.

## Directory Structure

```
swaminarayan-timeline/
├── base/                           # Base Kubernetes resources
│   ├── namespace.yaml             # Namespace definition
│   ├── serviceaccount.yaml       # Service account
│   ├── database-configmap.yaml   # Configuration for database connections
│   ├── timeline-deployment.yaml  # Timeline service deployment & service
│   ├── contributor-deployment.yaml # Contributor service deployment & service
│   ├── ui-deployment.yaml        # UI server deployment & service
│   └── kustomization.yaml        # Base kustomization config
└── overlays/
    └── aws/                       # AWS-specific configurations
        ├── ingress.yaml          # ALB Ingress configuration
        ├── patches/              # Deployment patches for AWS
        │   ├── timeline-patch.yaml
        │   ├── contributor-patch.yaml
        │   └── ui-patch.yaml
        └── kustomization.yaml    # AWS overlay kustomization
```

## Services

### 1. Timeline Service
- **Port**: 50051 (gRPC)
- **Purpose**: Handles timeline events and data
- **Image**: `ghcr.io/khushal1198/swaminarayan-timeline-timeline`

### 2. Contributor Service
- **Port**: 50052 (gRPC)
- **Purpose**: Manages contributor authentication and submissions
- **Image**: `ghcr.io/khushal1198/swaminarayan-timeline-contributor`

### 3. UI Server
- **Port**: 8000 (HTTP)
- **Purpose**: Serves the React frontend and acts as API gateway
- **Image**: `ghcr.io/khushal1198/swaminarayan-timeline-ui`

## Deployment

### Local Development (Minikube/Kind)

```bash
# Apply base configuration
kubectl apply -k base/

# Or use kustomize to preview first
kustomize build base/ | kubectl apply -f -
```

### AWS EKS Deployment

```bash
# Apply AWS overlay (includes base + AWS-specific configs)
kubectl apply -k overlays/aws/

# Or preview first
kustomize build overlays/aws/ | kubectl apply -f -
```

## Configuration

### Environment Variables

The following environment variables are configured:

#### Common
- `PORT` - Service port
- `SERVICE_NAME` - Service identifier
- `ENVIRONMENT` - Deployment environment (production/staging/development)
- `AWS_REGION` - AWS region for cloud services

#### Timeline Service
- `DATABASE_URL` - PostgreSQL connection string (from secret)

#### Contributor Service
- `DATABASE_URL` - PostgreSQL connection string (from secret)
- `JWT_SECRET` - JWT signing secret (from secret)

#### UI Server
- `TIMELINE_SERVICE_URL` - gRPC endpoint for Timeline service
- `CONTRIBUTOR_SERVICE_URL` - gRPC endpoint for Contributor service
- `REACT_APP_API_URL` - API base URL for React app
- `NODE_ENV` - Node environment
- `CDN_URL` - CDN URL for static assets (AWS only)

### Secrets

Before deploying, create the required secrets:

```bash
# Create namespace first
kubectl create namespace swaminarayan-timeline

# Create secrets
kubectl create secret generic swaminarayan-timeline-secrets \
  --namespace=swaminarayan-timeline \
  --from-literal=database-url='postgresql://user:password@host:5432/dbname' \
  --from-literal=jwt-secret='your-secure-jwt-secret'
```

### Ingress Configuration

The AWS overlay includes an ALB Ingress with:
- SSL termination
- Health checks
- Path-based routing:
  - `/` → UI Server
  - `/api/timeline` → Timeline Service
  - `/api/contributor` → Contributor Service

Update the following in `overlays/aws/ingress.yaml`:
- `alb.ingress.kubernetes.io/certificate-arn` - Your ACM certificate ARN
- `spec.rules[0].host` - Your domain name

## CI/CD Integration

The GitHub Actions workflows automatically update the image tags in these manifests:
1. Build and push Docker images
2. Update image tags in deployment files
3. Commit and push changes
4. ArgoCD or Flux picks up changes and deploys

## Customization

### Scaling

Modify replica counts in the base deployments or overlay patches:

```yaml
spec:
  replicas: 3  # Adjust as needed
```

### Resources

Adjust resource requests/limits in the deployments:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Node Selection (AWS)

The AWS overlay includes node selectors and tolerations:

```yaml
nodeSelector:
  node.kubernetes.io/instance-type: t3.medium
tolerations:
  - key: "dedicated"
    operator: "Equal"
    value: "app"
    effect: "NoSchedule"
```

## Monitoring

### Health Checks

All services include liveness and readiness probes:
- **gRPC services**: Using grpc_health_probe
- **HTTP services**: Using HTTP endpoints

### Metrics

Services expose metrics on:
- Timeline: `:50051/metrics`
- Contributor: `:50052/metrics`
- UI: `:8000/metrics`

## Troubleshooting

### Check Deployment Status

```bash
kubectl get pods -n swaminarayan-timeline
kubectl get svc -n swaminarayan-timeline
kubectl get ingress -n swaminarayan-timeline
```

### View Logs

```bash
# Timeline service logs
kubectl logs -n swaminarayan-timeline -l service=timeline

# Contributor service logs
kubectl logs -n swaminarayan-timeline -l service=contributor

# UI server logs
kubectl logs -n swaminarayan-timeline -l service=ui
```

### Debug Pod

```bash
kubectl describe pod <pod-name> -n swaminarayan-timeline
kubectl exec -it <pod-name> -n swaminarayan-timeline -- /bin/sh
```

## Security Considerations

1. **Secrets Management**: Use AWS Secrets Manager or External Secrets Operator
2. **Network Policies**: Implement network segmentation
3. **RBAC**: Configure appropriate role-based access control
4. **Pod Security**: Use security contexts and pod security policies
5. **Image Scanning**: Scan images for vulnerabilities before deployment

## Next Steps

1. Set up External Secrets Operator for AWS Secrets Manager integration
2. Configure Horizontal Pod Autoscaler (HPA)
3. Set up monitoring with Prometheus and Grafana
4. Implement backup strategy for database
5. Configure CI/CD with ArgoCD or Flux

## Support

For issues or questions, please open an issue in the repository.