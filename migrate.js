// One-off: convert an export from the old tracker into data/jobs.csv.
// Usage: node migrate.js [source.csv]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('./lib/csv');
const { COLUMNS, STATUSES } = require('./lib/schema');

const src = process.argv[2] || 'job-tracker-2026-09-24.csv';
const dest = process.env.DATA_FILE || path.join(__dirname, 'data', 'jobs.csv');

if (fs.existsSync(dest) && !process.argv.includes('--force')) {
  console.error(`${dest} already exists. Re-run with --force to overwrite.`);
  process.exit(1);
}

const jobs = csv.toObjects(fs.readFileSync(src, 'utf8')).map(r => ({
  id: crypto.randomUUID(),
  title: r['Role'],
  company: r['Company'],
  status: STATUSES.includes(r['Status']) ? r['Status'] : 'Applied',
  dateApplied: r['Date applied'],
  dateFollowedUp: r['Follow up'],
  nextFollowUp: '',
  location: r['Location'],
  salary: r['Salary'],
  url: r['Job URL'],
  assessments: '',
  contactName: r['Contact name'],
  contactEmail: r['Contact email'],
  contactPhone: '',
  contactLinkedIn: '',
  notes: r['Notes'],
}));

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, csv.stringify(jobs, COLUMNS));
console.log(`Migrated ${jobs.length} jobs -> ${dest}`);
