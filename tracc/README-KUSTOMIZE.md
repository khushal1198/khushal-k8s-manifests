# Tracc Kustomize Structure

This directory now uses Kustomize to manage different deployment environments, eliminating duplicate manifest files and providing a cleaner configuration structure.

## Directory Structure

```
tracc/
├── base/                    # Common resources for all environments
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── database-configmap.yaml
│   ├── external-secrets.yaml
│   ├── expense-deployment.yaml
│   ├── user-deployment.yaml
│   └── ui-deployment.yaml
└── overlays/
    ├── local/              # Local development (future)
    │   └── kustomization.yaml
    └── aws/                # AWS production environment
        ├── kustomization.yaml
        ├── ingress.yaml
        └── patches/        # AWS-specific modifications
            ├── expense-patch.yaml
            ├── user-patch.yaml
            └── ui-patch.yaml
```

## Usage

### Deploy to AWS
```bash
kubectl apply -k overlays/aws/
```

### Preview changes
```bash
kubectl kustomize overlays/aws/
```

### Update ArgoCD Application
Update the ArgoCD application to point to the AWS overlay:
```yaml
source:
  path: tracc/overlays/aws  # Changed from tracc/
  repoURL: https://github.com/khushal1198/khushal-k8s-manifests
```

## Benefits

1. **No Duplicate Resources**: Single definition per resource
2. **Environment Separation**: Clear distinction between environments
3. **Easy Customization**: Patches allow environment-specific changes
4. **Maintainability**: Changes to base apply to all environments
5. **GitOps Ready**: Works perfectly with ArgoCD

## AWS-Specific Customizations

The AWS overlay adds:
- Service Account for IRSA (AWS IAM roles)
- Environment variables from ConfigMaps/Secrets
- AWS-optimized resource limits
- ALB Ingress configuration
- Latest container image tags