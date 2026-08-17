import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.IMAGE_PROBE_FIXTURE_PORT || 4301);
const allowedOrigins = new Set([
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'https://127.0.0.1:3001',
  'https://localhost:3001'
]);
const metrics = {
  getRequests: 0,
  optionsRequests: 0,
  webSocketUpgrades: 0
};

const payloads = new Map([
  ['/system_stats', { system: { os: 'fixture' }, devices: [] }],
  ['/object_info', { KSampler: { input: { required: {} } } }],
  ['/features', { supports_preview_metadata: true }],
  ['/sdapi/v1/options', { sd_model_checkpoint: 'fixture-model' }],
  ['/sdapi/v1/samplers', [{ name: 'Euler fixture' }]],
  ['/sdapi/v1/sd-models', [{ title: 'fixture-model' }]]
]);

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Max-Age', '300');
}

const server = createServer((request, response) => {
  applyCors(request, response);
  if (request.method === 'OPTIONS') {
    metrics.optionsRequests += 1;
    response.writeHead(204);
    response.end();
    return;
  }
  const url = new URL(request.url || '/', `http://${request.headers.host || `127.0.0.1:${port}`}`);
  if (url.pathname === '/__probe_fixture_metrics') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(metrics));
    return;
  }
  if (request.method === 'GET') metrics.getRequests += 1;
  if (url.pathname === '/docs') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>SD WebUI fixture</title><p>API fixture</p>');
    return;
  }
  const payload = payloads.get(url.pathname);
  if (payload) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'fixture endpoint not found' }));
});

server.on('upgrade', (request, socket) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `127.0.0.1:${port}`}`);
  const key = request.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || typeof key !== 'string') {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  metrics.webSocketUpgrades += 1;
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  setTimeout(() => socket.end(), 250);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Image probe browser fixture listening on http://127.0.0.1:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
