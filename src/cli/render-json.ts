/*
 Minimal CLI to post a composition JSON to the running backend,
 so the server generates latest HTML and debug artifacts.
 Usage: npm run render-json -- <json-path> [--server http://localhost:7788]
*/

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

type AnyObj = Record<string, any>;

function parseArgs(argv: string[]): { file: string | null; server: string } {
  let file: string | null = null;
  let server = 'http://localhost:7788';

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--server' || a === '-s') {
      const v = argv[i + 1];
      if (v && !v.startsWith('-')) {
        server = v;
        i++;
      }
      continue;
    }
    if (!file) file = a;
  }

  return { file, server };
}

function readJson(filePath: string): AnyObj {
  const full = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

function resolveComposition(payload: AnyObj): AnyObj | null {
  if (payload && typeof payload === 'object') {
    if (payload.composition && typeof payload.composition === 'object') return payload.composition;
    if (payload.kind === 'composition' && payload.bounds && payload.children) return payload;
  }
  return null;
}

function httpGet(urlStr: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d))));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpPostJson(urlStr: string, json: AnyObj): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = Buffer.from(JSON.stringify(json));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'content-type': 'application/json',
        'content-length': String(data.length)
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d))));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const { file, server } = parseArgs(process.argv);
  if (!file) {
    console.error('Usage: npm run render-json -- <json-path> [--server http://localhost:7788]');
    process.exit(1);
  }

  const payload = readJson(file);
  const composition = resolveComposition(payload);
  if (!composition) {
    console.error('Input must be either { composition: {...} } or a composition object with kind="composition".');
    process.exit(1);
  }

  const health = await httpGet(server.replace(/\/$/, '') + '/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`Backend not reachable at ${server}. Start it via: npm run dev`);
    process.exit(1);
  }

  const res = await httpPostJson(server.replace(/\/$/, '') + '/api/composition', { composition });
  if (res.status !== 204) {
    console.error('Server responded with error:', res.status, res.body);
    process.exit(1);
  }

  console.log('Posted composition to backend successfully.');
  console.log('Open preview: ' + server.replace(/\/$/, '') + '/index.html');
  console.log('Debug artifacts (if BRIDGE_DEBUG=1): debug/logs/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
