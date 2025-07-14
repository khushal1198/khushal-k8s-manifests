#!/bin/bash

# Script to create Docker registry secret for GitHub Container Registry
# This should be run in your CI/CD pipeline

# Check if required environment variables are set
if [ -z "$GHCR_PAT" ]; then
    echo "Error: GHCR_PAT (GitHub Personal Access Token) must be set"
    exit 1
fi

if [ -z "$GITHUB_USERNAME" ]; then
    echo "Error: GITHUB_USERNAME must be set"
    exit 1
fi

# Create or update the docker-registry secret
kubectl create secret docker-registry ghcr-secret \
    --docker-server=ghcr.io \
    --docker-username="$GITHUB_USERNAME" \
    --docker-password="$GHCR_PAT" \
    --docker-email="$GITHUB_USERNAME@users.noreply.github.com" \
    --namespace=default \
    --dry-run=client -o yaml | kubectl apply -f -

echo "Docker registry secret created/updated successfully" 