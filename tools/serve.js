#!/usr/bin/env node
/**
 * serve.js - Intellivra Global
 *
 * Zero-dependency static server for local development. The site itself needs
 * no server, but serving it over http lets config-loader.js fetch
 * config/site.config.json (browsers block that on file:// origins).
 *
 *   node tools/serve.js          # http://localhost:8080
 *   node tools/serve.js 3000     # pick a port
 *
 * Behaviour matches Cloudflare Pages / Netlify closely enough for testing:
 * directory requests resolve to index.html, unknown paths return 404.html with
 * a real 404 status, and everything is sent with no-cache so edits show up on
 * refresh.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const send = (res, status, body, type) => {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch {
    return send(res, 400, 'Bad request', 'text/plain; charset=utf-8');
  }

  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.join(ROOT, urlPath);

  // Never serve anything outside the project folder.
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');

  fs.stat(file, (err, stat) => {
    if (err || stat.isDirectory()) {
      const notFound = path.join(ROOT, '404.html');
      console.log(`  404  ${urlPath}`);
      if (fs.existsSync(notFound)) {
        return send(res, 404, fs.readFileSync(notFound), TYPES['.html']);
      }
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }

    console.log(`  200  ${urlPath}`);
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: node tools/serve.js ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`\n  Intellivra Global - dev server`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  serving ${ROOT}`);
  console.log(`  Ctrl+C to stop\n`);
});
