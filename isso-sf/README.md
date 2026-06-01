# ISSO San Francisco — Kustomize manifests

GitOps manifests for the [ISSO San Francisco Mandir](https://github.com/khushal1198/isso_sf)
website. Mirrors the `swaminarayan-timeline` layout.

## Layout

```
isso-sf/
├── argocd-application.yaml      # ArgoCD Application (namespace: isso-sf)
├── base/
│   ├── namespace.yaml           # namespace: isso-sf
│   ├── serviceaccount.yaml
│   ├── external-secrets.yaml    # GHCR pull creds (tracc/ghcr/credentials)
│   ├── config-configmap.yaml    # gRPC service discovery + S3 config
│   ├── ui-deployment.yaml       # UI server (:8000) + NodePort Service :80
│   ├── content-deployment.yaml  # Content gRPC (:50051) + ClusterIP
│   ├── auth-deployment.yaml     # Auth gRPC (:50052) + ClusterIP
│   └── kustomization.yaml
└── overlays/aws/
    ├── kustomization.yaml        # patches, image tags, config/secret generators
    ├── ingress.yaml              # ALB (shared group tracc-production), host:
    │                             #   isso.swaminarayantimeline.org (temporary)
    ├── external-secrets-patch.yaml
    └── patches/{ui,content,auth}-patch.yaml
```

## Services

| Service | Image                                   | Port  | Exposure  |
| ------- | --------------------------------------- | ----- | --------- |
| ui      | ghcr.io/khushal1198/isso_sf-ui          | 8000  | ALB → :80 |
| content | ghcr.io/khushal1198/isso_sf-content     | 50051 | ClusterIP |
| auth    | ghcr.io/khushal1198/isso_sf-auth        | 50052 | ClusterIP |

The UI server is the single public entry point; it serves the SPA and proxies
`/api/*` to the content/auth gRPC services in-cluster.

## Deploy

```bash
kubectl apply -f isso-sf/argocd-application.yaml   # registers the ArgoCD app
```

Image tags are bumped automatically by the `isso_sf` repo's CI (it commits new
`main-<sha>` tags into `base/*-deployment.yaml` and `overlays/aws/patches/*`).

## TODO before go-live

- **Host:** temporary `isso.swaminarayantimeline.org`; switch ingress + external-dns
  to the real domain (e.g. `issosf.org`) once approved (needs its own ACM cert
  unless covered by an existing wildcard).
- **Secrets:** replace the placeholder `isso-sf-secrets` (jwt-secret,
  admin-password, database-url) with real values via External Secrets / SealedSecrets.
- **Persistence:** provision Postgres + an S3 media bucket (`ISSO_S3_BUCKET`).
