# Tracc Kubernetes Manifests for AWS EKS

This directory contains Kubernetes manifests for deploying the Tracc expense tracking application to AWS EKS.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   AWS ALB       │────▶│   UI Service    │────▶│  User Service   │
│   (Ingress)     │     │   (Port 8081)   │     │  (gRPC :50052)  │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │                 │     │                 │
                        │ Expense Service │     │   AWS RDS       │
                        │ (gRPC :50053)   │────▶│   PostgreSQL    │
                        │                 │     │                 │
                        └─────────────────┘     └─────────────────┘
```

## Files Structure

### Core Deployment Files

- **00-namespace.yaml** - Creates the `tracc` namespace
- **user-deployment-aws.yaml** - User service deployment and service
- **expense-deployment-aws.yaml** - Expense service deployment and service
- **ui-deployment-aws.yaml** - UI service deployment and service
- **tracc-ingress-aws.yaml** - AWS ALB Ingress configuration

### Configuration Files

- **database-configmap.yaml** - Database connection configuration
- **external-secrets.yaml** - External Secrets Operator configuration for AWS Secrets Manager

### ArgoCD

- **argocd-application.yaml** - ArgoCD application definition for GitOps deployment

### Legacy Files (for local cluster)

- **user-deployment.yaml** - Original deployment for local cluster
- **expense-deployment.yaml** - Original deployment for local cluster
- **ui-deployment.yaml** - Original deployment for local cluster
- **tracc-ingress.yaml** - NGINX ingress for local cluster

## Prerequisites

1. **EKS Cluster** with:
   - AWS Load Balancer Controller
   - External Secrets Operator
   - OIDC provider enabled

2. **AWS Resources**:
   - RDS PostgreSQL instance
   - Secrets in AWS Secrets Manager
   - ACM SSL certificate
   - Proper IAM roles and policies

3. **GitHub Container Registry Access**:
   - GitHub Personal Access Token
   - Docker registry secret in cluster

## Quick Deployment

### Option 1: Using the Setup Script

```bash
# Run the automated setup script
./scripts/setup-eks.sh
```

### Option 2: Manual Deployment

1. **Update Configuration Files**:
```bash
# Replace placeholders in files
export DOMAIN="your-domain.com"
export RDS_ENDPOINT="your-rds-endpoint.amazonaws.com"
export CERT_ARN="arn:aws:acm:region:account:certificate/id"

# Update ingress
sed -i "s/YOUR_DOMAIN.com/$DOMAIN/g" tracc-ingress-aws.yaml
sed -i "s/YOUR_CERT_ID/$CERT_ARN/g" tracc-ingress-aws.yaml

# Update database config
sed -i "s/tracc-db.cluster-xxxxx.us-east-1.rds.amazonaws.com/$RDS_ENDPOINT/g" database-configmap.yaml
```

2. **Create GitHub Registry Secret**:
```bash
kubectl create secret docker-registry ghcr-secret \
  --namespace tracc \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT
```

3. **Deploy Applications**:
```bash
# Create namespace
kubectl apply -f 00-namespace.yaml

# Apply configurations
kubectl apply -f database-configmap.yaml
kubectl apply -f external-secrets.yaml

# Wait for secrets to sync
sleep 30

# Deploy services
kubectl apply -f user-deployment-aws.yaml
kubectl apply -f expense-deployment-aws.yaml
kubectl apply -f ui-deployment-aws.yaml

# Deploy ingress
kubectl apply -f tracc-ingress-aws.yaml
```

### Option 3: ArgoCD Deployment

```bash
# Apply ArgoCD application
kubectl apply -f argocd-application.yaml

# Sync application
argocd app sync tracc
```

## Required AWS Secrets

Create these secrets in AWS Secrets Manager:

1. **tracc/rds/credentials**:
```json
{
  "username": "traccadmin",
  "password": "your-secure-password"
}
```

2. **tracc/jwt/secret**:
```json
{
  "secret_key": "your-jwt-secret"
}
```

3. **tracc/oauth/google**:
```json
{
  "client_id": "your-google-client-id",
  "client_secret": "your-google-client-secret"
}
```

4. **tracc/oauth/facebook**:
```json
{
  "client_id": "your-facebook-client-id",
  "client_secret": "your-facebook-client-secret"
}
```

## Environment Variables

The deployments use the following environment variables:

### All Services
- `APP_ENV`: Production environment flag
- `DB_HOST`: RDS endpoint
- `DB_PORT`: PostgreSQL port (5432)
- `DB_NAME`: Database name (tracc)
- `DB_USER`: Database username (from secret)
- `DB_PASSWORD`: Database password (from secret)
- `JWT_SECRET`: JWT signing key (from secret)

### UI Service Additional
- `USER_SERVICE_HOST`: Internal service name
- `EXPENSE_SERVICE_HOST`: Internal service name
- `GOOGLE_CLIENT_ID`: OAuth credential (from secret)
- `GOOGLE_CLIENT_SECRET`: OAuth credential (from secret)
- `FACEBOOK_CLIENT_ID`: OAuth credential (from secret)
- `FACEBOOK_CLIENT_SECRET`: OAuth credential (from secret)

## Monitoring

### Check Deployment Status
```bash
# Check pods
kubectl get pods -n tracc

# Check services
kubectl get svc -n tracc

# Check ingress
kubectl get ingress -n tracc

# Get ALB endpoint
kubectl get ingress -n tracc tracc-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### View Logs
```bash
# User service logs
kubectl logs -n tracc -l app=tracc-user --tail=100

# Expense service logs
kubectl logs -n tracc -l app=tracc-expense --tail=100

# UI service logs
kubectl logs -n tracc -l app=tracc-ui-server --tail=100
```

### Troubleshooting

1. **Pods not starting**: Check secrets are properly synced
```bash
kubectl get secrets -n tracc
kubectl describe externalsecret -n tracc
```

2. **Database connection issues**: Verify RDS security group allows access
```bash
# Test from a pod
kubectl run -it --rm --image=postgres:15 test-db -n tracc -- \
  psql -h $RDS_ENDPOINT -U traccadmin -d tracc
```

3. **Ingress not working**: Check ALB controller logs
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

## CI/CD Integration

The repository is configured to work with GitHub Actions:

1. **On Push to Main**:
   - Builds and pushes Docker images to GHCR
   - Updates image tags in this repository
   - Triggers ArgoCD sync

2. **Image Tag Updates**:
   - Automated via GitHub Actions
   - Updates `*-deployment-aws.yaml` files with new image tags

## Scaling

### Horizontal Pod Autoscaling
```yaml
kubectl autoscale deployment tracc-user --cpu-percent=70 --min=2 --max=10 -n tracc
kubectl autoscale deployment tracc-expense --cpu-percent=70 --min=2 --max=10 -n tracc
kubectl autoscale deployment tracc-ui-server --cpu-percent=70 --min=2 --max=10 -n tracc
```

### Cluster Autoscaling
Configured via EKS node groups with min/max node counts.

## Security Considerations

1. **Network Policies**: Consider implementing Kubernetes NetworkPolicies
2. **Pod Security Standards**: Apply pod security policies
3. **RBAC**: Implement proper role-based access control
4. **Secrets Rotation**: Regularly rotate database and JWT secrets
5. **Image Scanning**: Enable container image vulnerability scanning

## Backup and Recovery

1. **RDS Backups**: Automated daily backups with 7-day retention
2. **Kubernetes Resources**: Stored in Git (GitOps)
3. **Persistent Data**: Consider Velero for Kubernetes backup

## Cost Optimization

1. Use Spot instances for non-critical workloads
2. Right-size instances based on actual usage
3. Use Aurora Serverless for variable database workloads
4. Implement pod autoscaling to optimize resource usage

## Support

For issues or questions:
- Check the main application repository: https://github.com/khushal1198/hello_grpc
- AWS EKS Documentation: https://docs.aws.amazon.com/eks/
- ArgoCD Documentation: https://argo-cd.readthedocs.io/