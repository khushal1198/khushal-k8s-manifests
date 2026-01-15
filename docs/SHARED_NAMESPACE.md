# Shared Namespace Architecture

## Overview

We've implemented a shared namespace architecture to optimize costs and resource utilization across multiple applications. This reduces the number of ALBs needed and simplifies infrastructure management.

## Implementation Date
- **Implemented**: January 14, 2026
- **Cost Savings**: ~50% reduction in ALB costs

## Architecture

### Before (Separate Namespaces)
```
tracc namespace          → tracc ALB ($16/month)
swaminarayan namespace   → swaminarayan ALB ($16/month)
Total: 2 ALBs = $32/month
```

### After (Shared Namespace)
```
khushal-apps namespace → Unified ALB ($16/month)
  ├── tracc services
  └── swaminarayan services
Total: 1 ALB = $16/month (50% savings)
```

## Namespace Configuration

### Shared Namespace: khushal-apps
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: khushal-apps
  labels:
    app: shared-infrastructure
    environment: production
```

### Applications Using Shared Namespace
1. **tracc** - Expense tracking application
2. **swaminarayan-timeline** - Timeline visualization application

## Migration Process

### Step 1: Create Shared Namespace
```bash
kubectl apply -f shared/base/namespace.yaml
```

### Step 2: Update Application Deployments
Each application's kustomization.yaml was updated:
```yaml
namespace: khushal-apps  # Changed from individual namespaces
```

### Step 3: Configure Unified Ingress
Single ingress handling multiple hosts:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: unified-ingress
  namespace: khushal-apps
  annotations:
    alb.ingress.kubernetes.io/group.name: khushal-production
spec:
  rules:
  - host: tracc.khushalpujara.com
    http:
      paths:
      - path: /
        backend:
          service:
            name: tracc-ui
  - host: swaminarayan.khushalpujara.com
    http:
      paths:
      - path: /
        backend:
          service:
            name: swaminarayan-timeline-ui
```

## Benefits

1. **Cost Reduction**
   - Single ALB instead of multiple ($16/month saved per additional app)
   - Shared ingress controller resources

2. **Simplified Management**
   - Single namespace to monitor
   - Unified RBAC policies
   - Centralized secrets management

3. **Resource Efficiency**
   - Better pod packing on nodes
   - Reduced overhead from namespace isolation

## Service Isolation

Despite sharing a namespace, services remain isolated:

### Network Isolation
- Services only expose required ports
- Network policies can be applied if needed
- Each service has its own service account

### Resource Quotas
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: khushal-apps-quota
  namespace: khushal-apps
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    persistentvolumeclaims: "10"
```

### Naming Convention
To prevent conflicts, services follow this naming pattern:
- `{app-name}-{component}`
- Examples: `tracc-ui`, `swaminarayan-timeline-api`

## Adding New Applications

To add a new application to the shared namespace:

1. **Update Kustomization**:
```yaml
# your-app/base/kustomization.yaml
namespace: khushal-apps
```

2. **Follow Naming Convention**:
```yaml
metadata:
  name: your-app-component
  labels:
    app: your-app
    component: component-name
```

3. **Add to Unified Ingress** (if needed):
```yaml
- host: your-app.khushalpujara.com
  http:
    paths:
    - path: /
      backend:
        service:
          name: your-app-ui
```

## Monitoring

### View All Services
```bash
kubectl get all -n khushal-apps
```

### Filter by Application
```bash
# View only tracc resources
kubectl get all -n khushal-apps -l app=tracc

# View only swaminarayan resources
kubectl get all -n khushal-apps -l app=swaminarayan-timeline
```

### Check Resource Usage
```bash
kubectl top pods -n khushal-apps --sort-by=memory
```

## Rollback Plan

If you need to revert to separate namespaces:

1. **Create Individual Namespaces**:
```bash
kubectl create namespace tracc
kubectl create namespace swaminarayan-timeline
```

2. **Update Kustomizations**:
Change namespace back in each app's kustomization.yaml

3. **Deploy to Individual Namespaces**:
```bash
kubectl apply -k tracc/overlays/aws
kubectl apply -k swaminarayan-timeline/overlays/aws
```

4. **Update DNS** (if using External DNS, it will handle this automatically)

## Security Considerations

1. **Service Accounts**: Each application uses its own service account
2. **RBAC**: Fine-grained permissions per service account
3. **Secrets**: Application-specific secrets with restricted access
4. **Network Policies**: Can be implemented if stricter isolation needed

## Cost Analysis

| Component | Before (2 namespaces) | After (shared) | Savings |
|-----------|----------------------|----------------|---------|
| ALB | $32/month (2x $16) | $16/month | $16/month |
| Ingress Controller | 2 instances | 1 instance | ~$5/month |
| DNS Zones | 2 zones | 1 zone | $1/month |
| **Total** | **$38/month** | **$16/month** | **$22/month** |

Annual Savings: **$264/year**

## Best Practices

1. **Label Everything**: Use consistent labels for filtering
2. **Document Services**: Maintain service registry in README
3. **Monitor Resources**: Set up alerts for quota limits
4. **Test Isolation**: Regularly verify services can't interfere with each other
5. **Plan Capacity**: Consider growth when setting quotas

## Troubleshooting

### Service Discovery Issues
```bash
# Check service endpoints
kubectl get endpoints -n khushal-apps

# Verify service selector matches pods
kubectl describe svc <service-name> -n khushal-apps
```

### Resource Conflicts
```bash
# Check for naming conflicts
kubectl get all -n khushal-apps | grep <resource-name>

# View resource quota usage
kubectl describe resourcequota -n khushal-apps
```

### ALB Issues
```bash
# Check ingress status
kubectl describe ingress unified-ingress -n khushal-apps

# View ALB controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```