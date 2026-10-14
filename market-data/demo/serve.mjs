// Standalone dev server for the chart demo. Does NOT replace the team's app server;
// the integration owner should mount createMarketRoutes() in the real one.
//   node market-data/demo/serve.mjs      -> http://localhost:3000/market-data/demo/
//   PORT=4000 MARKET_DATA_PROVIDER=twelvedata TWELVE_DATA_API_KEY=... node market-data/demo/serve.mjs

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarketRoutes } from '../server/routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const market = createMarketRoutes();

http.createServer(async (req, res) => {
  if (await market(req, res)) return;
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') { res.writeHead(302, { Location: '/market-data/demo/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(root, '.' + rel);
  // only serve market-data/ files, and never anything outside the repo
  if (!file.startsWith(path.join(root, 'market-data') + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(Number(process.env.PORT || 3000), () =>
  console.log(`Chart demo: http://localhost:${process.env.PORT || 3000}/market-data/demo/`));
