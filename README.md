# Job Tracker

A personal job-application tracker. No database: everything lives in one CSV file (`data/jobs.csv`) that the app reads and writes.
Node.js (18+) with zero dependencies, plus a plain HTML/CSS/JS frontend. No build step.

## Run locally

```bash
npm start            # or: node server.js
```
Then open http://localhost:3000.

## Features
- Add, edit and delete jobs. Click any row to edit it. Delete is inside the edit dialog and needs two clicks.
- Required fields: job title, company, date applied and job posting URL.
- Status: Applied → Interview 1 → Interview 2 → Offer / Rejected.
- Completed assessments: coding assessment, screening call, take-home task, aptitude/personality test, other.
- Contact details (name/role, email, phone, LinkedIn) and free-form notes.
- Search by job title or company. Filter by status, or click a status card. Sort by clicking a column header or using the sort dropdown.
- A next follow-up date that is due or overdue is highlighted.
- **Export CSV** downloads the rows currently shown, with your search, filter and sort applied.
- Responsive: rows turn into cards on phones. Follows your system light/dark mode.
- Press `/` to jump to the search box.

## Configuration (environment variables)

| Variable       | Default          | Purpose |
|----------------|------------------|---------|
| `PORT`         | `3000`           | Port to listen on |
| `DATA_FILE`    | `data/jobs.csv`  | Path to the CSV file. Point this at a persistent disk or volume when hosting. |
| `APP_PASSWORD` | *(unset)*        | If set, the whole site asks for this password (browser login prompt; any username works). **Set this when hosting publicly.** |

```bash
APP_PASSWORD='something-long' PORT=8080 node server.js
```

## Hosting
Use any host that runs Node **and has a persistent disk**, because the CSV is written to disk. Serverless and static hosts (Vercel, Netlify, GitHub Pages) won't work.
- **VPS** (DigitalOcean, Hetzner, Lightsail…): copy the folder, run `node server.js` under `pm2` or systemd, and put it behind HTTPS (e.g. Caddy).
- **Railway / Render / Fly.io:** attach a volume (e.g. mounted at `/data`), set `DATA_FILE=/data/jobs.csv` and `APP_PASSWORD`, and use `npm start` as the start command. Copy your existing `data/jobs.csv` onto the volume once, or start empty.

Always use HTTPS in production. The password is sent with every request.

## Data file
- Columns: `id,title,company,status,dateApplied,dateFollowedUp,nextFollowUp,location,salary,url,assessments,contactName,contactEmail,contactPhone,contactLinkedIn,notes`
- Dates are `YYYY-MM-DD`. Multiple assessments are separated with `; `.
- You can edit the file in Excel or Numbers too. Keep the header row, and stop the server while you edit.
- Writes are atomic (temp file + rename), so a crash mid-save won't corrupt it. Still, back it up now and then with **Export CSV**.

## Importing from the old tracker
`data/jobs.csv` was created from `job-tracker-2026-09-24.csv` with:
```bash
node migrate.js job-tracker-2026-09-24.csv --force
```
