# How Kustomize Works - A Complete Guide

## What is Kustomize?

Kustomize is a tool built into kubectl that helps you customize Kubernetes manifests without directly modifying the original YAML files. Think of it like CSS for HTML - you have base files and then apply "styles" (customizations) on top.

## The Problem It Solves

Before Kustomize, you had two bad options:
1. **Duplicate files**: `deployment-dev.yaml`, `deployment-staging.yaml`, `deployment-prod.yaml` (what you had with `-aws.yaml` files)
2. **Template placeholders**: Using `${VARIABLE}` and replacing them (complex and error-prone)

Kustomize gives you a third, better option: **Overlays**

## Core Concepts

### 1. Base
The "base" contains your standard Kubernetes manifests - the common configuration that all environments share.

```
base/
├── deployment.yaml    # Standard deployment
├── service.yaml       # Standard service
└── kustomization.yaml # Tells Kustomize what files to include
```

### 2. Overlays
Overlays are environment-specific customizations that "sit on top" of the base.

```
overlays/
├── development/
│   └── kustomization.yaml  # Dev-specific changes
└── production/
    └── kustomization.yaml   # Prod-specific changes
```

### 3. Patches
Patches are surgical changes to specific parts of your manifests.

## How It Works - Step by Step

### Step 1: Kustomize reads the base
When you run `kubectl kustomize overlays/aws/`, it first looks at the overlay's `kustomization.yaml`:

```yaml
resources:
  - ../../base  # "Start with everything in base/"
```

### Step 2: Load base resources
It then loads all files listed in `base/kustomization.yaml`:

```yaml
resources:
  - namespace.yaml
  - expense-deployment.yaml
  - user-deployment.yaml
  - ui-deployment.yaml
```

### Step 3: Apply overlay-specific resources
The overlay can add new resources:

```yaml
resources:
  - ../../base
  - ingress.yaml  # AWS needs an ingress, local doesn't
```

### Step 4: Apply patches
Patches modify the base resources:

```yaml
patches:
  - target:
      kind: Deployment
      name: tracc-expense
    path: patches/expense-patch.yaml
```

The patch file (`patches/expense-patch.yaml`) contains only the changes:
```yaml
spec:
  template:
    spec:
      containers:
      - name: expense-service
        resources:          # Different limits for AWS
          limits:
            memory: "512Mi"  # More memory in production
            cpu: "500m"
```

### Step 5: Apply transformations
Kustomize can also do bulk changes:

```yaml
# Change all image tags
images:
  - name: ghcr.io/khushal1198/tracc-expense
    newTag: v2.0.0  # Update version

# Add labels to everything
labels:
  - pairs:
      environment: production

# Set namespace for all resources
namespace: production-namespace
```

## Real Example - What Happens

Let's trace through your actual setup:

### 1. Base deployment (simplified)
```yaml
# base/expense-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tracc-expense
spec:
  template:
    spec:
      containers:
      - name: expense-service
        image: ghcr.io/khushal1198/tracc-expense:latest
        resources:
          limits:
            memory: "256Mi"
```

### 2. AWS overlay applies changes
```yaml
# overlays/aws/kustomization.yaml
images:
  - name: ghcr.io/khushal1198/tracc-expense
    newTag: master-e5b67d5  # Changes tag

labels:
  - pairs:
      environment: production  # Adds label
```

### 3. AWS patch adds more
```yaml
# overlays/aws/patches/expense-patch.yaml
spec:
  template:
    spec:
      containers:
      - name: expense-service
        resources:
          limits:
            memory: "512Mi"  # Overrides memory
        env:  # Adds environment variables
        - name: DB_HOST
          value: "rds.amazonaws.com"
```

### 4. Final result
Kustomize merges everything:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tracc-expense
  labels:
    environment: production  # Added by overlay
spec:
  template:
    spec:
      containers:
      - name: expense-service
        image: ghcr.io/khushal1198/tracc-expense:master-e5b67d5  # Tag changed
        resources:
          limits:
            memory: "512Mi"  # Overridden by patch
        env:  # Added by patch
        - name: DB_HOST
          value: "rds.amazonaws.com"
```

## Commands You'll Use

### View the final result
```bash
kubectl kustomize overlays/aws/
```
This shows you the final YAML that will be applied, after all transformations.

### Apply to cluster
```bash
kubectl apply -k overlays/aws/
```
The `-k` flag tells kubectl to use Kustomize.

### See the difference
```bash
# Compare base vs overlay
diff <(kubectl kustomize base/) <(kubectl kustomize overlays/aws/)
```

## Why This Is Better

1. **DRY (Don't Repeat Yourself)**: Base configuration defined once
2. **Clear Environment Differences**: Easy to see what's different in AWS vs local
3. **No Duplicates**: Single source of truth for each resource
4. **Version Control Friendly**: Changes are isolated and reviewable
5. **Mistake Prevention**: Can't accidentally edit the wrong environment's file
6. **GitOps Ready**: ArgoCD understands Kustomize natively

## Your Specific Setup

- **Base** (`tracc/base/`): Contains your core services without any AWS-specific stuff
- **AWS Overlay** (`tracc/overlays/aws/`): Adds:
  - ALB Ingress (only needed in AWS)
  - Service Account for AWS IAM
  - Environment variables from Secrets
  - Higher resource limits
  - Specific image tags

When ArgoCD syncs, it runs `kubectl kustomize tracc/overlays/aws/` and applies the result.

## Common Patterns

### Adding a new environment variable to all services
Instead of editing 3 files, add one patch:
```yaml
patches:
  - target:
      kind: Deployment
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/env/-
        value:
          name: NEW_VAR
          value: "value"
```

### Scaling replicas in production
```yaml
replicas:
  - name: tracc-expense
    count: 3  # Run 3 replicas in production
```

### Different images per environment
```yaml
images:
  - name: ghcr.io/khushal1198/tracc-expense
    newTag: stable  # Production uses stable
    # Development might use 'latest'
```

## Troubleshooting

### See what Kustomize is doing
```bash
kubectl kustomize overlays/aws/ | less
```

### Validate syntax
```bash
kubectl kustomize overlays/aws/ > /dev/null && echo "Valid!" || echo "Error!"
```

### Debug patches
```bash
# See just one resource
kubectl kustomize overlays/aws/ | yq 'select(.metadata.name == "tracc-expense")'
```

## The Magic

The real magic is that Kustomize is **declarative** - you describe what you want, not how to build it. This makes it:
- Predictable
- Repeatable
- Version-controllable
- Easy to understand (once you know the concepts!)

Think of it like this:
- **Base** = Default settings
- **Overlay** = Environment-specific overrides
- **Patches** = Surgical modifications
- **Result** = Base + Overlay + Patches merged together

That's Kustomize in a nutshell! 🎯