# Shared Kubernetes Infrastructure

This directory contains the shared Kubernetes infrastructure for all applications, using a single namespace to optimize costs and simplify management.

## 🎯 Benefits of Shared Namespace

### Cost Savings
- **Single ALB**: One Application Load Balancer (~$20/month) serves all applications
- **Resource Efficiency**: Better bin packing and node utilization
- **Shared Secrets**: Reduced AWS Secrets Manager costs
- **Network Optimization**: No cross-namespace network policies needed

### Management Benefits
- **Unified Monitoring**: Single namespace to monitor and manage
- **Simplified RBAC**: One set of role bindings
- **Shared ConfigMaps**: Common configurations across apps
- **Easier Service Discovery**: Services can communicate directly

## 📁 Directory Structure

```
shared/
├── base/
│   └── namespace.yaml              # Shared namespace definition
└── overlays/
    └── aws/
        ├── unified-ingress.yaml   # Single ALB for all apps
        └── kustomization.yaml      # Master deployment config
```

## 🚀 Deployment

### Deploy Everything Together

```bash
# Deploy all applications to shared namespace
kubectl apply -k shared/overlays/aws/

# Or preview first
kustomize build shared/overlays/aws/ | kubectl diff -f -
```

### Deploy Individual Applications

```bash
# Deploy only Tracc
kubectl apply -k tracc/overlays/aws/

# Deploy only Swaminarayan Timeline
kubectl apply -k swaminarayan-timeline/overlays/aws/
```

## 🌐 Routing Configuration

The unified ingress routes traffic based on hostname:

| Domain | Application | Service |
|--------|------------|---------|
| `tracc.khushalpujara.com` | Tracc | UI, User, Expense services |
| `swaminarayan.khushalpujara.com` | Swaminarayan Timeline | UI, Timeline, Contributor services |

### Path-Based Routing

Each application has its own paths:

**Tracc:**
- `/` → UI Server
- `/api/user` → User Service
- `/api/expense` → Expense Service

**Swaminarayan Timeline:**
- `/` → UI Server
- `/api/timeline` → Timeline Service
- `/api/contributor` → Contributor Service

## 🔧 Configuration

### Namespace

All applications deploy to the `khushal-apps` namespace:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: khushal-apps
```

### Shared Resources

Resources available to all applications:
- ConfigMap: `shared-env-config`
- Secret: `shared-app-secrets`
- ServiceAccount: Specific to each app

### Service Naming Convention

To avoid conflicts, services follow this pattern:
- `{app-name}-{service-name}`
- Example: `tracc-ui`, `swaminarayan-timeline-ui`

## 📊 Cost Analysis

### Before (Separate Namespaces)
- 2 ALBs: ~$40/month
- 2 Sets of secrets: ~$2/month
- Potential underutilized nodes
- **Total: ~$42+/month**

### After (Shared Namespace)
- 1 ALB: ~$20/month
- 1 Set of shared secrets: ~$1/month
- Better node utilization
- **Total: ~$21/month**
- **Savings: ~50% on infrastructure costs**

## 🔒 Security Considerations

### Isolation
While sharing a namespace, applications maintain:
- Separate service accounts
- Different RBAC roles
- Isolated secrets (app-specific)
- Network policies (if needed)

### Best Practices
1. Use app-specific prefixes for resources
2. Implement network policies for sensitive services
3. Use separate databases or schemas
4. Regular security audits

## 🛠️ Maintenance

### Adding New Applications

1. Create app directory structure:
```bash
mkdir -p new-app/base new-app/overlays/aws
```

2. Update unified ingress with new routes
3. Add to shared kustomization
4. Deploy with shared namespace

### Monitoring

```bash
# View all pods in shared namespace
kubectl get pods -n khushal-apps

# View services
kubectl get svc -n khushal-apps

# Check ingress status
kubectl get ingress -n khushal-apps

# View logs by app
kubectl logs -n khushal-apps -l app=tracc
kubectl logs -n khushal-apps -l app=swaminarayan-timeline
```

## 📈 Scaling

### Horizontal Pod Autoscaling

Each application can scale independently:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tracc-ui-hpa
  namespace: khushal-apps
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tracc-ui
  minReplicas: 2
  maxReplicas: 10
```

### Resource Quotas

Set namespace-wide limits:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: khushal-apps-quota
  namespace: khushal-apps
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
```

## 🚨 Troubleshooting

### Service Discovery Issues

If services can't find each other:
```bash
# Check service endpoints
kubectl get endpoints -n khushal-apps

# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -n khushal-apps -- nslookup tracc-ui
```

### Resource Conflicts

If resource names conflict:
1. Ensure all resources use app-specific prefixes
2. Check labels and selectors
3. Review kustomization patches

### ALB Issues

```bash
# Check ALB controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Verify ingress annotations
kubectl describe ingress unified-app-ingress -n khushal-apps
```

## 📝 Migration Guide

### From Separate Namespaces

1. **Backup existing deployments:**
```bash
kubectl get all -n tracc -o yaml > tracc-backup.yaml
kubectl get all -n swaminarayan-timeline -o yaml > timeline-backup.yaml
```

2. **Update manifests** to use `khushal-apps` namespace

3. **Deploy to shared namespace:**
```bash
kubectl apply -k shared/overlays/aws/
```

4. **Verify services:**
```bash
kubectl get all -n khushal-apps
```

5. **Update DNS** to point to new ALB

6. **Clean up old namespaces:**
```bash
kubectl delete namespace tracc
kubectl delete namespace swaminarayan-timeline
```

## 🔮 Future Enhancements

1. **Service Mesh**: Implement Istio for advanced traffic management
2. **GitOps**: ArgoCD application sets for all apps
3. **Observability**: Unified Grafana dashboards
4. **Cost Allocation**: Kubecost for per-app cost tracking
5. **Multi-Region**: Replicate setup across regions

## 📚 Related Documentation

- [Tracc README](../tracc/README.md)
- [Swaminarayan Timeline README](../swaminarayan-timeline/README.md)
- [AWS ALB Controller Docs](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)

## Support

For issues or questions, please open an issue in the repository.