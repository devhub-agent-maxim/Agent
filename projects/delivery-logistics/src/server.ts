import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

const PORT = parseInt(process.env.PORT || '8080', 10);
const START_TIME = Date.now();

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const routes: Record<string, RouteHandler> = {
  'GET /ping': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: Math.round((Date.now() - START_TIME) / 1000) }));
  },

  'GET /health': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'delivery-logistics', uptime: Math.round((Date.now() - START_TIME) / 1000) }));
  },

  'GET /api/routes': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Route optimization API — POST /api/routes with stops array', docs: '/api/docs' }));
  },
};

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  const key = `${method} ${pathname}`;
  const handler = routes[key];

  if (handler) {
    handler(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname }));
  }
});

server.listen(PORT, () => {
  console.log(`delivery-logistics API running on http://localhost:${PORT}`);
  console.log(`  GET /ping    → health check`);
  console.log(`  GET /health  → detailed health`);
  console.log(`  GET /api/routes → route optimization API`);
});

export default server;
