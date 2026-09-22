// server.js - Production Root Server for Carnival Reserve (Vercel + Local + Cloud)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('File Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = contentType || MIME_TYPES[ext] || 'application/octet-stream';
    const isAsset = ext !== '.html';
    
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
    });
    res.end(data);
  });
}

function resolveAssetPath(pathname) {
  const cleanPath = pathname.replace(/^\/+/, '');
  const candidatePaths = [
    path.join(__dirname, cleanPath),
    path.join(__dirname, 'public', cleanPath),
    path.join(__dirname, 'apps', 'web', 'public', cleanPath),
    path.join(__dirname, 'assets', cleanPath.replace(/^assets\//, '')),
    path.join(__dirname, 'public', 'assets', cleanPath.replace(/^assets\//, '')),
  ];

  if (cleanPath.includes('domains/')) {
    const fileName = path.basename(cleanPath);
    candidatePaths.push(
      path.join(__dirname, 'assets', 'domains', fileName),
      path.join(__dirname, 'public', 'assets', 'domains', fileName),
      path.join(__dirname, 'apps', 'web', 'public', 'assets', 'domains', fileName)
    );
  }

  for (const p of candidatePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }
  return null;
}

const appHandler = (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Static Asset Request (images, icons, styles, fonts, etc.)
  const ext = path.extname(pathname).toLowerCase();
  if (pathname.startsWith('/assets/') || (MIME_TYPES[ext] && ext !== '.html')) {
    const resolvedPath = resolveAssetPath(pathname);
    if (resolvedPath) {
      return serveFile(res, resolvedPath, MIME_TYPES[ext]);
    }
    // Asset not found -> return 404 (NEVER return index.html for missing images!)
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Asset not found: ${pathname}`);
    return;
  }

  // 2. Health check
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', live: true, timestamp: new Date().toISOString() }));
    return;
  }

  // 3. SPA Navigation: serve index.html
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    return serveFile(res, indexPath, 'text/html; charset=utf-8');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Carnival Reserve index.html not found.');
};

const server = http.createServer(appHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Carnival Reserve server running at http://localhost:${PORT}`);
  });
}

module.exports = appHandler;
module.exports.default = appHandler;
