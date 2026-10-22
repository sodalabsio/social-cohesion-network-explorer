import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { root } from './check-data.mjs';

const folder = process.argv[2] || 'dist';
if (!['src', 'dist'].includes(folder)) throw new Error('Only src or dist may be served');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
let publicRoot;
try { publicRoot = await realpath(resolve(root, folder)); }
catch { console.error(`Missing ${folder}/. Run npm run build before previewing dist.`); process.exit(1); }
const within = path => path.startsWith(publicRoot + sep);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  const sendError = (status, message) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); response.end(message); };
  if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); sendError(405, 'Method not allowed'); return; }
  let decoded;
  try { decoded = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { sendError(400, 'Malformed URL'); return; }
  if (decoded.includes('\0') || decoded.includes('\\')) { sendError(400, 'Invalid path'); return; }
  const requested = resolve(publicRoot, '.' + (decoded.endsWith('/') ? decoded + 'index.html' : decoded));
  if (!within(requested)) { sendError(403, 'Forbidden'); return; }
  try {
    const actual = await realpath(requested);
    if (!within(actual)) { sendError(403, 'Forbidden'); return; }
    if (!(await stat(actual)).isFile()) { sendError(404, 'Not found'); return; }
    const bytes = await readFile(actual);
    response.writeHead(200, { 'Content-Type': mime[extname(actual)] || 'application/octet-stream', 'Content-Length': bytes.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) sendError(404, 'Not found');
    else { console.error(error); sendError(500, 'Unable to serve file'); }
  }
});
server.on('error', error => { console.error(`Preview server failed: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Serving ${folder}/ at http://127.0.0.1:${port}/ (local only). Press Ctrl+C to stop.`));
