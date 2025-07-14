# Hello gRPC Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the Hello gRPC application with a clean, minimal setup.

## Architecture

This deployment uses a **Backend for Frontend (BFF)** pattern:
- **gRPC Server**: Handles the core business logic
- **UI Server**: Acts as a BFF, serving the web UI and proxying API calls to the gRPC server
- **NGINX Ingress**: Routes external traffic to the UI server

## Services

### 1. gRPC Server
- **Deployment**: `grpc-deployment.yaml`
- **Service**: `hello-grpc-service` (ClusterIP)
- **Port**: 50051
- **Replicas**: 2
- **Purpose**: Core gRPC service handling HelloService.SayHello requests

### 2. UI Server (BFF)
- **Deployment**: `ui-deployment.yaml`
- **Service**: `hello-ui-service` (ClusterIP)
- **Port**: 8081 (internal) / 80 (service)
- **Replicas**: 2
- **Purpose**: Serves static files and provides REST API endpoints that proxy to gRPC

## Docker Registry Secret Setup

The `tracc-*` deployments use private images from GitHub Container Registry. You need to create a Docker registry secret for image pull access:

### Create the Secret

Run this command on your cluster to create the `ghcr-secret`:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=khushal1198 \
  --docker-password=YOUR_GITHUB_PAT_TOKEN \
  --docker-email=khushal1198@users.noreply.github.com \
  --namespace=default
```

**Replace `YOUR_GITHUB_PAT_TOKEN`** with your actual GitHub Personal Access Token that has `read:packages` permission.

### Verify the Secret

```bash
kubectl get secret ghcr-secret -n default
```

This secret is referenced in all `tracc-*` deployments via `imagePullSecrets` and allows the pods to pull private images from `ghcr.io/khushal1198/tracc-*`.

## Ingress Configuration

### NGINX Ingress Setup

We use **two separate ingress resources** to handle different path behaviors:

#### 1. Root Ingress (`hello-ui-root-ingress.yaml`)
- **Purpose**: Serves the main UI at the root path
- **Hosts**: `shivi.local`, `ui.shivi.local`
- **Path**: `/`
- **Behavior**: Rewrites `/` to `/static/index.html` for SPA routing
- **Backend**: `hello-ui-service:80`

#### 2. API Ingress (`hello-ui-api-ingress.yaml`)
- **Purpose**: Handles API calls
- **Hosts**: `shivi.local`, `ui.shivi.local`
- **Path**: `/api/*`
- **Behavior**: Passes through to UI server's API endpoints
- **Backend**: `hello-ui-service:80`

### Why Two Ingress Resources?

Kubernetes Ingress doesn't support per-path annotations, so we need separate resources for:
- **Root path** (`/`) with rewrite to serve the SPA
- **API paths** (`/api/*`) without rewrite for REST endpoints

## Deployment

### Apply all manifests:
```bash
kubectl apply -f .
```

### Apply individual components:
```bash
kubectl apply -f grpc-deployment.yaml
kubectl apply -f ui-deployment.yaml
kubectl apply -f hello-ui-root-ingress.yaml
kubectl apply -f hello-ui-api-ingress.yaml
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

### External Access
- **UI**: `http://shivi.local:30080/`
- **API**: `http://shivi.local:30080/api/hello` (POST with JSON body)
- **Static Assets**: `http://shivi.local:30080/static/*`

### Internal Access
- **gRPC Server**: `hello-grpc-service:50051`
- **UI Server**: `hello-ui-service:80`

## API Endpoints

### POST `/api/hello`
- **Content-Type**: `application/json`
- **Request Body**: `{"name": "Your Name"}`
- **Response**: `{"message": "Hello, Your Name!"}`

### GET `/api/health`
- **Response**: Health status of the UI server and gRPC connection

## Prerequisites

1. **NGINX Ingress Controller** installed in the cluster
2. **NodePort 30080** configured for external access
3. **DNS/mDNS** resolution for `shivi.local`

## Notes

1. The UI server acts as a BFF, handling both static file serving and API proxying
2. No direct gRPC-web proxy needed - the UI server handles gRPC communication internally
3. The setup is optimized for a clean, minimal configuration with only essential resources
4. ArgoCD manages the deployment and will sync changes from the Git repository 