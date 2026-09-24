// CSV storage. Uses a file in a GitHub repo when GITHUB_TOKEN is set (for serverless
// hosts like Vercel, whose filesystem is read-only), otherwise a local file.
const fs = require('fs');
const path = require('path');
const csv = require('./csv');
const { COLUMNS } = require('./schema');

const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'jobs.csv'));
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_REPO = process.env.GITHUB_REPO || '';          // "owner/name"
const GH_FILE = process.env.GITHUB_FILE || 'jobs.csv';  // path inside the repo
const GH_BRANCH = process.env.GITHUB_BRANCH || '';      // default: the repo's default branch

// ---- local file ----

const local = {
  describe: () => DATA_FILE,
  async read() {
    const text = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : '';
    return { jobs: csv.toObjects(text) };
  },
  async write(jobs) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, csv.stringify(jobs, COLUMNS));
    fs.renameSync(tmp, DATA_FILE);
  },
};

// ---- GitHub contents API ----

class Conflict extends Error {}

async function gh(method, body) {
  const url = new URL(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`);
  if (GH_BRANCH && method === 'GET') url.searchParams.set('ref', GH_BRANCH);
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  if (method === 'GET' && res.status === 404) return null;
  if (res.status === 409) throw new Conflict('File changed on GitHub during save');
  if (!res.ok) throw new Error(`GitHub ${method} ${GH_FILE} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const github = {
  describe: () => `github.com/${GH_REPO}/${GH_FILE}${GH_BRANCH ? ` (${GH_BRANCH})` : ''}`,
  async read() {
    const file = await gh('GET');
    if (!file) return { jobs: [] };
    return { jobs: csv.toObjects(Buffer.from(file.content, 'base64').toString('utf8')), sha: file.sha };
  },
  async write(jobs, sha, message) {
    await gh('PUT', {
      message,
      content: Buffer.from(csv.stringify(jobs, COLUMNS)).toString('base64'),
      ...(sha && { sha }),
      ...(GH_BRANCH && { branch: GH_BRANCH }),
    });
  },
};

const backend = GH_TOKEN ? github : local;

if (GH_TOKEN && !GH_REPO) throw new Error('GITHUB_REPO must be set (e.g. "you/job-tracker-data") when GITHUB_TOKEN is set');

async function readJobs() {
  return (await backend.read()).jobs;
}

// Serialize writes within this process; across instances, GitHub's sha check rejects a
// stale write and we retry against the fresh file.
let queue = Promise.resolve();
function mutate(message, fn) {
  const run = queue.then(async () => {
    for (let attempt = 1; ; attempt++) {
      const { jobs, sha } = await backend.read();
      const result = fn(jobs);
      if (result == null || result === false) return result; // nothing changed (e.g. id not found)
      try {
        await backend.write(jobs, sha, message);
        return result;
      } catch (err) {
        if (!(err instanceof Conflict) || attempt >= 3) throw err;
      }
    }
  });
  queue = run.catch(() => {});
  return run;
}

module.exports = { readJobs, mutate, describe: backend.describe };
