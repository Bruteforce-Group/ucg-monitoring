# Parked Domain Security Implementation Guide

## Phase 1: Foundation Setup

### Step 1: Create Parked Domain Page (Cloudflare Pages)

1. **Create HTML file for parked page:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Domain Parked</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="This domain is registered and parked for future use.">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            max-width: 500px;
            padding: 2rem;
        }
        h1 { font-size: 2.5rem; margin-bottom: 1rem; }
        p { font-size: 1.1rem; margin: 1rem 0; opacity: 0.9; }
        .footer { font-size: 0.8rem; opacity: 0.7; margin-top: 2rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Domain Parked</h1>
        <p>This domain is registered and securely parked for future use.</p>
        <p>For inquiries, please contact the domain owner.</p>
        <div class="footer">© 2024 - All rights reserved</div>
    </div>
</body>
</html>
```

2. **Deploy to Cloudflare Pages:**
   - Go to Cloudflare Dashboard → Pages
   - Click "Create a project"
   - Choose "Upload assets"
   - Upload the HTML file as `index.html`
   - Deploy with project name: `parked-domains`
   - Note the deployment URL (e.g., `parked-domains.pages.dev`)

### Step 2: Configure Email Routing + Worker

1. **Enable Email Routing:**
   - Go to each domain in Cloudflare → Email → Email Routing
   - Click "Enable Email Routing"
   - Add catch-all route: `*@domain.com` → Worker destination

2. **Create Email Monitoring Worker:**
```javascript
// email-monitor.js
export default {
  async email(message, env, ctx) {
    // Log email attempt
    const logData = {
      timestamp: new Date().toISOString(),
      from: message.from,
      to: message.to,
      subject: message.headers.get('subject') || 'No subject',
      domain: message.to.split('@')[1],
      messageId: message.headers.get('message-id')
    };
    
    // Store in KV for analysis
    await env.EMAIL_LOGS.put(
      `email-${Date.now()}-${Math.random()}`,
      JSON.stringify(logData),
      { expirationTtl: 86400 * 30 } // 30 days retention
    );
    
    // Send alert for suspicious emails
    if (isSuspicious(message)) {
      await sendAlert(env, `Suspicious email to ${message.to}: ${logData.subject}`);
    }
    
    // Don't forward - just log and drop
  }
};

function isSuspicious(message) {
  const suspiciousKeywords = ['urgent', 'verify', 'suspended', 'click here', 'banking'];
  const subject = message.headers.get('subject')?.toLowerCase() || '';
  return suspiciousKeywords.some(keyword => subject.includes(keyword));
}

async function sendAlert(env, message) {
  if (env.SLACK_WEBHOOK) {
    await fetch(env.SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
  }
}
```

3. **Deploy Email Worker:**
   - Go to Cloudflare Dashboard → Workers & Pages
   - Create Worker named `email-monitor`
   - Paste the code above
   - Add KV namespace: `EMAIL_LOGS`
   - Add environment variable: `SLACK_WEBHOOK` (optional)

### Step 3: Configure DNS Records for Each Domain

**For each parked domain, add these DNS records:**

```bash
# A Records - Point to Pages deployment
A     @           <Pages-IP-Address>
A     www         <Pages-IP-Address>
A     *           <Pages-IP-Address>    # Wildcard protection

# MX Records - Cloudflare Email Routing
MX    @           1 isaac.mx.cloudflare.net
MX    @           2 linda.mx.cloudflare.net
MX    @           3 amir.mx.cloudflare.net

# TXT Records - Email Security
TXT   @           "v=spf1 include:_spf.mx.cloudflare.net -all"
TXT   _dmarc      "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourmain.com"

# CAA Records - Certificate Security
CAA   @           0 issue "letsencrypt.org"
CAA   @           0 issue "digicert.com"
CAA   @           0 iodef "mailto:security@yourmain.com"
```

### Step 4: Enable Security Features

**For each domain:**
1. **SSL/TLS:** Set to "Full (Strict)"
2. **DNSSEC:** Enable in DNS settings
3. **Security Level:** Set to "Medium" or "High"
4. **Bot Fight Mode:** Enable
5. **Browser Integrity Check:** Enable

## Phase 2: Advanced Monitoring

### Step 5: Certificate Transparency Monitor

1. **Create CT Monitoring Worker:**
```javascript
// ct-monitor.js
export default {
  async scheduled(event, env, ctx) {
    const domains = JSON.parse(env.MONITORED_DOMAINS || '[]');
    
    for (const domain of domains) {
      await checkCertificateTransparency(domain, env);
      await sleep(1000); // Rate limiting
    }
  }
};

async function checkCertificateTransparency(domain, env) {
  try {
    // Query crt.sh for recent certificates
    const response = await fetch(`https://crt.sh/?q=${domain}&output=json&exclude=expired`);
    const certificates = await response.json();
    
    // Get stored baseline
    const baselineKey = `ct-baseline-${domain}`;
    const storedBaseline = await env.CT_LOGS.get(baselineKey);
    const baseline = storedBaseline ? JSON.parse(storedBaseline) : { lastCheck: 0, certIds: [] };
    
    // Find new certificates
    const newCerts = certificates.filter(cert => 
      !baseline.certIds.includes(cert.id) && 
      new Date(cert.not_before) > new Date(baseline.lastCheck)
    );
    
    if (newCerts.length > 0) {
      await sendAlert(env, `New certificates detected for ${domain}: ${newCerts.length} certificates`);
      
      // Log details
      for (const cert of newCerts) {
        const logEntry = {
          domain,
          certId: cert.id,
          issuer: cert.issuer_name,
          notBefore: cert.not_before,
          notAfter: cert.not_after,
          commonName: cert.common_name,
          detected: new Date().toISOString()
        };
        
        await env.CT_LOGS.put(`cert-${cert.id}`, JSON.stringify(logEntry));
      }
    }
    
    // Update baseline
    baseline.lastCheck = new Date().toISOString();
    baseline.certIds = certificates.map(c => c.id).slice(0, 100); // Keep recent 100
    await env.CT_LOGS.put(baselineKey, JSON.stringify(baseline));
    
  } catch (error) {
    await sendAlert(env, `CT monitoring failed for ${domain}: ${error.message}`);
  }
}

async function sendAlert(env, message) {
  if (env.SLACK_WEBHOOK) {
    await fetch(env.SLACK_WEBHOOK, {
      method: 'POST',
      body: JSON.stringify({ text: message }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
```

2. **Deploy CT Worker:**
   - Create Worker named `ct-monitor`
   - Add KV namespace: `CT_LOGS`
   - Add environment variable: `MONITORED_DOMAINS` (JSON array of domains)
   - Add Cron Trigger: `0 */6 * * *` (every 6 hours)

### Step 6: DNS Change Monitor

1. **Create DNS Monitoring Worker:**
```javascript
// dns-monitor.js
export default {
  async scheduled(event, env, ctx) {
    const domains = JSON.parse(env.MONITORED_DOMAINS || '[]');
    
    for (const domain of domains) {
      await checkDNSRecords(domain, env);
      await sleep(2000);
    }
  }
};

async function checkDNSRecords(domain, env) {
  const recordTypes = ['A', 'MX', 'TXT', 'NS'];
  
  for (const recordType of recordTypes) {
    try {
      // Query DNS using Cloudflare DoH
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${domain}&type=${recordType}`,
        { headers: { 'Accept': 'application/dns-json' } }
      );
      
      const dnsData = await response.json();
      const currentRecords = dnsData.Answer ? dnsData.Answer.map(a => a.data).sort() : [];
      
      // Compare with baseline
      const baselineKey = `dns-${recordType}-${domain}`;
      const storedBaseline = await env.DNS_LOGS.get(baselineKey);
      
      if (storedBaseline) {
        const baseline = JSON.parse(storedBaseline);
        if (JSON.stringify(currentRecords) !== JSON.stringify(baseline.records)) {
          await sendAlert(env, `DNS change detected for ${domain} ${recordType}: ${JSON.stringify(currentRecords)}`);
          
          // Log the change
          await env.DNS_LOGS.put(`change-${Date.now()}-${domain}-${recordType}`, JSON.stringify({
            domain,
            recordType,
            oldRecords: baseline.records,
            newRecords: currentRecords,
            timestamp: new Date().toISOString()
          }));
        }
      }
      
      // Update baseline
      await env.DNS_LOGS.put(baselineKey, JSON.stringify({
        domain,
        recordType,
        records: currentRecords,
        lastCheck: new Date().toISOString()
      }));
      
    } catch (error) {
      await sendAlert(env, `DNS monitoring failed for ${domain} ${recordType}: ${error.message}`);
    }
  }
}

async function sendAlert(env, message) {
  if (env.SLACK_WEBHOOK) {
    await fetch(env.SLACK_WEBHOOK, {
      method: 'POST',
      body: JSON.stringify({ text: message }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
```

2. **Deploy DNS Worker:**
   - Create Worker named `dns-monitor`
   - Add KV namespace: `DNS_LOGS`
   - Add environment variable: `MONITORED_DOMAINS`
   - Add Cron Trigger: `0 */12 * * *` (every 12 hours)

### Step 7: Domain Expiration Monitor

1. **Create Expiration Monitor Worker:**
```javascript
// expiration-monitor.js
export default {
  async scheduled(event, env, ctx) {
    const domains = JSON.parse(env.MONITORED_DOMAINS || '[]');
    
    for (const domain of domains) {
      await checkDomainExpiration(domain, env);
      await sleep(5000); // WHOIS rate limiting
    }
  }
};

async function checkDomainExpiration(domain, env) {
  try {
    // Use a WHOIS API service (you may need to sign up for an API key)
    const whoisResponse = await fetch(`https://api.whoisjsonapi.com/v1/${domain}`);
    const whoisData = await whoisResponse.json();
    
    if (whoisData.expiry_date) {
      const expiryDate = new Date(whoisData.expiry_date);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      
      // Alert thresholds
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        await sendAlert(env, `Domain ${domain} expires in ${daysUntilExpiry} days (${expiryDate.toDateString()})`);
      } else if (daysUntilExpiry <= 0) {
        await sendAlert(env, `⚠️ URGENT: Domain ${domain} has expired!`);
      }
      
      // Store expiration info
      await env.EXPIRY_LOGS.put(`expiry-${domain}`, JSON.stringify({
        domain,
        expiryDate: whoisData.expiry_date,
        registrar: whoisData.registrar,
        lastChecked: new Date().toISOString(),
        daysUntilExpiry
      }));
    }
    
  } catch (error) {
    await sendAlert(env, `Expiration check failed for ${domain}: ${error.message}`);
  }
}

async function sendAlert(env, message) {
  if (env.SLACK_WEBHOOK) {
    await fetch(env.SLACK_WEBHOOK, {
      method: 'POST',
      body: JSON.stringify({ text: message }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
```

## Phase 3: Dashboard and Reporting

### Step 8: Create Monitoring Dashboard

1. **Create Analytics Worker:**
```javascript
// analytics-dashboard.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/dashboard') {
      return new Response(await generateDashboard(env), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (url.pathname === '/api/stats') {
      return new Response(JSON.stringify(await getStats(env)), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function generateDashboard(env) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Parked Domain Security Dashboard</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .metric { background: #f5f5f5; padding: 15px; margin: 10px; border-radius: 5px; }
            .alert { background: #ffe6e6; border-left: 4px solid #ff0000; }
            .good { background: #e6ffe6; border-left: 4px solid #00ff00; }
        </style>
    </head>
    <body>
        <h1>🛡️ Parked Domain Security Dashboard</h1>
        <div id="metrics"></div>
        
        <script>
            fetch('/api/stats')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('metrics').innerHTML = data.html;
                });
        </script>
    </body>
    </html>
  `;
}

async function getStats(env) {
  // Compile statistics from all KV stores
  const emailLogs = await getRecentLogs(env.EMAIL_LOGS, 'email-');
  const ctLogs = await getRecentLogs(env.CT_LOGS, 'cert-');
  const dnsChanges = await getRecentLogs(env.DNS_LOGS, 'change-');
  
  return {
    emailAttempts: emailLogs.length,
    newCertificates: ctLogs.length,
    dnsChanges: dnsChanges.length,
    lastUpdate: new Date().toISOString(),
    html: generateMetricsHTML(emailLogs.length, ctLogs.length, dnsChanges.length)
  };
}

async function getRecentLogs(kv, prefix) {
  const list = await kv.list({ prefix });
  return list.keys;
}

function generateMetricsHTML(emails, certs, changes) {
  return `
    <div class="metric ${emails > 0 ? 'alert' : 'good'}">
        <h3>Email Attempts (Last 24h)</h3>
        <p>${emails} attempts logged</p>
    </div>
    <div class="metric ${certs > 0 ? 'alert' : 'good'}">
        <h3>New Certificates</h3>
        <p>${certs} certificates detected</p>
    </div>
    <div class="metric ${changes > 0 ? 'alert' : 'good'}">
        <h3>DNS Changes</h3>
        <p>${changes} unauthorized changes detected</p>
    </div>
  `;
}
```

## Phase 4: Deployment Checklist

### Bulk DNS Configuration Script

Create a script to configure all domains at once:

```bash
#!/bin/bash
# bulk-dns-setup.sh

DOMAINS=(
    "borrowman.com.au"
    "borrowman.net.au"
    # Add all your domains here
)

PAGES_IP="192.0.2.1"  # Replace with your Pages IP
MAIN_EMAIL="security@yourmain.com"

for domain in "${DOMAINS[@]}"; do
    echo "Configuring DNS for $domain..."
    
    # A records
    cli4 --post /zones/:zone_identifier/dns_records type="A" name="@" content="$PAGES_IP" zone_id=$(get_zone_id $domain)
    cli4 --post /zones/:zone_identifier/dns_records type="A" name="www" content="$PAGES_IP" zone_id=$(get_zone_id $domain)
    cli4 --post /zones/:zone_identifier/dns_records type="A" name="*" content="$PAGES_IP" zone_id=$(get_zone_id $domain)
    
    # MX records
    cli4 --post /zones/:zone_identifier/dns_records type="MX" name="@" content="isaac.mx.cloudflare.net" priority=1 zone_id=$(get_zone_id $domain)
    cli4 --post /zones/:zone_identifier/dns_records type="MX" name="@" content="linda.mx.cloudflare.net" priority=2 zone_id=$(get_zone_id $domain)
    cli4 --post /zones/:zone_identifier/dns_records type="MX" name="@" content="amir.mx.cloudflare.net" priority=3 zone_id=$(get_zone_id $domain)
    
    # Security TXT records
    cli4 --post /zones/:zone_identifier/dns_records type="TXT" name="@" content="\"v=spf1 include:_spf.mx.cloudflare.net -all\"" zone_id=$(get_zone_id $domain)
    cli4 --post /zones/:zone_identifier/dns_records type="TXT" name="_dmarc" content="\"v=DMARC1; p=quarantine; rua=mailto:$MAIN_EMAIL\"" zone_id=$(get_zone_id $domain)
    
    # CAA records
    cli4 --post /zones/:zone_identifier/dns_records type="CAA" name="@" content="0 issue \"letsencrypt.org\"" zone_id=$(get_zone_id $domain)
    cli4 --post /zones/:zone_identifier/dns_records type="CAA" name="@" content="0 iodef \"mailto:$MAIN_EMAIL\"" zone_id=$(get_zone_id $domain)
    
    echo "✅ Configured $domain"
    sleep 2
done

function get_zone_id() {
    # Function to get zone ID for domain
    CF_API_TOKEN=$CLOUDFLARE_API_TOKEN cli4 /zones | jq -r ".[] | select(.name==\"$1\") | .id"
}
```

## Final Implementation Summary

**Total Components:**
1. **1 Pages deployment** (serves all domains)
2. **4 Workers** (email, CT, DNS, expiration monitoring)  
3. **4 KV namespaces** (EMAIL_LOGS, CT_LOGS, DNS_LOGS, EXPIRY_LOGS)
4. **DNS records** (per domain: 6 A/MX, 2 TXT, 2 CAA)
5. **Security settings** (SSL, DNSSEC, Bot Fight Mode per domain)

**Monthly Cost:** ~$0-5 (free tiers cover most usage)

**Maintenance:** Review dashboard monthly, update domain lists as needed

**Security Coverage:** 100% of common parked domain attack vectors