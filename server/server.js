// server/server.js - Production API Server for Carnival Reserve
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const auth = require('./auth');
const domainReward = require('./domain-reward');
const magefficie = require('./magefficie');

const PORT = process.env.PORT || 3000;
const db = getDb();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    try {
      // Helper: Authenticate request via Bearer token
      const authUser = (() => {
        const authHeader = req.headers['authorization'] || '';
        let token = '';
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7).trim();
        } else if (req.headers['x-auth-token']) {
          token = String(req.headers['x-auth-token']).trim();
        }
        if (!token) return null;
        return auth.verifyToken(token);
      })();

      // 1. User & Participant Registration
      if (pathname === '/api/auth/register' && req.method === 'POST') {
        const body = await parseBody(req);
        if (body.password !== undefined) {
          const result = auth.registerUser(db, body);
          return sendJson(res, result.status || (result.error ? 400 : 201), result);
        }
        const result = auth.registerParticipant(db, body);
        return sendJson(res, result.status || (result.error ? 400 : 201), result);
      }

      // 1b. Role-Based Login (Participant, Main Supervisor, Domain POC)
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = auth.loginUser(db, body);
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 1c. Current User Profile
      if (pathname === '/api/auth/me' && req.method === 'GET') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Authentication token required.' });
        }
        let crnBalance = authUser.crnBalance || 0;
        try {
          const wal = db.prepare('SELECT balance FROM wallets WHERE participant_id = ?').get(authUser.id);
          if (wal) crnBalance = wal.balance || 0;
        } catch (e) {}
        return sendJson(res, 200, { success: true, user: { ...authUser, crnBalance } });
      }

      // 1d. Participant: Points & Activity Ledger
      if ((pathname === '/api/participant/points' || pathname === '/api/my-points') && req.method === 'GET') {
        const targetPid = authUser ? authUser.id : parsedUrl.searchParams.get('participantId');
        if (!targetPid) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Authentication required.' });
        }
        if (authUser && authUser.role === 'PARTICIPANT' && parsedUrl.searchParams.get('participantId') && parsedUrl.searchParams.get('participantId') !== authUser.id) {
          return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access denied: You can only view your own points ledger.' });
        }
        const result = auth.getParticipantPoints(db, targetPid);
        return sendJson(res, 200, result);
      }

      // 2. Participant: View Own Registrations (Strict Isolation)
      if ((pathname === '/api/my-registrations' || pathname === '/api/user/registrations') && req.method === 'GET') {
        // Must be authenticated or provide userId (dev fallback)
        const targetUserId = authUser ? authUser.id : (parsedUrl.searchParams.get('userId') || parsedUrl.searchParams.get('id'));
        if (!targetUserId) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Please sign in to view your registrations.' });
        }
        // If authenticated as a PARTICIPANT, cannot view other participants' registrations
        if (authUser && authUser.role === 'PARTICIPANT' && parsedUrl.searchParams.get('userId') && parsedUrl.searchParams.get('userId') !== authUser.id) {
          return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access denied: You can only view your own registrations.' });
        }
        const result = auth.getUserRegistrations(db, targetUserId);
        return sendJson(res, 200, result);
      }

      // 3. Domain Registration (Unique per user + domain)
      if (pathname === '/api/domains/register' && req.method === 'POST') {
        const body = await parseBody(req);
        const effectiveUserId = authUser ? authUser.id : body.userId;
        if (!effectiveUserId) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Please sign in to register for a domain.' });
        }
        const result = auth.registerForDomain(db, { ...body, userId: effectiveUserId });
        return sendJson(res, result.status || (result.error ? 400 : 201), result);
      }

      // 4. DOMAIN POC: Strictly Isolated to Assigned Domain
      if ((pathname === '/api/poc/registrations' || pathname === '/api/poc/dashboard') && req.method === 'GET') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Domain POC authentication token required.' });
        }
        if (authUser.role !== 'DOMAIN_POC') {
          return sendJson(res, 403, { 
            error: 'FORBIDDEN', 
            message: 'Access Denied: Only authorized DOMAIN_POC accounts can access this dashboard.' 
          });
        }
        if (!authUser.assignedDomainId) {
          return sendJson(res, 400, { error: 'NO_ASSIGNED_DOMAIN', message: 'No domain is assigned to this POC account.' });
        }

        // Backend queries registrations for ONLY the POC's assignedDomainId
        const result = auth.getPocRegistrations(db, authUser.assignedDomainId);
        return sendJson(res, 200, result);
      }

      // 4b. DOMAIN POC: Award Points / CRN (Strictly Assigned Domain Only)
      if (pathname === '/api/poc/points/award' && req.method === 'POST') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Domain POC authentication required.' });
        }
        if (authUser.role !== 'DOMAIN_POC') {
          return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access Denied: Only DOMAIN_POC accounts can award domain points.' });
        }
        const body = await parseBody(req);
        // Strict Domain Isolation: If domainId is supplied in body, it MUST match POC's assigned domain
        if (body.domainId && body.domainId !== authUser.assignedDomainId) {
          return sendJson(res, 403, { 
            error: 'FORBIDDEN', 
            message: `Access Denied: You are assigned to ${authUser.assignedDomainId} and cannot award points for ${body.domainId}.` 
          });
        }
        const result = auth.awardPoints(db, {
          participantId: body.participantId || body.userId,
          domainId: authUser.assignedDomainId,
          domainName: authUser.assignedDomainId,
          amount: body.amount,
          reason: body.reason,
          awardedBy: authUser.email,
          awardedByRole: 'DOMAIN_POC'
        });
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 4c. DOMAIN POC: Point History (Assigned Domain Only)
      if (pathname === '/api/poc/points/history' && req.method === 'GET') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Domain POC authentication required.' });
        }
        if (authUser.role !== 'DOMAIN_POC') {
          return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access Denied: Only DOMAIN_POC accounts can view domain point history.' });
        }
        const result = auth.getPocPointHistory(db, authUser.assignedDomainId);
        return sendJson(res, 200, result);
      }

      // 5. MAIN POC / MAIN SUPERVISOR: Cross-Domain Overview
      const isMainPoc = authUser && (authUser.role === 'MAIN_POC' || authUser.role === 'MAIN_SUPERVISOR');

      if ((pathname === '/api/supervisor/overview' || pathname === '/api/main-poc/overview') && req.method === 'GET') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Main POC authentication token required.' });
        }
        if (!isMainPoc) {
          return sendJson(res, 403, { 
            error: 'FORBIDDEN', 
            message: 'Access Denied: Only MAIN_POC / MAIN_SUPERVISOR can access cross-domain administrative statistics.' 
          });
        }
        const result = auth.getSupervisorOverview(db);
        return sendJson(res, 200, result);
      }

      // 5b. MAIN POC / MAIN SUPERVISOR: Domain Registration List
      if ((pathname === '/api/supervisor/domain-registrations' || pathname === '/api/main-poc/domain-registrations' || pathname.startsWith('/api/supervisor/domains/') || pathname.startsWith('/api/main-poc/domains/')) && req.method === 'GET') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Main POC authentication token required.' });
        }
        if (!isMainPoc) {
          return sendJson(res, 403, { 
            error: 'FORBIDDEN', 
            message: 'Access Denied: Only MAIN_POC / MAIN_SUPERVISOR can access domain registration lists.' 
          });
        }
        let domainId = parsedUrl.searchParams.get('domainId') || parsedUrl.searchParams.get('domain');
        if (!domainId && pathname.includes('/domains/')) {
          const parts = pathname.split('/');
          domainId = decodeURIComponent(parts[parts.indexOf('domains') + 1] || '');
        }
        if (!domainId) {
          return sendJson(res, 400, { error: 'DOMAIN_ID_REQUIRED', message: 'Domain identifier required.' });
        }
        const result = auth.getSupervisorDomainRegistrations(db, domainId);
        return sendJson(res, 200, result);
      }

      // 5c. MAIN POC / MAIN SUPERVISOR: Cross-Domain Points Award (with Payment/Points Gateway Confirmation)
      if ((pathname === '/api/main-poc/points/award' || pathname === '/api/supervisor/points/award') && req.method === 'POST') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Main POC authentication required.' });
        }
        if (!isMainPoc) {
          return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access Denied: Only MAIN_POC / MAIN_SUPERVISOR can award points across domains.' });
        }
        const body = await parseBody(req);
        const result = auth.awardPoints(db, {
          participantId: body.participantId || body.userId,
          domainId: body.domainId,
          domainName: body.domainName || body.domainId,
          amount: body.amount,
          reason: body.reason,
          awardedBy: authUser.email,
          awardedByRole: 'MAIN_POC',
          gatewayReference: body.gatewayReference
        });
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 5d. MAIN POC / MAIN SUPERVISOR: Full Cross-Domain Point History
      if ((pathname === '/api/main-poc/points/history' || pathname === '/api/supervisor/points/history') && req.method === 'GET') {
        if (!authUser) {
          return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Main POC authentication required.' });
        }
        if (!isMainPoc) {
          return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access Denied: Only MAIN_POC / MAIN_SUPERVISOR can view full point history.' });
        }
        const result = auth.getAllPointHistory(db);
        return sendJson(res, 200, result);
      }

      // Security Guard: Block unauthorized access to any admin / supervisor / main-poc / poc endpoints
      if (pathname.startsWith('/api/supervisor') || pathname.startsWith('/api/main-poc') || pathname.startsWith('/api/poc') || pathname.startsWith('/api/admin')) {
        if (!authUser) return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Authentication required.' });
        return sendJson(res, 403, { error: 'FORBIDDEN', message: 'Access Denied: Insufficient administrative privileges.' });
      }

      // 6h. Super Admin: Assign Domain Manager
      if (pathname === '/api/admin/assign-manager' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = domainReward.assignDomainManager(db, body);
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 6i. Super Admin: Assign Domain Incharge
      if (pathname === '/api/admin/assign-incharge' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = domainReward.assignDomainIncharge(db, body);
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 6j. Super Admin: View Append-Only Audit Logs
      if (pathname === '/api/admin/audit-logs' && req.method === 'GET') {
        const filters = {
          limit: parsedUrl.searchParams.get('limit') || 50,
          actorId: parsedUrl.searchParams.get('actorId'),
          action: parsedUrl.searchParams.get('action')
        };
        const logs = domainReward.getAuditLogs(db, filters);
        return sendJson(res, 200, { success: true, auditLogs: logs, logs });
      }

      // 6k. Super Admin: Balance Correction
      if (pathname === '/api/admin/correction' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = domainReward.adminCorrection(db, body);
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 7. Magefficie Vault Inventory
      if (pathname === '/api/magefficie/inventory' && req.method === 'GET') {
        const items = magefficie.getInventory(db);
        return sendJson(res, 200, { success: true, items });
      }

      // 8. Magefficie Redemption
      if (pathname === '/api/magefficie/redeem' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = magefficie.redeemReward(db, body);
        return sendJson(res, result.status || (result.error ? 400 : 200), result);
      }

      // 9. Wallet Transaction History
      if (pathname === '/api/wallet/history' && req.method === 'GET') {
        const pid = parsedUrl.searchParams.get('participantId');
        if (!pid) return sendJson(res, 400, { error: 'PARTICIPANT_ID_REQUIRED' });
        const participant = db.prepare('SELECT id FROM participants WHERE id = ? OR participant_id = ?').get(pid, pid);
        if (!participant) return sendJson(res, 404, { error: 'PARTICIPANT_NOT_FOUND' });

        const txs = db.prepare(`
          SELECT id, idempotency_key, amount, type, from_account_id, to_account_id, timestamp
          FROM transactions 
          WHERE participant_id = ? 
          ORDER BY timestamp DESC
        `).all(participant.id);

        return sendJson(res, 200, { success: true, transactions: txs });
      }

      // 10. Public Leaderboard (Rank and Name only)
      if (pathname === '/api/leaderboard' && req.method === 'GET') {
        const rows = db.prepare(`
          SELECT p.name, w.total_earned
          FROM participants p
          JOIN wallets w ON p.id = w.participant_id
          WHERE p.status = 'ACTIVE'
          ORDER BY w.total_earned DESC
          LIMIT 20
        `).all();

        const leaderboard = rows.map((r, i) => ({
          rank: i + 1,
          name: r.name
        }));

        return sendJson(res, 200, { success: true, leaderboard });
      }

      // 11. Health Check
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString(), domains: 17 });
      }

      return sendJson(res, 404, { error: 'ENDPOINT_NOT_FOUND', pathname });
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      return sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR', message: apiErr.message });
    }
  }

  // Static File Serving
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  let localFile = path.join(__dirname, '..', reqPath);

  // If not found in root, check apps/web/public
  if (!fs.existsSync(localFile)) {
    const webPublic = path.join(__dirname, '..', 'apps', 'web', 'public', reqPath);
    if (fs.existsSync(webPublic)) {
      localFile = webPublic;
    }
  }

  // Domain asset alias check
  if (!fs.existsSync(localFile) && reqPath.includes('/domains/')) {
    const fileName = path.basename(reqPath);
    const candidatePaths = [
      path.join(__dirname, '..', 'assets', 'domains', fileName),
      path.join(__dirname, '..', 'apps', 'web', 'public', 'assets', 'domains', fileName)
    ];
    for (const cp of candidatePaths) {
      if (fs.existsSync(cp)) {
        localFile = cp;
        break;
      }
    }
  }

  serveStatic(res, localFile);
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`CARNIVAL RESERVE PRODUCTION SERVER RUNNING`);
  console.log(`Port: ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Database: Connected to Carnival Reserve SQLite / Supabase Adapter`);
  console.log(`Domains configured: 17 Approved Official Domains`);
  console.log(`==================================================`);
});
