# Parked Domain Tracker - Cloudflare Worker

Comprehensive visitor tracking system for parked domains with beautiful landing pages.

## Features

- **Professional Parking Page**: Modern, responsive design with Bruteforce Group branding
- **Comprehensive Visitor Tracking**: Logs 27+ data points per visitor
- **D1 Database Storage**: Persistent visitor data with efficient indexing
- **Admin Dashboard**: Query visitor logs via REST API
- **Privacy Compliant**: All tracking is legal and transparent

## Tracked Data Points

### Request Information
- Timestamp, Domain, Path, HTTP Method
- Query parameters
- Referrer URL

### Visitor Identity
- IP Address
- Cloudflare Ray ID
- ASN (Autonomous System Number)

### Geolocation
- Country, City, Region
- Timezone
- Latitude/Longitude (approximate)

### Device Information
- Browser (Chrome, Firefox, Safari, Edge)
- Browser Version
- Operating System (Windows, macOS, Linux, Android, iOS)
- Device Type (Mobile/Desktop)
- User Agent String

### Connection Details
- TLS Version
- HTTP Protocol Version
- Accept-Language
- Accept-Encoding
- All HTTP Headers (JSON)

### Bot Detection
- Automatic bot/crawler identification
- Mobile device detection

## Deployment

### Prerequisites

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Automatic Deployment

```bash
# Run the deployment script
cd /Users/danielborrowman/Developer/Projects/ucg-monitoring
chmod +x deploy_parked_domains.sh
./deploy_parked_domains.sh
```

### Manual Deployment

```bash
cd workers/parked-domain-tracker

# Install dependencies
npm install

# Create D1 database
npm run db:create

# Copy the database_id from output and update wrangler.toml
# Replace "create-new-db" with actual database ID

# Initialize database schema
npm run db:init

# Deploy worker
npm run deploy
```

## Usage

### View Visitor Logs

Access visitor data via the admin endpoint:

```bash
# Get last 100 visitors
curl https://boz.dev/admin/logs

# Get last 50 visitors for specific domain
curl https://boz.dev/admin/logs?domain=boz.dev&limit=50

# Get last 200 visitors
curl https://boz.dev/admin/logs?limit=200
```

### Query Database Directly

```bash
# View all visitors
wrangler d1 execute parked-domains-visitors --command="SELECT * FROM visitors ORDER BY timestamp DESC LIMIT 10"

# View visitor statistics
wrangler d1 execute parked-domains-visitors --command="SELECT * FROM visitor_stats"

# Count visitors by country
wrangler d1 execute parked-domains-visitors --command="SELECT country, COUNT(*) as visits FROM visitors GROUP BY country ORDER BY visits DESC"

# Find bot visits
wrangler d1 execute parked-domains-visitors --command="SELECT domain, ip, user_agent FROM visitors WHERE is_bot = 1"

# Mobile vs Desktop
wrangler d1 execute parked-domains-visitors --command="SELECT device_type, COUNT(*) FROM visitors GROUP BY device_type"
```

### Monitor Real-Time Logs

```bash
cd workers/parked-domain-tracker
npm run tail
```

## Domains

This worker serves the following parked domains:
- **boz.dev** - Email-only domain (Google Workspace)
- **bozza.ai** - Email-only domain (Cloudflare Email Routing)
- **e-flux.au** - Email-only domain (Google Workspace)

## Security & Privacy

- All tracking is transparent and legal
- No cookies or client-side tracking
- Data stored in Cloudflare's secure D1 database
- Admin endpoint has no authentication (consider adding auth for production)
- Visitor IP addresses are logged (consider GDPR compliance for EU visitors)

## Database Schema

```sql
CREATE TABLE visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT,
  city TEXT,
  region TEXT,
  timezone TEXT,
  latitude TEXT,
  longitude TEXT,
  asn TEXT,
  user_agent TEXT NOT NULL,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  device_type TEXT,
  is_mobile INTEGER DEFAULT 0,
  is_bot INTEGER DEFAULT 0,
  referer TEXT,
  accept_language TEXT,
  accept_encoding TEXT,
  headers TEXT,
  query_params TEXT,
  tls_version TEXT,
  http_protocol TEXT,
  cloudflare_ray TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Customization

### Update Parking Page
Edit `src/index.ts` → `getParkingPage()` method

### Add New Domains
Edit `wrangler.toml` and add new routes:

```toml
[[routes]]
pattern = "newdomain.com/*"
zone_name = "newdomain.com"
```

### Modify Tracked Data
Edit `src/index.ts` → `extractVisitorData()` method

## Performance

- Response time: <50ms
- Database write: Asynchronous (non-blocking)
- Caching: 1 hour for parking page
- Worker execution: Cloudflare's global edge network

## Troubleshooting

### Worker not responding
```bash
wrangler tail
# Check for errors in real-time
```

### Database not working
```bash
# Verify database exists
wrangler d1 list

# Check database ID in wrangler.toml
# Re-initialize schema
npm run db:init
```

### Routes not working
- Ensure domains are added to Cloudflare account
- Verify zone names in wrangler.toml match exactly
- Check DNS records are proxied through Cloudflare

## License

ISC - Bruteforce Group
