#!/bin/bash

# Set up authentication - ensure only token is used
unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL

# List of all domains to check
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

echo "Checking current Cloudflare zones..."
CURRENT_ZONES=$(CF_API_TOKEN=$CLOUDFLARE_API_TOKEN cli4 /zones | jq -r '.[] | .name' | sort)

echo "Current zones in Cloudflare:"
echo "$CURRENT_ZONES"
echo ""

MISSING_DOMAINS=()
EXISTING_DOMAINS=()

for domain in "${DOMAINS[@]}"; do
    if echo "$CURRENT_ZONES" | grep -q "^$domain$"; then
        EXISTING_DOMAINS+=("$domain")
    else
        MISSING_DOMAINS+=("$domain")
    fi
done

echo "=== ANALYSIS ==="
echo "Total domains to check: ${#DOMAINS[@]}"
echo "Already in Cloudflare: ${#EXISTING_DOMAINS[@]}"
echo "Missing from Cloudflare: ${#MISSING_DOMAINS[@]}"
echo ""

if [ ${#EXISTING_DOMAINS[@]} -gt 0 ]; then
    echo "Domains already in Cloudflare:"
    printf '%s\n' "${EXISTING_DOMAINS[@]}" | sort
    echo ""
fi

if [ ${#MISSING_DOMAINS[@]} -gt 0 ]; then
    echo "Domains missing from Cloudflare:"
    printf '%s\n' "${MISSING_DOMAINS[@]}" | sort
    echo ""
    
    echo "=== ADDING MISSING DOMAINS ==="
    for domain in "${MISSING_DOMAINS[@]}"; do
        echo "Adding $domain..."
        result=$(CF_API_TOKEN=$CLOUDFLARE_API_TOKEN cli4 --post /zones name="$domain" 2>&1)
        if echo "$result" | grep -q "\"success\":true"; then
            echo "✅ Successfully added $domain"
        else
            echo "❌ Failed to add $domain: $result"
        fi
        sleep 1  # Rate limiting courtesy
    done
else
    echo "All domains are already managed by Cloudflare! ✅"
fi

echo ""
echo "=== FINAL ZONE COUNT ==="
FINAL_COUNT=$(CF_API_TOKEN=$CLOUDFLARE_API_TOKEN cli4 /zones | jq -r '.[] | .name' | wc -l)
echo "Total zones now in Cloudflare: $FINAL_COUNT"