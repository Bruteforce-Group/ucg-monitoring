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
    
    // Admin dashboard
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return this.getAdminDashboard();
    }
    
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
  },

  getAdminDashboard(): Response {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parked Domain Tracker - Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background: #f5f7fa; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header p { opacity: 0.9; font-size: 14px; }
    .controls { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); display: flex; gap: 15px; flex-wrap: wrap; align-items: center; }
    .controls label { font-weight: 600; color: #4a5568; font-size: 14px; }
    .controls select, .controls input, .controls button { padding: 8px 15px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 14px; outline: none; transition: all 0.2s; }
    .controls select:focus, .controls input:focus { border-color: #667eea; }
    .controls button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: 600; transition: transform 0.2s, box-shadow 0.2s; }
    .controls button:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); }
    .stat-card .label { font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .stat-card .value { font-size: 32px; font-weight: 700; color: #2d3748; }
    .logs-table { background: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f7fafc; }
    th { padding: 15px; text-align: left; font-weight: 600; color: #4a5568; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #2d3748; }
    tr:hover { background: #f8fafc; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-mobile { background: #fef3c7; color: #92400e; }
    .badge-desktop { background: #dbeafe; color: #1e40af; }
    .badge-bot { background: #fee2e2; color: #991b1b; }
    .loading { text-align: center; padding: 40px; color: #718096; }
    .error { background: #fee2e2; color: #991b1b; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    .pagination { display: flex; justify-content: center; gap: 10px; margin-top: 20px; padding: 20px; }
    .pagination button { padding: 8px 15px; border: 2px solid #e2e8f0; border-radius: 6px; background: white; cursor: pointer; font-weight: 600; transition: all 0.2s; }
    .pagination button:hover:not(:disabled) { background: #f7fafc; border-color: #667eea; }
    .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
    .pagination .current { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; }
    @media (max-width: 768px) { .controls { flex-direction: column; align-items: stretch; } .stats { grid-template-columns: 1fr; } table { font-size: 12px; } th, td { padding: 10px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>🚀 Parked Domain Tracker</h1><p>Admin Dashboard - Monitor visitor analytics across parked domains</p></div>
    <div class="stats">
      <div class="stat-card"><div class="label">Total Visits</div><div class="value" id="total-visits">-</div></div>
      <div class="stat-card"><div class="label">Unique IPs</div><div class="value" id="unique-ips">-</div></div>
      <div class="stat-card"><div class="label">Mobile Visits</div><div class="value" id="mobile-visits">-</div></div>
      <div class="stat-card"><div class="label">Bot Visits</div><div class="value" id="bot-visits">-</div></div>
    </div>
    <div class="controls">
      <label for="domain-filter">Domain:</label><select id="domain-filter"><option value="">All Domains</option></select>
      <label for="limit">Per Page:</label><select id="limit"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="250">250</option></select>
      <button onclick="loadLogs()">Refresh</button><button onclick="exportCSV()">Export CSV</button>
    </div>
    <div id="error" class="error" style="display: none;"></div>
    <div class="logs-table"><table><thead><tr><th>Timestamp</th><th>Domain</th><th>IP</th><th>Location</th><th>Browser</th><th>OS</th><th>Device</th><th>Referer</th></tr></thead><tbody id="logs-body"><tr><td colspan="8" class="loading">Loading logs...</td></tr></tbody></table></div>
    <div class="pagination" id="pagination"></div>
  </div>
  <script>
    let currentPage=0,currentLimit=50,currentDomain='',allLogs=[];
    async function loadLogs(){try{const offset=currentPage*currentLimit,url=\`/admin/logs?limit=\${currentLimit}&offset=\${offset}\${currentDomain?\`&domain=\${currentDomain}\`:''\}\`,response=await fetch(url),data=await response.json();if(!data.success)throw new Error(data.error||'Failed to load logs');allLogs=data.logs||[],displayLogs(allLogs),updateStats(allLogs),updatePagination(data.count),loadDomains(),document.getElementById('error').style.display='none'}catch(error){console.error('Error loading logs:',error),document.getElementById('error').textContent=\`Error: \${error.message}\`,document.getElementById('error').style.display='block'}}
    function displayLogs(logs){const tbody=document.getElementById('logs-body');if(logs.length===0){tbody.innerHTML='<tr><td colspan="8" class="loading">No logs found</td></tr>';return}tbody.innerHTML=logs.map(log=>\`<tr><td>\${formatDate(log.timestamp)}</td><td><strong>\${log.domain}</strong><br><small>\${log.path}</small></td><td>\${log.ip}</td><td>\${formatLocation(log)}</td><td>\${log.browser||'-'}<br><small>\${log.browser_version||''}</small></td><td>\${log.os||'-'}</td><td>\${log.is_mobile?'<span class="badge badge-mobile">Mobile</span>':'<span class="badge badge-desktop">Desktop</span>'}\${log.is_bot?' <span class="badge badge-bot">Bot</span>':''}</td><td><small>\${log.referer||'-'}</small></td></tr>\`).join('')}
    function updateStats(logs){document.getElementById('total-visits').textContent=logs.length;const uniqueIps=new Set(logs.map(log=>log.ip));document.getElementById('unique-ips').textContent=uniqueIps.size;const mobileVisits=logs.filter(log=>log.is_mobile).length;document.getElementById('mobile-visits').textContent=mobileVisits;const botVisits=logs.filter(log=>log.is_bot).length;document.getElementById('bot-visits').textContent=botVisits}
    function updatePagination(count){const pagination=document.getElementById('pagination'),totalPages=Math.ceil(count/currentLimit);if(totalPages<=1){pagination.innerHTML='';return}let html='';html+=\`<button onclick="changePage(0)" \${currentPage===0?'disabled':''}>First</button>\`;html+=\`<button onclick="changePage(\${currentPage-1})" \${currentPage===0?'disabled':''}>Previous</button>\`;html+=\`<button class="current">\${currentPage+1} / \${totalPages}</button>\`;html+=\`<button onclick="changePage(\${currentPage+1})" \${currentPage>=totalPages-1?'disabled':''}>Next</button>\`;html+=\`<button onclick="changePage(\${totalPages-1})" \${currentPage>=totalPages-1?'disabled':''}>Last</button>\`;pagination.innerHTML=html}
    async function loadDomains(){try{const response=await fetch('/admin/logs?limit=1000'),data=await response.json(),domains=[...new Set(data.logs.map(log=>log.domain))].sort(),select=document.getElementById('domain-filter'),currentValue=select.value;select.innerHTML='<option value="">All Domains</option>'+domains.map(domain=>\`<option value="\${domain}">\${domain}</option>\`).join('');select.value=currentValue}catch(error){console.error('Error loading domains:',error)}}
    function changePage(page){currentPage=page;loadLogs()}
    function formatDate(timestamp){return new Date(timestamp).toLocaleString()}
    function formatLocation(log){const parts=[];if(log.city)parts.push(log.city);if(log.region)parts.push(log.region);if(log.country)parts.push(log.country);return parts.join(', ')||'-'}
    function exportCSV(){const headers=['Timestamp','Domain','Path','IP','Country','City','Browser','OS','Device','Is Mobile','Is Bot','Referer'],rows=allLogs.map(log=>[log.timestamp,log.domain,log.path,log.ip,log.country||'',log.city||'',log.browser||'',log.os||'',log.device_type||'',log.is_mobile,log.is_bot,log.referer||'']),csv=[headers,...rows].map(row=>row.map(cell=>\`"\${cell}"\`).join(',')).join('\\n'),blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=\`parked-domain-logs-\${new Date().toISOString().split('T')[0]}.csv\`;a.click()}
    document.getElementById('domain-filter').addEventListener('change',e=>{currentDomain=e.target.value;currentPage=0;loadLogs()});
    document.getElementById('limit').addEventListener('change',e=>{currentLimit=parseInt(e.target.value);currentPage=0;loadLogs()});
    loadLogs();setInterval(loadLogs,30000);
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'no-cache',
      }
    });
  }
};
