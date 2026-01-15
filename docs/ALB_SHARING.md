# ALB Sharing for Cost Optimization

## Key Concept: Share ALBs, Not Namespaces!

**IMPORTANT**: Namespaces are free. ALBs cost $16-25/month each. The cost savings come from sharing ALBs across applications, NOT from sharing namespaces.

## Correct Architecture

```yaml
# Each app in its OWN namespace (good isolation)
tracc → tracc namespace
swaminarayan-timeline → swaminarayan-timeline namespace

# But they share the SAME ALB (cost savings)
Both ingresses use:
  alb.ingress.kubernetes.io/group.name: tracc-production
```

## How ALB Sharing Works

### The Magic Annotation
```yaml
alb.ingress.kubernetes.io/group.name: tracc-production
```

When multiple ingresses have the same `group.name`, they share a single ALB:
- Different hosts/paths on same ALB
- Single ALB cost ($16/month) instead of multiple
- Apps remain isolated in separate namespaces

### Example Configuration

**tracc ingress** (in tracc namespace):
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tracc-ingress
  namespace: tracc  # Own namespace
  annotations:
    alb.ingress.kubernetes.io/group.name: tracc-production  # Shared ALB
    alb.ingress.kubernetes.io/group.order: "100"
    external-dns.alpha.kubernetes.io/hostname: tracc.ai,www.tracc.ai
spec:
  rules:
  - host: tracc.ai
```

**swaminarayan-timeline ingress** (in its own namespace):
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: swaminarayan-timeline-ingress
  namespace: swaminarayan-timeline  # Own namespace
  annotations:
    alb.ingress.kubernetes.io/group.name: tracc-production  # SAME ALB!
    alb.ingress.kubernetes.io/group.order: "200"
    external-dns.alpha.kubernetes.io/hostname: swaminarayantimeline.org,www.swaminarayantimeline.org
spec:
  rules:
  - host: swaminarayantimeline.org
```

## Cost Analysis

### Without ALB Sharing
```
tracc ALB:                    $16/month
swaminarayan ALB:             $16/month
future-app ALB:               $16/month
Total:                        $48/month
```

### With ALB Sharing
```
Shared ALB (all apps):        $16/month
Total:                        $16/month
Savings:                      $32/month ($384/year)
```

## Benefits of This Approach

1. **Cost Savings**: One ALB serves multiple applications
2. **Namespace Isolation**: Each app stays in its own namespace
   - Separate RBAC policies
   - Separate resource quotas
   - Separate secrets
   - Clear boundaries
3. **Easy Management**: Apps can be deployed/deleted independently
4. **Security**: Blast radius limited to individual namespaces

## Adding New Applications

To add a new application and share the ALB:

1. **Create app in its OWN namespace**:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: my-new-app
```

2. **Use the same group.name in ingress**:
```yaml
metadata:
  namespace: my-new-app  # Own namespace
  annotations:
    alb.ingress.kubernetes.io/group.name: tracc-production  # Shared ALB
    alb.ingress.kubernetes.io/group.order: "300"  # Unique order
    external-dns.alpha.kubernetes.io/hostname: myapp.example.com
```

## Common Misconceptions

❌ **WRONG**: "We need to put all apps in one namespace to save money"
- Namespaces are free
- This reduces isolation for no benefit

✅ **RIGHT**: "We share ALBs across namespaces using group.name"
- Each app keeps its own namespace
- ALB costs are shared

## Current Setup

| Application | Namespace | ALB Group | Domain | Monthly Cost |
|------------|-----------|-----------|---------|--------------|
| tracc | tracc | tracc-production | tracc.ai | Shared |
| swaminarayan-timeline | swaminarayan-timeline | tracc-production | swaminarayantimeline.org | Shared |
| **Total ALB Cost** | | | | **$16/month** |

## External DNS Integration

External DNS automatically manages Route 53 records for all domains:
- Monitors ingresses with `external-dns.alpha.kubernetes.io/hostname`
- Updates DNS when ALB changes
- Currently monitoring: tracc.ai, swaminarayantimeline.org

## Monitoring ALB Usage

Check which ingresses share an ALB:
```bash
# Find all ingresses with same group.name
kubectl get ingress -A -o json | jq -r '.items[] |
  select(.metadata.annotations["alb.ingress.kubernetes.io/group.name"] == "tracc-production") |
  "\(.metadata.namespace)/\(.metadata.name)"'
```

Check ALB in AWS:
```bash
# The ALB name will be k8s-<groupname>-<hash>
aws elbv2 describe-load-balancers --query 'LoadBalancers[?contains(LoadBalancerName, `traccprod`)]'
```

## Best Practices

1. **Use meaningful group names**: `prod-shared`, `staging-shared`
2. **Set group.order**: Controls rule priority (100, 200, 300...)
3. **Keep namespaces separate**: Don't mix apps in one namespace
4. **Document ALB groups**: Track which apps share which ALBs
5. **Monitor costs**: AWS Cost Explorer shows ALB costs

## Troubleshooting

### Ingresses not sharing ALB?
- Check `group.name` is exactly the same (case-sensitive)
- Verify both ingresses are in same region
- Check ALB controller logs for errors

### Rule conflicts?
- Use different `group.order` values
- More specific paths get higher priority
- Check for overlapping host/path combinations

### DNS not updating?
- Verify External DNS is running: `kubectl get deployment -n kube-system external-dns`
- Check domain is in filter list: `kubectl logs -n kube-system deployment/external-dns | grep domain-filter`
- Ensure ingress has annotation: `external-dns.alpha.kubernetes.io/hostname`

## Migration Guide

To migrate existing apps to shared ALB:

1. Add `group.name` annotation to ingress
2. Apply the change
3. Wait for ALB controller to consolidate
4. Old ALB will be deleted automatically
5. DNS will update via External DNS

## Why NOT Shared Namespaces?

We initially considered putting all apps in one "khushal-apps" namespace, but this was wrong because:

1. **No cost benefit**: Namespaces are free
2. **Reduced isolation**: Apps could interfere with each other
3. **Harder management**: Can't delete/recreate individual apps easily
4. **Security risk**: Larger blast radius if compromised
5. **RBAC complexity**: Harder to give app-specific permissions

The correct approach is namespace-per-app with ALB sharing via group.name.

## Summary

- **Namespaces**: Use many (free, good isolation)
- **ALBs**: Use few (expensive, share via group.name)
- **Current savings**: $16/month per additional app
- **Annual savings**: $192 per app after the first
- **External DNS**: Automatically manages all DNS records