# khushal-k8s-manifests

Kubernetes manifests repository for GitOps deployments to AWS EKS cluster using ArgoCD.

## Quick Links

- **Production**: [tracc.ai](https://tracc.ai)
- **ArgoCD**: [argocd.tracc.ai](https://argocd.tracc.ai)
- **Documentation**: [docs/](./docs/)
  - [Deployment Infrastructure](./docs/DEPLOYMENT_INFRASTRUCTURE.md) - EKS, ALB, Route 53, GitOps
  - [External DNS Setup](./docs/EXTERNAL_DNS.md) - Automatic DNS management
  - [ALB Sharing](./docs/ALB_SHARING.md) - Cost optimization via shared ALBs
  - [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues and solutions

## Repository Structure

```
.
├── docs/                           # Documentation
│   ├── DEPLOYMENT_INFRASTRUCTURE.md
│   ├── EXTERNAL_DNS.md
│   ├── ALB_SHARING.md
│   └── TROUBLESHOOTING.md
├── shared/                         # Shared namespace configuration
│   ├── base/
│   └── overlays/aws/
├── tracc/                          # Tracc application (expense tracking)
│   ├── base/
│   └── overlays/aws/
└── swaminarayan-timeline/          # Timeline application
    ├── base/
    └── overlays/aws/
```

## Infrastructure Overview

### AWS EKS Cluster
- **Cluster**: tracc-cluster (us-east-1)
- **Nodes**: 2x t2.medium
- **Kubernetes**: v1.27+

### Applications
1. **tracc** - Expense tracking application (tracc.ai)
2. **swaminarayan-timeline** - Timeline visualization (planned)

### Key Features
- **GitOps with ArgoCD** - Automatic deployments from Git
- **External DNS** - Automatic Route 53 DNS updates
- **AWS Load Balancer Controller** - Manages ALBs for ingress
- **External Secrets Operator** - Syncs secrets from AWS Secrets Manager
- **Cost-Optimized** - ALB sharing saves ~$192/year per additional app

## Quick Start

### Deploy via ArgoCD
```bash
# Create ArgoCD application
kubectl apply -f argocd-apps/tracc.yaml

# Check sync status
argocd app get tracc
argocd app sync tracc
```

### Deploy via kubectl
```bash
# Deploy tracc
kubectl apply -k tracc/overlays/aws

# Deploy swaminarayan-timeline (when ready)
kubectl apply -k swaminarayan-timeline/overlays/aws
```

## GitOps Workflow

1. **Code Push** → Application repository (e.g., tracc)
2. **CI/CD** → GitHub Actions builds Docker images
3. **Update** → Image tags updated in this repository
4. **Sync** → ArgoCD detects changes and deploys to EKS
5. **DNS** → External DNS updates Route 53 if ALB changes

## Monitoring

### Check Cluster Status
```bash
kubectl get nodes
kubectl get pods -A | grep -v Running
kubectl top nodes
```

### Check Application Status
```bash
# Via ArgoCD
argocd app list
argocd app get tracc

# Via kubectl
kubectl get all -n tracc
kubectl get all -n khushal-apps
```

### View Logs
```bash
# Application logs
kubectl logs -n tracc deployment/tracc-ui --tail=50

# System component logs
kubectl logs -n kube-system deployment/external-dns --tail=50
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=50
```

## Troubleshooting

See [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) for common issues and solutions.

### Quick Fixes

**DNS not resolving?**
```bash
kubectl rollout restart deployment/external-dns -n kube-system
```

**Pods not starting?**
```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

**503 errors from ALB?**
```bash
kubectl get endpoints -n <namespace>
kubectl rollout restart deployment/<deployment> -n <namespace>
```

## Contributing

1. Create feature branch from `main`
2. Make changes to manifests
3. Test with `kubectl diff -k <app>/overlays/aws`
4. Commit and push changes
5. ArgoCD will automatically sync (or manually sync if needed)

## License

Private repository - All rights reserved 