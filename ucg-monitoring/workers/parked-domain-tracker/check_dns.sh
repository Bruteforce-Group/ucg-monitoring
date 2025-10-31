#!/bin/zsh

domains=(
  "borrowman.au"
  "borrowman.com.au"
  "borrowman.net.au"
  "boz.ai"
  "boz.dev"
  "bozza.ai"
  "bozza.au"
  "bozza.online"
  "bruteforce.au"
  "bruteforce.cloud"
  "bruteforce.group"
  "bruteforce.support"
  "bruteforcegroup.com.au"
  "dandeshon.com.au"
  "e-flux.au"
  "e-flux.com.au"
  "eflux.au"
)

echo "Checking DNS A records for all parked domains..."
echo "================================================"

for domain in "${domains[@]}"; do
  echo -n "$domain: "
  result=$(dig +short A "$domain" @1.1.1.1 | head -1)
  if [[ -z "$result" ]]; then
    echo "❌ NO A RECORD"
  else
    echo "✅ $result"
  fi
done
