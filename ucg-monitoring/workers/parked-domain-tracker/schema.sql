-- Visitor tracking database schema for D1
CREATE TABLE IF NOT EXISTS visitors (
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

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_visitors_domain ON visitors(domain);
CREATE INDEX IF NOT EXISTS idx_visitors_timestamp ON visitors(timestamp);
CREATE INDEX IF NOT EXISTS idx_visitors_ip ON visitors(ip);
CREATE INDEX IF NOT EXISTS idx_visitors_country ON visitors(country);
CREATE INDEX IF NOT EXISTS idx_visitors_is_bot ON visitors(is_bot);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at);

-- View for summary statistics
CREATE VIEW IF NOT EXISTS visitor_stats AS
SELECT 
  domain,
  COUNT(*) as total_visits,
  COUNT(DISTINCT ip) as unique_visitors,
  COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bot_visits,
  COUNT(CASE WHEN is_mobile = 1 THEN 1 END) as mobile_visits,
  MAX(timestamp) as last_visit
FROM visitors
GROUP BY domain;
