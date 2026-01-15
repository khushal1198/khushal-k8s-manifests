# Troubleshooting Guide

## Quick Diagnostics

### Check Overall Cluster Health
```bash
# Quick cluster health check
kubectl get nodes
kubectl get pods -A | grep -v Running | grep -v Completed
kubectl top nodes
```

## Common Issues and Solutions

### 1. DNS Not Resolving

**Symptom**: Cannot reach tracc.ai or other domains

**Diagnosis**:
```bash
# Check DNS resolution
dig tracc.ai
nslookup tracc.ai

# Check ALB endpoint
kubectl get ingress -n tracc tracc-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Compare DNS vs actual ALB
aws route53 list-resource-record-sets --hosted-zone-id Z03221091NCPH6794VE8O --query "ResourceRecordSets[?Name=='tracc.ai.']"
```

**Solutions**:
1. If DNS points to wrong ALB:
   ```bash
   # Restart External DNS to force sync
   kubectl rollout restart deployment/external-dns -n kube-system
   ```

2. If External DNS not working:
   ```bash
   # Check logs
   kubectl logs -n kube-system deployment/external-dns --tail=50

   # Verify annotation exists
   kubectl get ingress -n tracc tracc-ingress -o yaml | grep external-dns
   ```

3. Manual DNS fix:
   ```bash
   # Update Route 53 manually if needed
   aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch file://dns-update.json
   ```

---

### 2. Pods Stuck in Pending State

**Symptom**: Pods won't start, stuck in Pending

**Diagnosis**:
```bash
# Check pod events
kubectl describe pod <pod-name> -n <namespace>

# Check node capacity
kubectl describe nodes | grep -A 5 "Allocated resources"

# Check for PVC issues
kubectl get pvc -A
```

**Solutions**:
1. If nodes are full:
   ```bash
   # Scale down non-critical deployments
   kubectl scale deployment <deployment> -n <namespace> --replicas=1

   # Or add more nodes (if using managed node group)
   eksctl scale nodegroup --cluster=tracc-cluster --name=<nodegroup> --nodes=3
   ```

2. If PVC pending:
   ```bash
   # Check storage class
   kubectl get storageclass
   kubectl describe pvc <pvc-name> -n <namespace>
   ```

---

### 3. 503 Service Unavailable

**Symptom**: ALB returns 503 error

**Diagnosis**:
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn <arn>

# Check pod health
kubectl get pods -n <namespace>
kubectl describe pod <pod-name> -n <namespace>

# Check service endpoints
kubectl get endpoints -n <namespace>
```

**Solutions**:
1. If pods are unhealthy:
   ```bash
   # Check logs
   kubectl logs -n <namespace> deployment/<deployment-name>

   # Restart pods
   kubectl rollout restart deployment/<deployment-name> -n <namespace>
   ```

2. If no endpoints:
   ```bash
   # Verify service selector matches pod labels
   kubectl get pods -n <namespace> --show-labels
   kubectl get svc <service-name> -n <namespace> -o yaml
   ```

---

### 4. Image Pull Errors

**Symptom**: ErrImagePull or ImagePullBackOff

**Diagnosis**:
```bash
# Check pod events
kubectl describe pod <pod-name> -n <namespace>

# Check if secret exists
kubectl get secrets -n <namespace> | grep docker
```

**Solutions**:
1. For GHCR images:
   ```bash
   # Create/update image pull secret
   kubectl create secret docker-registry ghcr-secret \
     --docker-server=ghcr.io \
     --docker-username=<github-username> \
     --docker-password=<github-token> \
     -n <namespace>
   ```

2. Verify image exists:
   ```bash
   docker pull ghcr.io/khushal1198/<image>:<tag>
   ```

---

### 5. ALB Not Created

**Symptom**: Ingress exists but no ALB endpoint

**Diagnosis**:
```bash
# Check ingress status
kubectl describe ingress <ingress-name> -n <namespace>

# Check ALB controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=100 | grep -i error
```

**Solutions**:
1. Check annotations:
   ```bash
   # Ensure required annotations exist
   kubectl get ingress <ingress-name> -n <namespace> -o yaml | grep -A 10 annotations
   ```

2. Verify IAM permissions:
   ```bash
   # Check service account
   kubectl describe sa aws-load-balancer-controller -n kube-system
   ```

---

### 6. ArgoCD Sync Issues

**Symptom**: ArgoCD shows OutOfSync or sync fails

**Diagnosis**:
```bash
# Check application status
kubectl get application <app-name> -n argocd
argocd app get <app-name>

# Check events
kubectl get events -n argocd --sort-by='.lastTimestamp'
```

**Solutions**:
1. Manual sync:
   ```bash
   argocd app sync <app-name>
   ```

2. Hard refresh:
   ```bash
   argocd app get <app-name> --hard-refresh
   ```

3. Check Git repository:
   ```bash
   cd ~/khushal-k8s-manifests
   git pull
   git status
   ```

---

### 7. Certificate Issues

**Symptom**: SSL/TLS certificate errors

**Diagnosis**:
```bash
# Check certificate ARN in ingress
kubectl get ingress <ingress-name> -n <namespace> -o yaml | grep certificate-arn

# Verify certificate in ACM
aws acm describe-certificate --certificate-arn <arn>
```

**Solutions**:
1. Update certificate ARN:
   ```bash
   kubectl annotate ingress <ingress-name> -n <namespace> \
     alb.ingress.kubernetes.io/certificate-arn=<new-arn> \
     --overwrite
   ```

2. Request new certificate:
   ```bash
   aws acm request-certificate --domain-name "*.tracc.ai" --validation-method DNS
   ```

---

### 8. Database Connection Issues

**Symptom**: Pods can't connect to database

**Diagnosis**:
```bash
# Check database secret
kubectl get secret -n <namespace> database-credentials -o yaml

# Test from pod
kubectl exec -it <pod-name> -n <namespace> -- nc -zv <db-host> 5432
```

**Solutions**:
1. Update database credentials:
   ```bash
   # If using External Secrets
   kubectl delete secret database-credentials -n <namespace>
   # ESO will recreate with latest values
   ```

2. Check security groups:
   ```bash
   # Ensure RDS security group allows EKS node IPs
   aws ec2 describe-security-groups --group-ids <sg-id>
   ```

---

## Useful Debugging Commands

### Logs
```bash
# Application logs
kubectl logs -f -n <namespace> deployment/<deployment>

# Previous container logs (if restarted)
kubectl logs -n <namespace> <pod-name> --previous

# All pods for an app
kubectl logs -n <namespace> -l app=<app-name> --tail=100
```

### Events
```bash
# Namespace events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# Cluster-wide events
kubectl get events --all-namespaces --sort-by='.lastTimestamp'
```

### Resource Usage
```bash
# Pod resources
kubectl top pods -n <namespace> --sort-by=memory

# Node resources
kubectl top nodes

# Detailed node info
kubectl describe nodes | grep -A 10 "Allocated resources"
```

### Network Debugging
```bash
# Test DNS from pod
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup <service-name>

# Test connectivity
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- bash
```

### AWS Resources
```bash
# List ALBs
aws elbv2 describe-load-balancers --query "LoadBalancers[*].[LoadBalancerName,DNSName]" --output table

# Check target groups
aws elbv2 describe-target-groups --load-balancer-arn <alb-arn>

# View Route 53 records
aws route53 list-resource-record-sets --hosted-zone-id <zone-id>
```

---

## Emergency Procedures

### 1. Complete Service Outage
```bash
# 1. Check cluster status
kubectl get nodes
kubectl get pods -A | grep -v Running

# 2. Check ALB health
aws elbv2 describe-load-balancers

# 3. Restart critical services
kubectl rollout restart deployment -n tracc
kubectl rollout restart deployment/aws-load-balancer-controller -n kube-system
kubectl rollout restart deployment/external-dns -n kube-system

# 4. Check DNS
dig tracc.ai
```

### 2. Rollback Deployment
```bash
# Via ArgoCD
argocd app rollback <app-name> <revision>

# Via kubectl
kubectl rollout undo deployment/<deployment> -n <namespace>
kubectl rollout status deployment/<deployment> -n <namespace>
```

### 3. Node Failure
```bash
# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Drain node (move pods)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Delete node if needed
kubectl delete node <node-name>
```

---

## Performance Issues

### High Memory Usage
```bash
# Find memory hogs
kubectl top pods -A --sort-by=memory | head -20

# Check for memory leaks
kubectl logs -n <namespace> <pod-name> | grep -i "memory\|oom"
```

### High CPU Usage
```bash
# Find CPU intensive pods
kubectl top pods -A --sort-by=cpu | head -20

# Check for CPU throttling
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods | jq '.items[] | select(.containers[].usage.cpu | tonumber > 100)'
```

---

## Contact & Escalation

### Log Locations
- **Application Logs**: CloudWatch Logs `/aws/eks/tracc-cluster/containers`
- **ALB Logs**: S3 bucket (if configured)
- **External DNS Logs**: `kubectl logs -n kube-system deployment/external-dns`

### Monitoring
- **AWS Console**: https://console.aws.amazon.com/eks
- **ArgoCD**: https://argocd.tracc.ai
- **Route 53**: https://console.aws.amazon.com/route53

### Documentation
- [Deployment Infrastructure](./DEPLOYMENT_INFRASTRUCTURE.md)
- [External DNS Setup](./EXTERNAL_DNS.md)
- [Shared Namespace](./SHARED_NAMESPACE.md)