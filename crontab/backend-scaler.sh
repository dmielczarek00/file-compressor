#!/bin/bash

export KUBECONFIG=/opt/actions-runner/.kube/config

ratio=2

namespace="default"
deployment="backend-deployment"

if ! kubectl get deployment "$deployment" -n "$namespace" >/dev/null 2>&1; then
    exit 0
fi

node_count=$(kubectl get nodes | grep -v control-plane | grep -w Ready | wc -l)

if [ "$node_count" -lt 1 ]; then
    exit 0
fi

replicas=$(( node_count * ratio ))

kubectl scale deployment "$deployment" \
  --replicas="$replicas" -n "$namespace"