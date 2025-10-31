#!/bin/zsh

ACCOUNT_ID="0b0ee2b5eaf1fb8a2612e40ab6488052"
ZONE_ID="d039c043038a043b26f557f6ec1312d4"

echo "Setting up Cloudflare Access for admin endpoints..."

# Create Access application
APP_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps" \
  -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Parked Domains Admin",
    "domain": "boz.dev",
    "type": "self_hosted",
    "session_duration": "24h",
    "allowed_idps": [],
    "auto_redirect_to_identity": false,
    "enable_binding_cookie": false,
    "http_only_cookie_attribute": true,
    "same_site_cookie_attribute": "strict",
    "logo_url": "",
    "skip_interstitial": false,
    "app_launcher_visible": true,
    "policies": [
      {
        "name": "Allow daniel@bozza.au",
        "decision": "allow",
        "include": [
          {
            "email": {
              "email": "daniel@bozza.au"
            }
          }
        ]
      }
    ],
    "path_patterns": [
      "/admin/*"
    ]
  }')

echo "$APP_RESPONSE" | jq '.'

# Extract app ID
APP_ID=$(echo "$APP_RESPONSE" | jq -r '.result.id')

if [ "$APP_ID" != "null" ] && [ -n "$APP_ID" ]; then
  echo ""
  echo "✅ Access application created successfully!"
  echo "App ID: $APP_ID"
  echo ""
  echo "Now update the Gateway rule to allow authenticated Access requests:"
  echo "1. Go to: https://dash.cloudflare.com/$ACCOUNT_ID/zero-trust/gateway/firewall-policies/http"
  echo "2. Find rule ID: c4c260cd-dc22-403e-ac2d-e6e8e6ce6784"
  echo "3. Add exception: 'Access Application' is 'Parked Domains Admin'"
else
  echo ""
  echo "❌ Failed to create Access application"
  echo "Response: $APP_RESPONSE"
fi
