# Hello gRPC Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the Hello gRPC application.

## Services

### 1. gRPC Server
- **Deployment**: `grpc-deployment.yaml`
- **Service**: `hello-grpc-service` (ClusterIP)
- **Port**: 50051
- **Replicas**: 2

### 2. UI Server
- **Deployment**: `ui-deployment.yaml`
- **Service**: `hello-ui-service` (ClusterIP)
- **Port**: 8081 (internal) / 80 (service)
- **Replicas**: 2

### 3. Ingress
- **Ingress**: `ingress.yaml`
- **Purpose**: External access to UI
- **Host**: `hello-grpc.your-domain.com` (update this)

## Deployment

### Apply all manifests:
```bash
kubectl apply -f .
```

### Apply individual services:
```bash
kubectl apply -f grpc-deployment.yaml
kubectl apply -f ui-deployment.yaml
kubectl apply -f ingress.yaml
```

## Configuration

### Environment Variables
- **gRPC Server**: Uses default configuration
- **UI Server**: 
  - `GRPC_SERVER_HOST`: `hello-grpc-service`
  - `GRPC_SERVER_PORT`: `50051`
  - `UI_SERVER_PORT`: `8081`

### Health Checks
- **gRPC Server**: gRPC health check on port 50051
- **UI Server**: HTTP health check on `/api/health`

## Access Points

- **Internal gRPC**: `hello-grpc-service:50051`
- **Internal UI**: `hello-ui-service:80`
- **External UI**: `http://hello-grpc.your-domain.com`

## CI/CD Integration

The GitHub Actions workflow automatically updates the image tags in these manifests when new Docker images are built and pushed.

## Notes

1. Update the hostname in `ingress.yaml` to match your domain
2. Ensure your cluster has an Ingress controller installed
3. The UI server connects to the gRPC server using the Kubernetes service name 