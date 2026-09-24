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
| `GITHUB_TOKEN` | *(unset)*        | If set, the CSV is read from and saved to a GitHub repo instead of `DATA_FILE`. Needed on Vercel. |
| `GITHUB_REPO`  | *(unset)*        | Repo holding the CSV, e.g. `you/job-tracker-data`. Required with `GITHUB_TOKEN`. |
| `GITHUB_FILE`  | `jobs.csv`       | Path of the CSV inside that repo. |
| `GITHUB_BRANCH`| repo default     | Branch to read and commit to. |

```bash
APP_PASSWORD='something-long' PORT=8080 node server.js
```

## Hosting
**Vercel (or any serverless host):** the filesystem is read-only, so store the CSV in a separate **private** GitHub repo. Every save becomes a commit there.
1. Create a private repo (e.g. `job-tracker-data`) and upload your `data/jobs.csv` to it as `jobs.csv`.
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to **only that repo** and the permission **Contents: Read and write**.
3. In Vercel → Project → Settings → Environment Variables, set `GITHUB_TOKEN`, `GITHUB_REPO` (e.g. `you/job-tracker-data`) and `APP_PASSWORD`, then redeploy.

Never put the CSV in a public repo: it contains contacts' names, emails and phone numbers.

**Host with a persistent disk** (VPS, Railway/Render/Fly.io with a volume): leave `GITHUB_TOKEN` unset and set `DATA_FILE` to a path on the disk or volume.

Always use HTTPS in production. The password is sent with every request.

## Data file
- Columns: `id,title,company,status,dateApplied,dateFollowedUp,nextFollowUp,location,salary,url,assessments,contactName,contactEmail,contactPhone,contactLinkedIn,notes`
- Dates are `YYYY-MM-DD`. Multiple assessments are separated with `; `.
- You can edit the file in Excel or Numbers too. Keep the header row, and stop the server while you edit. With GitHub storage, edit it in the data repo instead (on github.com or by cloning it).
- Local writes are atomic (temp file + rename), so a crash mid-save won't corrupt it. GitHub saves are rejected and retried if the file changed in between, and the commit history keeps every earlier version.

## Importing from the old tracker
`data/jobs.csv` was created from `job-tracker-2026-09-24.csv` with:
```bash
node migrate.js job-tracker-2026-09-24.csv --force
```
