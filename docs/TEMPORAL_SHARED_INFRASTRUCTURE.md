# Temporal as Shared Infrastructure

## Overview
Temporal will be deployed as shared infrastructure in the EKS cluster, serving workflow orchestration needs for both `tracc` and `swaminarayan-timeline` applications.

## Architecture

### Namespace Structure
```
┌──────────────────────────────────────────────────────────┐
│                     EKS Cluster                          │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │ temporal namespace (Shared Infrastructure)      │     │
│  │                                                 │     │
│  │  Temporal Server Components:                   │     │
│  │  ├── Frontend Service (7233)                   │     │
│  │  ├── Matching Service                          │     │
│  │  ├── History Service                           │     │
│  │  └── Worker Service                            │     │
│  │                                                 │     │
│  │  Temporal Web UI (8080)                        │     │
│  │  PostgreSQL Database                           │     │
│  │  ElasticSearch (optional)                      │     │
│  └─────────────────────────────────────────────────┘     │
│                         ↑                                │
│            ┌────────────┴───────────┐                    │
│            │                        │                    │
│  ┌─────────────────────┐  ┌──────────────────────┐      │
│  │ tracc namespace     │  │ swaminarayan-timeline│      │
│  │                     │  │ namespace            │      │
│  │ Workers & Workflows │  │ Workers & Workflows  │      │
│  └─────────────────────┘  └──────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

## Pod Requirements

### Minimal Setup (Development)
```yaml
temporal namespace:
├── temporal-frontend         (1 pod)  # 256Mi RAM, 100m CPU
├── temporal-history          (1 pod)  # 512Mi RAM, 200m CPU
├── temporal-matching         (1 pod)  # 256Mi RAM, 100m CPU
├── temporal-worker           (1 pod)  # 256Mi RAM, 100m CPU
├── temporal-web-ui           (1 pod)  # 128Mi RAM, 50m CPU
└── postgresql                (1 pod)  # 512Mi RAM, 200m CPU
Total: 6 pods, ~2GB RAM, ~750m CPU
```

### Production Setup (HA)
```yaml
temporal namespace:
├── temporal-frontend         (2 pods)  # 512Mi RAM each
├── temporal-history          (2 pods)  # 1Gi RAM each
├── temporal-matching         (2 pods)  # 512Mi RAM each
├── temporal-worker           (2 pods)  # 512Mi RAM each
├── temporal-web-ui           (1 pod)   # 256Mi RAM
├── postgresql                (1 pod)   # 1Gi RAM
└── elasticsearch (optional)  (1 pod)   # 2Gi RAM
Total: 10-11 pods, ~7-9GB RAM, ~2-3 CPU
```

## Cross-Namespace Communication

### Service Discovery
Applications in different namespaces can connect to Temporal using Kubernetes DNS:

```python
# From tracc namespace
temporal_client = await Client.connect(
    "temporal-frontend.temporal.svc.cluster.local:7233"
)

# From swaminarayan-timeline namespace
temporal_client = await Client.connect(
    "temporal-frontend.temporal.svc.cluster.local:7233"
)
```

### Network Policies
If network policies are enabled, allow traffic from app namespaces:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-temporal-access
  namespace: temporal
spec:
  podSelector:
    matchLabels:
      app: temporal
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: tracc
    - namespaceSelector:
        matchLabels:
          name: swaminarayan-timeline
    ports:
    - protocol: TCP
      port: 7233
```

## Deployment Strategy

### 1. Helm Installation
```bash
# Create namespace
kubectl create namespace temporal

# Add Temporal Helm repository
helm repo add temporal https://go.temporal.io/helm-charts
helm repo update

# Install Temporal (minimal setup)
helm install temporal temporal/temporal \
  --namespace temporal \
  --set server.replicaCount=1 \
  --set cassandra.enabled=false \
  --set postgresql.enabled=true \
  --set postgresql.persistence.size=10Gi \
  --set elasticsearch.enabled=false \
  --set prometheus.enabled=false \
  --set grafana.enabled=false
```

### 2. Kustomize Structure
```
khushal-k8s-manifests/
├── temporal/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── temporal-server-deployment.yaml
│   │   ├── temporal-server-service.yaml
│   │   ├── temporal-web-deployment.yaml
│   │   ├── temporal-web-service.yaml
│   │   ├── postgresql-deployment.yaml
│   │   ├── postgresql-service.yaml
│   │   ├── postgresql-pvc.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       └── aws/
│           ├── patches/
│           │   ├── resource-limits.yaml
│           │   └── replicas.yaml
│           └── kustomization.yaml
```

## Use Cases by Application

### Tracc Workflows
```python
# Budget Management Workflow
@workflow.defn
class MonthlyBudgetWorkflow:
    @workflow.run
    async def run(self, user_id: str, month: str):
        # Check budget vs expenses
        budget_status = await workflow.execute_activity(
            check_budget_status,
            user_id,
            month,
            schedule_to_close_timeout=timedelta(seconds=30)
        )

        # Send alerts if over budget
        if budget_status.is_over:
            await workflow.execute_activity(
                send_budget_alert,
                user_id,
                budget_status
            )

        # Generate monthly report
        report = await workflow.execute_activity(
            generate_monthly_report,
            user_id,
            month,
            schedule_to_close_timeout=timedelta(minutes=5)
        )

        return report

# Recurring Transaction Workflow
@workflow.defn
class RecurringTransactionWorkflow:
    @workflow.run
    async def run(self, transaction_template: dict):
        while True:
            # Process recurring transaction
            await workflow.execute_activity(
                process_transaction,
                transaction_template
            )

            # Sleep until next occurrence
            await workflow.sleep(timedelta(days=30))
```

### SwaminarayanTimeline Workflows
```python
# AI Data Generation Workflow
@workflow.defn
class AITimelineGenerationWorkflow:
    @workflow.run
    async def run(self, source_params: dict):
        # Fetch historical sources
        sources = await workflow.execute_activity(
            fetch_historical_sources,
            source_params,
            schedule_to_close_timeout=timedelta(minutes=10)
        )

        # AI extraction (long-running)
        events = await workflow.execute_activity(
            ai_extract_events,
            sources,
            schedule_to_close_timeout=timedelta(hours=2),
            heartbeat_timeout=timedelta(minutes=1)
        )

        # Validation and enrichment
        validated = await workflow.execute_activity(
            validate_timeline_events,
            events
        )

        # Store in database
        result = await workflow.execute_activity(
            store_timeline_events,
            validated
        )

        return result

# Data Import Workflow
@workflow.defn
class DataImportWorkflow:
    @workflow.run
    async def run(self, import_config: dict):
        # Parse import file
        data = await workflow.execute_activity(
            parse_import_file,
            import_config
        )

        # Validate each record
        for batch in chunks(data, 100):
            await workflow.execute_activity(
                validate_batch,
                batch
            )

        # Import to database
        return await workflow.execute_activity(
            import_to_database,
            data
        )
```

## Resource Isolation

### Task Queues
Each application uses its own task queues to ensure isolation:

```python
# Tracc worker
worker = Worker(
    client,
    task_queue="tracc-workflows",
    workflows=[MonthlyBudgetWorkflow, RecurringTransactionWorkflow],
    activities=[check_budget_status, send_budget_alert, ...]
)

# SwaminarayanTimeline worker
worker = Worker(
    client,
    task_queue="timeline-workflows",
    workflows=[AITimelineGenerationWorkflow, DataImportWorkflow],
    activities=[fetch_historical_sources, ai_extract_events, ...]
)
```

### Temporal Namespaces (Logical Separation)
While sharing the same Temporal cluster, use different Temporal namespaces for complete isolation:

```python
# Create logical namespaces
temporal admin namespace create tracc
temporal admin namespace create swaminarayan

# Connect to specific namespace
client = await Client.connect(
    "temporal-frontend.temporal.svc.cluster.local:7233",
    namespace="tracc"  # or "swaminarayan"
)
```

## Monitoring and Observability

### Temporal Web UI
Access at: `http://temporal-web.temporal.svc.cluster.local:8080`

Can be exposed via port-forward for development:
```bash
kubectl port-forward -n temporal svc/temporal-web 8080:8080
```

### Metrics
If Prometheus is enabled, Temporal exposes metrics at:
- Frontend: `:9090/metrics`
- History: `:9091/metrics`
- Matching: `:9092/metrics`
- Worker: `:9093/metrics`

## Cost Optimization

### Shared Benefits
- **Single PostgreSQL instance**: Saves ~$20/month vs separate databases
- **Shared Temporal services**: Saves ~2-3 pods and 2GB RAM
- **Unified monitoring**: One dashboard for all workflows
- **Better resource utilization**: Temporal workers can scale based on total load

### Scaling Strategy
1. Start with minimal setup (6 pods)
2. Monitor resource usage
3. Scale individual services as needed:
   ```bash
   kubectl scale deployment temporal-history -n temporal --replicas=2
   ```

## Security Considerations

### Authentication
For production, enable Temporal's authentication:
```yaml
server:
  config:
    auth:
      enabled: true
      providers:
        - type: jwt
          issuer: "https://your-auth-provider.com"
```

### TLS
Enable TLS between services:
```yaml
server:
  config:
    tls:
      internode:
        enabled: true
      frontend:
        enabled: true
```

## Backup and Recovery

### PostgreSQL Backups
```bash
# Create backup
kubectl exec -n temporal postgresql-0 -- pg_dump temporal > temporal-backup.sql

# Restore backup
kubectl exec -n temporal postgresql-0 -- psql temporal < temporal-backup.sql
```

### Workflow State
Temporal maintains workflow history in PostgreSQL. Regular backups ensure workflow state recovery.

## Troubleshooting

### Common Issues
1. **Pod scheduling failures**: Check node capacity
2. **Connection timeouts**: Verify network policies
3. **High memory usage**: Scale history service
4. **Slow workflows**: Check activity timeouts

### Debug Commands
```bash
# Check Temporal server logs
kubectl logs -n temporal deployment/temporal-frontend

# Check workflow execution
temporal workflow show --workflow-id=<id>

# List running workflows
temporal workflow list --open
```

## Migration Path

### Phase 1: Deploy Temporal
- Set up minimal Temporal cluster
- Test connectivity from both namespaces

### Phase 2: Implement Workflows
- Start with simple workflows
- Gradually migrate complex logic

### Phase 3: Production Hardening
- Enable HA (multiple replicas)
- Set up monitoring
- Configure backups

## Resource Requirements Summary

### Cluster Capacity Needed
- **Current cluster**: 34 pod capacity (t2.medium x2)
- **After Temporal**: Need 41-44 pods total
- **Recommendation**: Upgrade to t3.large nodes (70 pod capacity)

### Cost Impact
- **Temporal infrastructure**: ~$30-40/month
- **Saved by sharing**: ~$20/month vs separate instances
- **Net cost increase**: ~$10-20/month