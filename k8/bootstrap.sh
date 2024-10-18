#!/bin/bash

helm repo add cnpg https://cloudnative-pg.github.io/charts
helm upgrade --install cnpg \
  --namespace cnpg-system \
  --create-namespace \
  cnpg/cloudnative-pg


kubectl exec -it db-1 -- /bin/bash cd /docker-entrypoint-initdb.d. && /migrate.sh

# test ingress with adrress spoofing
curl --resolve "supabase.intellecta-lk.com:80:$( minikube ip )" -i http://supabase.intellecta-lk.com

# setup ip table to route traffic to minikube cluster from public network
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination $(minikube ip):80
sudo iptables -A FORWARD -p tcp -d $(minikube ip) --dport 80 -j ACCEPT


# enabling PVC Volume Expansion Feature
kubectl get storagreclass
kubectl edit storageclass gp2
## ----- add allowVolumeExpansion: true as an root a ---##