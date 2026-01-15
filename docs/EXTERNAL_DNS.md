# External DNS Configuration

## Overview

External DNS is configured to automatically manage DNS records in Route 53 based on Kubernetes Ingress resources. This prevents DNS outages when ALBs are recreated or changed.

## Installation Date
- **Installed**: January 15, 2026
- **Cost**: ~$0.01-0.03/month

## Architecture

```
Kubernetes Ingress → External DNS Controller → Route 53
     ↓                      ↓                      ↓
ALB Created         Detects Changes         Updates DNS
```

## Configuration

### Deployment Settings
- **Namespace**: kube-system
- **Check Interval**: 5 minutes (cost-optimized)
- **Domains Monitored**:
  - tracc.ai
  - khushalpujara.com
- **Policy**: sync (creates and deletes records)
- **Resource Limits**:
  - CPU: 50m limit, 10m request
  - Memory: 100Mi limit, 50Mi request

### IAM Configuration

#### Policy: ExternalDNSPolicy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets"
      ],
      "Resource": [
        "arn:aws:route53:::hostedzone/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "route53:ListHostedZones",
        "route53:ListResourceRecordSets"
      ],
      "Resource": ["*"]
    }
  ]
}
```

#### Service Account
- **Name**: external-dns
- **Namespace**: kube-system
- **IAM Role**: Created via IRSA (IAM Roles for Service Accounts)

## Usage

### Adding DNS Management to an Ingress

Add the following annotation to any ingress you want External DNS to manage:

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/hostname: your-domain.com
```

For multiple domains:
```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/hostname: domain1.com,domain2.com,www.domain1.com
```

### Example: tracc Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tracc-ingress
  namespace: tracc
  annotations:
    external-dns.alpha.kubernetes.io/hostname: tracc.ai,www.tracc.ai
    alb.ingress.kubernetes.io/scheme: internet-facing
    # ... other ALB annotations
```

## How It Works

1. **Monitors Ingresses**: Watches for ingresses with the `external-dns.alpha.kubernetes.io/hostname` annotation
2. **Detects ALB Changes**: When ALB endpoint changes, External DNS detects it within 5 minutes
3. **Updates Route 53**: Automatically creates/updates/deletes A records to point to the correct ALB
4. **Ownership Tracking**: Uses TXT records to track which records it manages (prefix: `external-dns-tracc`)

## Monitoring

### Check External DNS Status
```bash
# View logs
kubectl logs -n kube-system deployment/external-dns

# Check if it's running
kubectl get deployment -n kube-system external-dns

# View managed records
aws route53 list-resource-record-sets --hosted-zone-id <zone-id> \
  --query "ResourceRecordSets[?contains(Name, 'external-dns')]"
```

### Verify DNS Sync
```bash
# Check current ALB endpoint
kubectl get ingress -n tracc tracc-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Check DNS resolution
dig tracc.ai +short

# Verify they match
nslookup tracc.ai
```

## Troubleshooting

### DNS Not Updating

1. **Check Annotations**:
```bash
kubectl get ingress -n <namespace> <ingress-name> -o yaml | grep external-dns
```

2. **Check External DNS Logs**:
```bash
kubectl logs -n kube-system deployment/external-dns --tail=50
```

3. **Verify IAM Permissions**:
```bash
kubectl describe sa external-dns -n kube-system
```

4. **Force Sync**:
```bash
# Restart External DNS to trigger immediate sync
kubectl rollout restart deployment/external-dns -n kube-system
```

### Common Issues

| Issue | Solution |
|-------|----------|
| DNS not updating after ALB change | Check if ingress has the hostname annotation |
| "AccessDenied" in logs | Verify IAM policy and service account IRSA |
| Records not created | Check domain-filter configuration matches your domain |
| Old records not deleted | Verify TXT ownership records exist |

## Cost Breakdown

| Component | Monthly Cost | Details |
|-----------|-------------|---------|
| Route 53 Queries | $0.02 | ~8,640 queries/month at 5-min intervals |
| Route 53 Changes | $0.01 | ~10-20 record changes/month |
| EC2/EKS Resources | $0.00 | Fits in existing cluster capacity |
| **Total** | **$0.03** | Less than 1 cent per week |

## Maintenance

### Updating External DNS
```bash
# Edit deployment to update image version
kubectl edit deployment -n kube-system external-dns

# Or apply updated manifest
kubectl apply -f external-dns-deployment.yaml
```

### Backup DNS Records
```bash
# Export all DNS records for a domain
aws route53 list-resource-record-sets \
  --hosted-zone-id <zone-id> \
  --output json > dns-backup-$(date +%Y%m%d).json
```

## Security Considerations

1. **Least Privilege**: IAM policy only allows Route 53 changes
2. **Domain Filtering**: Only monitors specified domains
3. **Ownership Records**: TXT records prevent accidental deletion of manually created records
4. **Resource Limits**: CPU and memory limits prevent resource exhaustion

## Related Documentation
- [AWS Route 53 Documentation](https://docs.aws.amazon.com/route53/)
- [External DNS GitHub](https://github.com/kubernetes-sigs/external-dns)
- [ALB Ingress Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)