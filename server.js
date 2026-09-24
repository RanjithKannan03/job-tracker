const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('./lib/csv');
const { COLUMNS, REQUIRED, STATUSES } = require('./lib/schema');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data', 'jobs.csv'));
const PASSWORD = process.env.APP_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---- storage ----

function readJobs() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return csv.toObjects(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Serialize writes so concurrent requests can't interleave read-modify-write.
let queue = Promise.resolve();
function mutate(fn) {
  const run = queue.then(() => {
    const jobs = readJobs();
    const result = fn(jobs);
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, csv.stringify(jobs, COLUMNS));
    fs.renameSync(tmp, DATA_FILE);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

function clean(input) {
  const job = {};
  for (const c of COLUMNS) {
    if (c === 'id') continue;
    const v = input[c];
    job[c] = Array.isArray(v) ? v.join('; ') : String(v ?? '').trim();
  }
  const missing = REQUIRED.filter(c => !job[c]);
  if (missing.length) return { error: `Missing required fields: ${missing.join(', ')}` };
  if (!/^https?:\/\/\S+$/i.test(job.url)) return { error: 'Job URL must start with http:// or https://' };
  if (!STATUSES.includes(job.status)) job.status = 'Applied';
  return { job };
}

// ---- http helpers ----

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json' : 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  if (!PASSWORD) return true;
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const pass = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- routes ----

async function handle(req, res) {
  if (!authorized(req)) {
    return send(res, 401, 'Authentication required', { 'WWW-Authenticate': 'Basic realm="Job Tracker"' });
  }

  const { pathname } = new URL(req.url, 'http://localhost');
  const idMatch = pathname.match(/^\/api\/jobs\/([\w-]+)$/);

  if (pathname === '/api/meta' && req.method === 'GET') {
    return send(res, 200, { columns: COLUMNS, statuses: STATUSES, required: REQUIRED });
  }

  if (pathname === '/api/jobs' && req.method === 'GET') {
    return send(res, 200, readJobs());
  }

  if (pathname === '/api/jobs' && req.method === 'POST') {
    const { job, error } = clean(await readBody(req));
    if (error) return send(res, 400, { error });
    const created = await mutate(jobs => {
      const j = { id: crypto.randomUUID(), ...job };
      jobs.push(j);
      return j;
    });
    return send(res, 201, created);
  }

  if (idMatch && req.method === 'PUT') {
    const { job, error } = clean(await readBody(req));
    if (error) return send(res, 400, { error });
    const updated = await mutate(jobs => {
      const i = jobs.findIndex(j => j.id === idMatch[1]);
      if (i === -1) return null;
      jobs[i] = { id: idMatch[1], ...job };
      return jobs[i];
    });
    return updated ? send(res, 200, updated) : send(res, 404, { error: 'Job not found' });
  }

  if (idMatch && req.method === 'DELETE') {
    const removed = await mutate(jobs => {
      const i = jobs.findIndex(j => j.id === idMatch[1]);
      if (i === -1) return false;
      jobs.splice(i, 1);
      return true;
    });
    return removed ? send(res, 204, '') : send(res, 404, { error: 'Job not found' });
  }

  if (pathname === '/api/export' && req.method === 'GET') {
    const date = new Date().toISOString().slice(0, 10);
    return send(res, 200, csv.stringify(readJobs(), COLUMNS), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="job-tracker-${date}.csv"`,
    });
  }

  if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
  return serveStatic(req, res, pathname);
}

http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: err.message });
  });
}).listen(PORT, () => {
  console.log(`Job tracker running at http://localhost:${PORT}`);
  console.log(`Data file: ${DATA_FILE}${PASSWORD ? ' (password protected)' : ''}`);
});
