/**
 * Parked Domain Tracker - Cloudflare Worker
 * 
 * Displays parking page and logs comprehensive visitor information
 * for domains: boz.dev, bozza.ai, e-flux.au
 */

interface Env {
  DB: D1Database;
  CLOUDFLARE_API_KEY: string;
  CLOUDFLARE_EMAIL: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

interface VisitorData {
  timestamp: string;
  domain: string;
  path: string;
  method: string;
  ip: string;
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  asn?: string;
  user_agent: string;
  browser?: string;
  browser_version?: string;
  os?: string;
  device_type?: string;
  is_mobile: boolean;
  is_bot: boolean;
  referer?: string;
  accept_language?: string;
  accept_encoding?: string;
  headers: string;
  query_params?: string;
  tls_version?: string;
  http_protocol?: string;
  cloudflare_ray?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Admin endpoint to view logs
    if (url.pathname === '/admin/logs' && request.method === 'GET') {
      return await this.getVisitorLogs(env, url);
    }
    
    // Check if subdomain has existing records and should pass through
    const hostname = url.hostname;
    const parts = hostname.split('.');
    
    // Known active subdomains to exclude (these have real services)
    const activeSubdomains = [
      'mail.bozza.au',
      'admin.bozza.au',
    ];
    
    // If this is a known active subdomain, pass through to origin
    if (activeSubdomains.includes(hostname)) {
      return fetch(request);
    }
    
    // Log visitor data
    const visitorData = await this.extractVisitorData(request);
    await this.logVisitor(env, visitorData);
    
    // Return parking page
    return this.getParkingPage(url.hostname);
  },

  async extractVisitorData(request: Request): Promise<VisitorData> {
    const url = new URL(request.url);
    const cf = request.cf as any;
    const ua = request.headers.get('user-agent') || '';
    
    // Parse user agent
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
    const isBot = /bot|crawler|spider|scraper/i.test(ua);
    
    // Extract browser info
    let browser: string | undefined;
    let browserVersion: string | undefined;
    if (ua.includes('Chrome/')) {
      browser = 'Chrome';
      browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1];
    } else if (ua.includes('Firefox/')) {
      browser = 'Firefox';
      browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1];
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      browser = 'Safari';
      browserVersion = ua.match(/Version\/([\d.]+)/)?.[1];
    } else if (ua.includes('Edge/')) {
      browser = 'Edge';
      browserVersion = ua.match(/Edge\/([\d.]+)/)?.[1];
    }
    
    // Extract OS
    let os: string | undefined;
    if (ua.includes('Windows NT')) {
      os = 'Windows';
    } else if (ua.includes('Mac OS X')) {
      os = 'macOS';
    } else if (ua.includes('Linux')) {
      os = 'Linux';
    } else if (ua.includes('Android')) {
      os = 'Android';
    } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
      os = 'iOS';
    }
    
    // Collect all headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    // Query parameters
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    
    return {
      timestamp: new Date().toISOString(),
      domain: url.hostname,
      path: url.pathname,
      method: request.method,
      ip: request.headers.get('cf-connecting-ip') || '',
      country: cf?.country,
      city: cf?.city,
      region: cf?.region,
      timezone: cf?.timezone,
      latitude: cf?.latitude ? String(cf.latitude) : undefined,
      longitude: cf?.longitude ? String(cf.longitude) : undefined,
      asn: cf?.asn ? String(cf.asn) : undefined,
      user_agent: ua,
      browser,
      browser_version: browserVersion,
      os,
      device_type: isMobile ? 'Mobile' : 'Desktop',
      is_mobile: isMobile,
      is_bot: isBot,
      referer: request.headers.get('referer') || undefined,
      accept_language: request.headers.get('accept-language') || undefined,
      accept_encoding: request.headers.get('accept-encoding') || undefined,
      headers: JSON.stringify(headers),
      query_params: Object.keys(queryParams).length > 0 ? JSON.stringify(queryParams) : undefined,
      tls_version: cf?.tlsVersion,
      http_protocol: request.headers.get('cf-http-version') || undefined,
      cloudflare_ray: request.headers.get('cf-ray') || undefined,
    };
  },

  async logVisitor(env: Env, data: VisitorData): Promise<void> {
    try {
      await env.DB.prepare(`
        INSERT INTO visitors (
          timestamp, domain, path, method, ip, country, city, region, 
          timezone, latitude, longitude, asn, user_agent, browser, 
          browser_version, os, device_type, is_mobile, is_bot, referer, 
          accept_language, accept_encoding, headers, query_params, 
          tls_version, http_protocol, cloudflare_ray
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.timestamp, data.domain, data.path, data.method, data.ip,
        data.country || null, data.city || null, data.region || null, data.timezone || null,
        data.latitude || null, data.longitude || null, data.asn || null, data.user_agent,
        data.browser || null, data.browser_version || null, data.os || null, data.device_type || null,
        data.is_mobile ? 1 : 0, data.is_bot ? 1 : 0,
        data.referer || null, data.accept_language || null, data.accept_encoding || null,
        data.headers, data.query_params || null, data.tls_version || null,
        data.http_protocol || null, data.cloudflare_ray || null
      ).run();
    } catch (error) {
      console.error('Failed to log visitor:', error);
    }
  },

  async getVisitorLogs(env: Env, url: URL): Promise<Response> {
    try {
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const domain = url.searchParams.get('domain');
      
      let query = `SELECT * FROM visitors`;
      const params: any[] = [];
      
      if (domain) {
        query += ` WHERE domain = ?`;
        params.push(domain);
      }
      
      query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      
      const result = await env.DB.prepare(query).bind(...params).all();
      
      return new Response(JSON.stringify({
        success: true,
        count: result.results?.length || 0,
        logs: result.results
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to fetch logs', 
        message: String(error) 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  getParkingPage(domain: string): Response {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parked Domain - ${domain}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 60px 40px;
      max-width: 600px;
      width: 100%;
      text-align: center;
    }
    
    .logo {
      font-size: 48px;
      font-weight: 800;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 20px;
    }
    
    .domain {
      font-size: 28px;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 30px;
    }
    
    .status {
      display: inline-block;
      background: #f7fafc;
      border: 2px solid #e2e8f0;
      border-radius: 50px;
      padding: 12px 30px;
      font-size: 14px;
      font-weight: 600;
      color: #4a5568;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 30px;
    }
    
    .message {
      font-size: 16px;
      color: #718096;
      line-height: 1.6;
      margin-bottom: 40px;
    }
    
    .contact {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 40px;
      border-radius: 50px;
      text-decoration: none;
      display: inline-block;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .contact:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    
    .footer {
      margin-top: 40px;
      font-size: 12px;
      color: #a0aec0;
    }
    
    @media (max-width: 600px) {
      .container {
        padding: 40px 30px;
      }
      
      .logo {
        font-size: 36px;
      }
      
      .domain {
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">BRUTEFORCE</div>
    <div class="domain">${domain}</div>
    <div class="status">⚡ Parked Domain</div>
    <div class="message">
      This domain is currently parked and managed by Bruteforce Group.<br>
      Domain infrastructure is monitored and secured.
    </div>
    <a href="mailto:daniel@bruteforce.group" class="contact">Contact Us</a>
    <div class="footer">
      Powered by Cloudflare Workers • Bruteforce Group
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Powered-By': 'Bruteforce Group',
      }
    });
  }
};
