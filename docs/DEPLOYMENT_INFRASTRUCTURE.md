# Deployment Infrastructure Documentation

## Overview

This document describes the AWS EKS deployment infrastructure, DNS management, load balancing, and GitOps configuration for the khushal-k8s-manifests repository.

## Infrastructure Components

### 1. EKS Cluster

**Cluster Name**: tracc-cluster
**Region**: us-east-1
**Node Configuration**:
- Instance Type: t2.medium (2 nodes)
- Max Pods: ~17 per node (34 total)
- Kubernetes Version: 1.27+

### 2. Namespaces

| Namespace | Purpose | Applications |
|-----------|---------|--------------|
| `tracc` | Production tracc app | tracc (expense tracking) |
| `khushal-apps` | Shared namespace for cost optimization | swaminarayan-timeline (future) |
| `kube-system` | Kubernetes system components | aws-load-balancer-controller, external-dns |
| `argocd` | GitOps deployment | ArgoCD server |
| `external-secrets` | Secrets management | External Secrets Operator |

### 3. Application Load Balancers (ALB)

**Current ALBs**:
1. **tracc-production**: `k8s-traccproduction-39ced743bc-*.us-east-1.elb.amazonaws.com`
   - Hosts: tracc.ai, www.tracc.ai
   - Certificate: ACM managed SSL

2. **argocd**: `k8s-argocd-argocdse-*.us-east-1.elb.amazonaws.com`
   - Host: argocd.tracc.ai

**Cost Optimization**: Planning to migrate to single shared ALB for all apps ($16/month savings)

### 4. DNS Management

#### Route 53 Configuration
- **Hosted Zone**: tracc.ai (Z03221091NCPH6794VE8O)
- **Management**: Automated via External DNS Controller

#### External DNS Controller
- **Check Interval**: 5 minutes
- **Domains Monitored**: tracc.ai, khushalpujara.com
- **Cost**: ~$0.03/month
- **Function**: Automatically updates DNS when ALBs change

#### DNS Records (Automated)
```
tracc.ai          → A → ALB endpoint
www.tracc.ai      → A → ALB endpoint
argocd.tracc.ai   → A → ArgoCD ALB endpoint
```

## GitOps with ArgoCD

### ArgoCD Configuration
**URL**: https://argocd.tracc.ai
**Repository**: https://github.com/khushal1198/khushal-k8s-manifests

### Application Deployment Flow
```
1. Code pushed to application repo (e.g., tracc)
2. GitHub Actions builds Docker images
3. Updates image tags in k8s-manifests repo
4. ArgoCD detects changes
5. Automatically syncs to EKS cluster
```

### ArgoCD Applications
```yaml
# Example ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: tracc
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/khushal1198/khushal-k8s-manifests
    path: tracc/overlays/aws
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: tracc
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Ingress Configuration

### ALB Ingress Controller
**Version**: AWS Load Balancer Controller v2.x
**Configuration**:
- Manages ALB lifecycle
- Creates target groups
- Handles SSL termination

### Ingress Annotations
```yaml
alb.ingress.kubernetes.io/scheme: internet-facing
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:...
alb.ingress.kubernetes.io/group.name: tracc-production  # Groups ingresses to single ALB
alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
alb.ingress.kubernetes.io/ssl-redirect: "443"
external-dns.alpha.kubernetes.io/hostname: tracc.ai,www.tracc.ai  # For DNS automation
```

## IAM Configuration

### Service Accounts with IRSA

| Service Account | Namespace | IAM Policy | Purpose |
|----------------|-----------|------------|---------|
| aws-load-balancer-controller | kube-system | AWSLoadBalancerControllerIAMPolicy | Manage ALBs |
| external-dns | kube-system | ExternalDNSPolicy | Update Route 53 |
| tracc-external-secrets-sa | tracc | ExternalSecretsPolicy | Read AWS Secrets |

## Deployment Methods

### 1. Via ArgoCD (Recommended)
```bash
# Deploy application
kubectl apply -f argocd-apps/<app-name>.yaml

# Sync manually if needed
argocd app sync <app-name>
```

### 2. Via kubectl with Kustomize
```bash
# Deploy to production
kubectl apply -k <app-name>/overlays/aws

# Verify deployment
kubectl get all -n <namespace>
```

### 3. Via GitHub Actions
Automated on push to main branch:
1. Builds and pushes Docker images
2. Updates k8s-manifests repo
3. ArgoCD auto-syncs changes

## Cost Optimization Strategies

### Current Monthly Costs
| Component | Cost | Notes |
|-----------|------|-------|
| EKS Cluster | ~$73 | Control plane |
| EC2 Nodes (2x t2.medium) | ~$67 | Worker nodes |
| ALB (per ALB) | $16 | Plus data transfer |
| Route 53 | $0.50 | Hosted zone |
| External DNS | $0.03 | API calls |

### Implemented Optimizations
1. **Shared Namespace**: Reduces ALB count (saving $16/month per app)
2. **External DNS**: 5-minute sync interval vs 1-minute (80% fewer API calls)
3. **Pod Scaling**: Reduced replicas where appropriate

## Monitoring & Troubleshooting

### Check Cluster Health
```bash
# Node status
kubectl get nodes
kubectl top nodes

# Pod distribution
kubectl get pods -A -o wide

# Resource usage
kubectl top pods -A --sort-by=memory
```

### Check ALB Status
```bash
# View ingress and ALB endpoint
kubectl get ingress -A

# Describe ingress for details
kubectl describe ingress <ingress-name> -n <namespace>

# Check ALB controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

### Check DNS Status
```bash
# Verify DNS resolution
dig tracc.ai
nslookup tracc.ai

# Check External DNS logs
kubectl logs -n kube-system deployment/external-dns

# View Route 53 records
aws route53 list-resource-record-sets --hosted-zone-id Z03221091NCPH6794VE8O
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| DNS not resolving | External DNS not synced | Check External DNS logs, verify annotations |
| 503 Service Unavailable | Pods not healthy | Check pod status, review health checks |
| Certificate errors | Wrong certificate ARN | Verify ACM certificate in ingress annotations |
| Too many pods pending | Node capacity reached | Scale nodes or reduce replicas |
| ALB not created | Missing IAM permissions | Check aws-load-balancer-controller logs |

## Disaster Recovery

### Backup Components
- **Application Code**: GitHub repositories
- **Kubernetes Manifests**: khushal-k8s-manifests repo
- **Database**: RDS automated backups (7-day retention)
- **Secrets**: AWS Secrets Manager

### Recovery Procedures
1. **Cluster Failure**: Recreate EKS cluster, redeploy via ArgoCD
2. **ALB Deleted**: Reapply ingress, External DNS updates Route 53
3. **DNS Issues**: Manual Route 53 update if External DNS fails
4. **Application Issues**: Rollback via ArgoCD or kubectl

## Security Best Practices

1. **IRSA for Service Accounts**: No hardcoded AWS credentials
2. **External Secrets**: Secrets stored in AWS Secrets Manager
3. **TLS Everywhere**: ACM certificates for HTTPS
4. **Network Policies**: Can be added for pod-to-pod restrictions
5. **RBAC**: Limited permissions per service account

## Future Improvements

1. **Unified ALB**: Complete migration to single shared ALB
2. **Horizontal Pod Autoscaling**: Add HPA for dynamic scaling
3. **Cluster Autoscaling**: Scale nodes based on demand
4. **Monitoring Stack**: Add Prometheus/Grafana for metrics
5. **Backup Automation**: Velero for cluster backup/restore