const ASSESSMENTS = ['Coding assessment', 'Screening call', 'Take-home task', 'Aptitude/personality test', 'Other'];

// Table columns. `sort` = 'text' | 'date'; omit to make a column unsortable.
const TABLE = [
  { key: 'title', label: 'Job title', sort: 'text', cls: 'title' },
  { key: 'company', label: 'Company', sort: 'text', cls: 'company' },
  { key: 'status', label: 'Status', sort: 'status', cls: 'status' },
  { key: 'dateApplied', label: 'Applied', sort: 'date', cls: 'date', mobile: 'Applied' },
  { key: 'dateFollowedUp', label: 'Followed up', sort: 'date', cls: 'date', mobile: 'Followed up' },
  { key: 'nextFollowUp', label: 'Next follow-up', sort: 'date', cls: 'date', mobile: 'Next follow-up' },
  { key: 'location', label: 'Location', sort: 'text', cls: 'nowrap', mobile: 'Location' },
  { key: 'salary', label: 'Salary', sort: 'text', cls: 'salary', mobile: 'Salary' },
  { key: 'assessments', label: 'Assessments', mobile: 'Done' },
  { key: 'actions', label: '', cls: 'actions' },
];

const state = {
  jobs: [],
  meta: { columns: [], statuses: [], required: [] },
  search: '',
  status: '',
  sortKey: 'dateApplied',
  sortDir: 'desc',
  editingId: null,
};

const $ = sel => document.querySelector(sel);
const el = {
  stats: $('#stats'), search: $('#search'), statusFilter: $('#statusFilter'), sortSelect: $('#sortSelect'),
  headRow: $('#headRow'), rows: $('#rows'), empty: $('#empty'), resultCount: $('#resultCount'),
  dialog: $('#jobDialog'), form: $('#jobForm'), dialogTitle: $('#dialogTitle'),
  formError: $('#formError'), deleteBtn: $('#deleteBtn'), saveBtn: $('#saveBtn'), toast: $('#toast'),
};

// ---------- helpers ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

function fmtDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function splitList(s) {
  return String(s || '').split(';').map(x => x.trim()).filter(Boolean);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.classList.toggle('error', isError);
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

// ---------- filtering & sorting ----------

function visibleJobs() {
  const q = state.search.trim().toLowerCase();
  const list = state.jobs.filter(j =>
    (!state.status || j.status === state.status) &&
    (!q || j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))
  );

  const col = TABLE.find(c => c.key === state.sortKey);
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const statusOrder = s => { const i = state.meta.statuses.indexOf(s); return i === -1 ? 99 : i; };

  return list.sort((a, b) => {
    const av = a[state.sortKey] || '', bv = b[state.sortKey] || '';
    if (col.sort === 'status') return (statusOrder(av) - statusOrder(bv)) * dir;
    // Blanks always sink to the bottom regardless of direction.
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    if (col.sort === 'date') return av.localeCompare(bv) * dir;
    return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true }) * dir;
  });
}

// ---------- rendering ----------

function renderStats() {
  const counts = Object.fromEntries(state.meta.statuses.map(s => [s, 0]));
  for (const j of state.jobs) if (j.status in counts) counts[j.status]++;
  const chip = (value, label, n) => `
    <button type="button" class="stat ${state.status === value ? 'active' : ''}" data-status="${escapeHtml(value)}">
      <span class="n">${n}</span>
      <span class="l">${value ? `<span class="dot" data-s="${escapeHtml(value)}"></span>` : ''}${escapeHtml(label)}</span>
    </button>`;
  el.stats.innerHTML = chip('', 'Total', state.jobs.length) +
    state.meta.statuses.map(s => chip(s, s, counts[s])).join('');
}

function renderHead() {
  el.headRow.innerHTML = TABLE.map(c => {
    if (!c.sort) return `<th>${escapeHtml(c.label)}</th>`;
    const active = state.sortKey === c.key;
    const arrow = active ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
    return `<th class="sortable" data-key="${c.key}" aria-sort="${active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}">
      ${escapeHtml(c.label)} <span class="arrow">${arrow}</span></th>`;
  }).join('');
  el.sortSelect.value = `${state.sortKey}:${state.sortDir}`;
}

function cell(job, c) {
  const v = job[c.key] || '';
  const label = c.mobile ? ` data-label="${escapeHtml(c.mobile)}"` : '';
  const cls = c.cls ? ` class="${c.cls}${v ? '' : ' muted'}"` : '';
  let html = '';

  switch (c.key) {
    case 'status':
      html = `<span class="pill" data-s="${escapeHtml(v)}">${escapeHtml(v)}</span>`;
      return `<td class="status">${html}</td>`;
    case 'dateApplied':
    case 'dateFollowedUp':
      html = escapeHtml(fmtDate(v));
      break;
    case 'nextFollowUp': {
      const due = v && v <= today() && !['Rejected', 'Offer'].includes(job.status);
      html = v ? (due ? `<span class="due" title="Follow-up due">${escapeHtml(fmtDate(v))}</span>` : escapeHtml(fmtDate(v))) : '';
      break;
    }
    case 'salary':
      html = escapeHtml(v);
      return `<td${cls}${label}${v ? ` title="${escapeHtml(v)}"` : ''}>${v ? html : ''}</td>`;
    case 'assessments': {
      const items = splitList(v);
      html = items.length ? `<span class="tags">${items.map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('')}</span>` : '';
      break;
    }
    case 'actions':
      html = job.url
        ? `<a class="link-out" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" title="Open job posting" aria-label="Open job posting">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
           </a>`
        : '';
      break;
    default:
      html = escapeHtml(v);
  }
  return `<td${cls}${html ? label : ''}>${html}</td>`;
}

function render() {
  const list = visibleJobs();
  renderStats();
  renderHead();
  el.rows.innerHTML = list.map(j => `<tr data-id="${escapeHtml(j.id)}">${TABLE.map(c => cell(j, c)).join('')}</tr>`).join('');
  el.empty.hidden = list.length > 0;
  el.empty.textContent = state.jobs.length ? 'No jobs match your search.' : 'No jobs yet — click “Add job” to get started.';
  el.resultCount.textContent = list.length === state.jobs.length
    ? `${list.length} job${list.length === 1 ? '' : 's'}`
    : `Showing ${list.length} of ${state.jobs.length} jobs`;
}

// ---------- dialog ----------

function openDialog(job) {
  state.editingId = job ? job.id : null;
  el.form.reset();
  el.formError.hidden = true;
  el.form.querySelectorAll('.invalid').forEach(i => i.classList.remove('invalid'));
  el.dialogTitle.textContent = job ? 'Edit job' : 'Add job';
  el.deleteBtn.hidden = !job;
  resetDeleteBtn();

  const data = job || { status: state.meta.statuses[0], dateApplied: today() };
  for (const input of el.form.elements) {
    if (!input.name) continue;
    if (input.name === 'assessments') input.checked = splitList(data.assessments).includes(input.value);
    else input.value = data[input.name] ?? '';
  }
  el.dialog.showModal();
  if (!job) el.form.elements.title.focus();
}

function formData() {
  const out = {};
  for (const input of el.form.elements) {
    if (!input.name) continue;
    if (input.name === 'assessments') { if (input.checked) (out.assessments ||= []).push(input.value); }
    else out[input.name] = input.value.trim();
  }
  out.assessments = (out.assessments || []).join('; ');
  return out;
}

function validate() {
  let firstBad = null;
  for (const input of el.form.querySelectorAll('input, select, textarea')) {
    if (!input.name || input.type === 'checkbox') continue;
    input.value = input.value.trim();
    const ok = input.checkValidity() && (input.name !== 'url' || /^https?:\/\//i.test(input.value));
    input.classList.toggle('invalid', !ok);
    if (!ok && !firstBad) firstBad = input;
  }
  if (firstBad) {
    el.formError.textContent = 'Please fill in the highlighted fields (job title, company, date applied and a valid http(s) URL are required).';
    el.formError.hidden = false;
    firstBad.focus();
    return false;
  }
  el.formError.hidden = true;
  return true;
}

async function save(e) {
  e.preventDefault();
  if (!validate()) return;
  el.saveBtn.disabled = true;
  try {
    const body = JSON.stringify(formData());
    if (state.editingId) {
      const updated = await api(`/api/jobs/${state.editingId}`, { method: 'PUT', body });
      state.jobs = state.jobs.map(j => (j.id === updated.id ? updated : j));
      toast('Job updated');
    } else {
      state.jobs.push(await api('/api/jobs', { method: 'POST', body }));
      toast('Job added');
    }
    el.dialog.close();
    render();
  } catch (err) {
    el.formError.textContent = err.message;
    el.formError.hidden = false;
  } finally {
    el.saveBtn.disabled = false;
  }
}

function resetDeleteBtn() {
  el.deleteBtn.classList.remove('confirm');
  el.deleteBtn.textContent = 'Delete';
}

async function remove() {
  // Two-step: first click arms the button, second click deletes.
  if (!el.deleteBtn.classList.contains('confirm')) {
    el.deleteBtn.classList.add('confirm');
    el.deleteBtn.textContent = 'Click again to delete';
    return;
  }
  try {
    await api(`/api/jobs/${state.editingId}`, { method: 'DELETE' });
    state.jobs = state.jobs.filter(j => j.id !== state.editingId);
    el.dialog.close();
    render();
    toast('Job deleted');
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- export ----------

function exportCsv() {
  const cols = state.meta.columns;
  const esc = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(','), ...visibleJobs().map(j => cols.map(c => esc(j[c])).join(','))];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `job-tracker-${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- init ----------

function setSort(key, dir) {
  state.sortKey = key;
  state.sortDir = dir;
  render();
}

function bindEvents() {
  el.search.addEventListener('input', () => { state.search = el.search.value; render(); });
  el.statusFilter.addEventListener('change', () => { state.status = el.statusFilter.value; render(); });
  el.sortSelect.addEventListener('change', () => { const [k, d] = el.sortSelect.value.split(':'); setSort(k, d); });
  $('#clearBtn').addEventListener('click', () => {
    state.search = state.status = '';
    el.search.value = el.statusFilter.value = '';
    render();
  });
  $('#addBtn').addEventListener('click', () => openDialog(null));
  $('#exportBtn').addEventListener('click', exportCsv);

  el.stats.addEventListener('click', e => {
    const btn = e.target.closest('.stat');
    if (!btn) return;
    state.status = btn.dataset.status;
    el.statusFilter.value = state.status;
    render();
  });

  el.headRow.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const key = th.dataset.key;
    const col = TABLE.find(c => c.key === key);
    const dir = state.sortKey === key ? (state.sortDir === 'asc' ? 'desc' : 'asc') : (col.sort === 'date' ? 'desc' : 'asc');
    setSort(key, dir);
  });

  el.rows.addEventListener('click', e => {
    if (e.target.closest('a')) return; // let the posting link open normally
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDialog(state.jobs.find(j => j.id === tr.dataset.id));
  });

  el.form.addEventListener('submit', save);
  el.form.addEventListener('input', e => e.target.classList.remove('invalid'));
  el.deleteBtn.addEventListener('click', remove);
  el.dialog.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || e.target === el.dialog) el.dialog.close();
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); el.search.focus(); }
  });
}

function buildControls() {
  const opts = state.meta.statuses.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  el.statusFilter.insertAdjacentHTML('beforeend', opts);
  el.form.elements.status.innerHTML = opts;

  el.sortSelect.innerHTML = TABLE.filter(c => c.sort).flatMap(c => {
    const [asc, desc] = c.sort === 'date' ? ['oldest', 'newest'] : c.sort === 'status' ? ['pipeline order', 'reverse'] : ['A–Z', 'Z–A'];
    return [
      `<option value="${c.key}:desc">Sort: ${c.label} (${desc})</option>`,
      `<option value="${c.key}:asc">Sort: ${c.label} (${asc})</option>`,
    ];
  }).join('');

  document.getElementById('assessmentChecks').innerHTML = ASSESSMENTS.map(a =>
    `<label><input type="checkbox" name="assessments" value="${escapeHtml(a)}"> ${escapeHtml(a)}</label>`
  ).join('');
}

(async function init() {
  bindEvents();
  try {
    const [meta, jobs] = await Promise.all([api('/api/meta'), api('/api/jobs')]);
    state.meta = meta;
    state.jobs = jobs;
    buildControls();
    render();
  } catch (err) {
    el.empty.hidden = false;
    el.empty.textContent = `Couldn't load jobs: ${err.message}`;
  }
})();
