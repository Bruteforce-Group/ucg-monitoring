#!/bin/bash

# All domains to check
DOMAINS=(
    "borrowman.com.au"
    "borrowman.net.au"
    "bozza.net.au"
    "bozza.com.au"
    "bruteforcecleaning.com.au"
    "bruteforce.net.au"
    "bruteforcelandscaping.com.au"
    "bruteforcegroup.com.au"
    "bruteforcepersonaltraining.com.au"
    "daddyandson.com.au"
    "dands.com.au"
    "groupit.com.au"
    "investatrade.com.au"
    "daddyandson.online"
    "dandeshon.com.au"
    "wallis.holdings"
    "thedalys.com.au"
    "bozza.online"
    "bozza.au"
    "borrowman.au"
    "bargarahotel.au"
    "dhco.au"
    "dandeshon.au"
    "investatrade.au"
    "groupit.au"
    "bruteforcepersonaltraining.au"
    "bruteforcegroup.au"
    "bruteforcelandscaping.au"
    "bruteforcecleaning.au"
    "12thteebnb.au"
    "bruteforce.au"
    "thedalys.au"
    "dands.au"
    "daddyandson.au"
    "bruteforce.group"
    "bruteforce.cleaning"
    "bruteforce.fitness"
    "bruteforce.land"
    "bruteforce.support"
    "bruteforce.cloud"
    "jackquaite.com"
    "bargarahotel.com"
    "e-flux.com.au"
    "e-flux.net.au"
    "eflux.au"
    "eflux.com.au"
    "eflux.net.au"
    "efluxdemo.au"
    "efluxdemo.com.au"
    "e-flux.au"
    "capcorporate.com.au"
    "bozza.ai"
    "boz.dev"
)

echo "Checking NS records for all domains..."
echo "======================================="
echo ""

CLOUDFLARE_COUNT=0
OTHER_NS_COUNT=0
NO_DOMAIN_COUNT=0

for domain in "${DOMAINS[@]}"; do
    echo "Checking $domain..."
    
    # Query NS records with a timeout
    ns_result=$(dig +short +time=5 +tries=2 NS "$domain" 2>/dev/null)
    
    if [ -z "$ns_result" ]; then
        echo "  ❌ No NS records found (domain may not exist)"
        ((NO_DOMAIN_COUNT++))
    elif echo "$ns_result" | grep -qi "cloudflare"; then
        echo "  ✅ Using Cloudflare nameservers:"
        echo "$ns_result" | sed 's/^/    /'
        ((CLOUDFLARE_COUNT++))
    else
        echo "  ⚠️  Using other nameservers:"
        echo "$ns_result" | sed 's/^/    /'
        ((OTHER_NS_COUNT++))
    fi
    echo ""
done

echo "======================================="
echo "SUMMARY:"
echo "Total domains checked: ${#DOMAINS[@]}"
echo "Using Cloudflare NS: $CLOUDFLARE_COUNT"
echo "Using other NS: $OTHER_NS_COUNT"
echo "No domain found: $NO_DOMAIN_COUNT"
echo ""

if [ $OTHER_NS_COUNT -gt 0 ]; then
    echo "Domains with non-Cloudflare nameservers need to be:"
    echo "1. Changed to use Cloudflare nameservers, OR"
    echo "2. Added to Cloudflare via domain registrar integration"
fi

if [ $NO_DOMAIN_COUNT -gt 0 ]; then
    echo "Domains with no NS records likely need to be registered first."
fi