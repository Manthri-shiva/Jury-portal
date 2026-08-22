/* ============================================================
   Jury Portal — Admin page logic
   ============================================================ */

const session = requireSession('ADMIN');
if (session) {
  document.getElementById('session-name').textContent = session.name;
  document.getElementById('session-initial').textContent = session.name.charAt(0).toUpperCase();
}

document.getElementById('logout-btn').addEventListener('click', () => {
  Store.logout();
  window.location.href = 'index.html';
});

// ---------------- navigation ----------------
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach((item) => {
  item.addEventListener('click', () => switchSection(item.dataset.section));
});

function switchSection(name) {
  navItems.forEach((i) => i.classList.toggle('active', i.dataset.section === name));
  document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === `section-${name}`));
  renderAll(); // cheap enough at this scale to just re-render everything on nav
}

// ---------------- master render ----------------
function renderAll() {
  renderDashboard();
  renderTeams();
  renderJuries();
  renderVenues();
  renderCriteria();
  renderLeaderboard();
  renderAudit();
}

// ---------------- DASHBOARD ----------------
function renderDashboard() {
  const teams = Store.getTeams();
  const venues = Store.getVenues();
  const users = Store.getUsers();
  const assignments = Store.getAssignments();
  const evaluations = Store.getEvaluations();

  const completed = teams.filter((t) => t.status === 'COMPLETED').length;
  document.getElementById('stat-total').textContent = teams.length;
  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-pending').textContent = teams.length - completed;
  document.getElementById('stat-juries').textContent = users.filter((u) => u.role === 'JURY' && u.active).length;

  const grid = document.getElementById('venue-progress-grid');
  grid.innerHTML = venues.map((v) => {
    const venueTeams = teams.filter((t) => t.venueId === v.id);
    const venueEvals = evaluations.filter((e) => e.status === 'SUBMITTED' && venueTeams.some((t) => t.id === e.teamId));
    const totalAssignments = assignments.filter((a) => venueTeams.some((t) => t.id === a.teamId)).length;
    const pct = totalAssignments ? Math.round((venueEvals.length / totalAssignments) * 100) : 0;
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong>${escapeHtml(v.name)}</strong>
          <span class="mono" style="font-size:12px;color:var(--text-muted);">${venueTeams.length} teams</span>
        </div>
        <div style="height:8px;border-radius:100px;background:var(--surface-3);overflow:hidden;margin-bottom:8px;">
          <div style="height:100%;width:${pct}%;background:var(--accent-2);"></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);">${venueEvals.length} of ${totalAssignments} evaluations submitted · ${pct}%</div>
      </div>`;
  }).join('') || `<div class="empty-state">No venues yet.</div>`;

  const top = Store.leaderboard().slice(0, 5);
  document.getElementById('dashboard-leaderboard-body').innerHTML = top.map(rankRow).join('') ||
    `<tr><td colspan="5"><div class="empty-state">No scores submitted yet.</div></td></tr>`;
}

function rankRow(r) {
  return `<tr>
    <td>${r.rank ?? '—'}</td>
    <td><strong>${escapeHtml(r.teamName)}</strong> <span class="mono" style="color:var(--text-muted);">${escapeHtml(r.teamNumber)}</span></td>
    <td>${escapeHtml(r.venueName)}</td>
    <td class="mono">${r.finalScore ?? '—'}</td>
    <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
  </tr>`;
}

// ---------------- TEAMS ----------------
function renderTeams() {
  const search = (document.getElementById('team-search').value || '').toLowerCase();
  const teams = Store.getTeams().filter(
    (t) => t.teamName.toLowerCase().includes(search) || t.teamNumber.toLowerCase().includes(search)
  );
  const venues = Store.getVenues();
  const problems = Store.getProblems();
  const assignments = Store.getAssignments();
  const evaluations = Store.getEvaluations();

  document.getElementById('teams-body').innerHTML = teams.map((t) => {
    const venue = venues.find((v) => v.id === t.venueId);
    const problem = problems.find((p) => p.id === t.problemId);
    const juryCount = assignments.filter((a) => a.teamId === t.id).length;
    const submitted = evaluations.filter((e) => e.teamId === t.id && e.status === 'SUBMITTED').length;
    return `<tr>
      <td><strong>${escapeHtml(t.teamName)}</strong><br/><span class="mono" style="font-size:12px;color:var(--text-muted);">${escapeHtml(t.teamNumber)}</span></td>
      <td>${venue ? escapeHtml(venue.name) : '—'}</td>
      <td>${problem ? escapeHtml(problem.code) : '—'}</td>
      <td>${submitted}/${juryCount}</td>
      <td class="mono">${t.finalScore ?? '—'}</td>
      <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="viewTeam('${t.id}')">View</button>
        <button class="btn btn-ghost btn-sm" onclick="openTeamModal('${t.id}')">Edit</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty-state">No teams match your search.</div></td></tr>`;
}
document.getElementById('team-search').addEventListener('input', renderTeams);

function populateTeamSelects() {
  const venueSel = document.getElementById('team-venue');
  const problemSel = document.getElementById('team-problem');
  venueSel.innerHTML = Store.getVenues().map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
  problemSel.innerHTML = `<option value="">— None —</option>` +
    Store.getProblems().map((p) => `<option value="${p.id}">${escapeHtml(p.code)} — ${escapeHtml(p.title)}</option>`).join('');
}

function openTeamModal(id) {
  populateTeamSelects();
  document.getElementById('team-error').textContent = '';
  const isEdit = !!id;
  document.getElementById('team-modal-title').textContent = isEdit ? 'Edit Team' : 'Add Team';
  document.getElementById('team-id').value = id || '';
  if (isEdit) {
    const t = Store.getTeams().find((x) => x.id === id);
    document.getElementById('team-number').value = t.teamNumber;
    document.getElementById('team-name').value = t.teamName;
    document.getElementById('team-venue').value = t.venueId;
    document.getElementById('team-problem').value = t.problemId || '';
  } else {
    document.getElementById('team-number').value = '';
    document.getElementById('team-name').value = '';
  }
  openModal('modal-team');
}
document.getElementById('add-team-btn').addEventListener('click', () => openTeamModal(null));

document.getElementById('team-save-btn').addEventListener('click', () => {
  const id = document.getElementById('team-id').value;
  const teamNumber = document.getElementById('team-number').value.trim();
  const teamName = document.getElementById('team-name').value.trim();
  const venueId = document.getElementById('team-venue').value;
  const problemId = document.getElementById('team-problem').value;
  const errEl = document.getElementById('team-error');

  if (!teamNumber || !teamName || !venueId) {
    errEl.textContent = 'Team number, name, and venue are required.';
    return;
  }
  const result = id
    ? Store.updateTeam(session, id, { teamNumber, teamName, venueId, problemId })
    : Store.addTeam(session, { teamNumber, teamName, venueId, problemId });

  if (result.error) { errEl.textContent = result.error; return; }
  closeModal('modal-team');
  toast(id ? 'Team updated.' : 'Team added.');
  renderAll();
});

function viewTeam(id) {
  const t = Store.getTeams().find((x) => x.id === id);
  const venue = Store.getVenues().find((v) => v.id === t.venueId);
  const problem = Store.getProblems().find((p) => p.id === t.problemId);
  const assignments = Store.getAssignments().filter((a) => a.teamId === id);
  const users = Store.getUsers();
  const evaluations = Store.getEvaluations();

  document.getElementById('team-detail-title').textContent = `${t.teamName} · ${t.teamNumber}`;
  const rows = assignments.map((a) => {
    const jury = users.find((u) => u.id === a.juryId);
    const ev = evaluations.find((e) => e.teamId === id && e.juryId === a.juryId);
    return `<tr>
      <td>${escapeHtml(jury ? jury.name : '—')}</td>
      <td class="mono">${ev ? ev.totalScore : '—'}</td>
      <td>${ev ? `<span class="badge badge-${ev.status.toLowerCase()}">${ev.status}</span>` : '<span class="badge badge-pending">PENDING</span>'}</td>
      <td>${ev && ev.status === 'SUBMITTED' ? `<button class="btn btn-danger btn-sm" onclick="openUnlockModal('${ev.id}')">Unlock</button>` : ''}</td>
    </tr>`;
  }).join('');

  document.getElementById('team-detail-body').innerHTML = `
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
      ${venue ? escapeHtml(venue.name) : '—'} · ${problem ? escapeHtml(problem.code) + ' — ' + escapeHtml(problem.title) : 'No problem statement set'}
    </div>
    <table style="width:100%;"><thead><tr><th style="text-align:left;font-size:11px;color:var(--text-muted);padding-bottom:8px;">Jury</th><th style="text-align:left;font-size:11px;color:var(--text-muted);">Score</th><th style="text-align:left;font-size:11px;color:var(--text-muted);">Status</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="padding:14px 0;color:var(--text-muted);">No juries assigned yet.</td></tr>'}</tbody></table>
  `;
  openModal('modal-team-detail');
}

// ---------------- JURIES ----------------
function renderJuries() {
  const search = (document.getElementById('jury-search').value || '').toLowerCase();
  const juries = Store.getUsers().filter(
    (u) => u.role === 'JURY' && (u.name.toLowerCase().includes(search) || u.username.toLowerCase().includes(search))
  );
  const venues = Store.getVenues();
  const assignments = Store.getAssignments();
  const evaluations = Store.getEvaluations();

  document.getElementById('juries-body').innerHTML = juries.map((j) => {
    const venue = venues.find((v) => v.id === j.venueId);
    const assigned = assignments.filter((a) => a.juryId === j.id).length;
    const completed = evaluations.filter((e) => e.juryId === j.id && e.status === 'SUBMITTED').length;
    return `<tr>
      <td><strong>${escapeHtml(j.name)}</strong></td>
      <td class="mono">${escapeHtml(j.username)}</td>
      <td>${venue ? escapeHtml(venue.name) : '—'}</td>
      <td>${assigned}</td>
      <td>${completed}</td>
      <td>${j.active ? '<span class="badge badge-completed">ACTIVE</span>' : '<span class="badge badge-inactive">INACTIVE</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openJuryModal('${j.id}')">Edit</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty-state">No juries match your search.</div></td></tr>`;
}
document.getElementById('jury-search').addEventListener('input', renderJuries);

function populateJuryVenueSelect() {
  document.getElementById('jury-venue').innerHTML = Store.getVenues().map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
}

function openJuryModal(id) {
  populateJuryVenueSelect();
  document.getElementById('jury-error').textContent = '';
  const isEdit = !!id;
  document.getElementById('jury-modal-title').textContent = isEdit ? 'Edit Jury' : 'Add Jury';
  document.getElementById('jury-id').value = id || '';
  document.getElementById('jury-active-field').style.display = isEdit ? 'block' : 'none';
  document.getElementById('jury-password-field').style.display = isEdit ? 'none' : 'block';
  if (isEdit) {
    const j = Store.getUsers().find((x) => x.id === id);
    document.getElementById('jury-name').value = j.name;
    document.getElementById('jury-username').value = j.username;
    document.getElementById('jury-venue').value = j.venueId || '';
    document.getElementById('jury-active').value = String(j.active);
  } else {
    document.getElementById('jury-name').value = '';
    document.getElementById('jury-username').value = '';
    document.getElementById('jury-password').value = '';
  }
  openModal('modal-jury');
}
document.getElementById('add-jury-btn').addEventListener('click', () => openJuryModal(null));

document.getElementById('jury-save-btn').addEventListener('click', () => {
  const id = document.getElementById('jury-id').value;
  const name = document.getElementById('jury-name').value.trim();
  const username = document.getElementById('jury-username').value.trim();
  const venueId = document.getElementById('jury-venue').value;
  const errEl = document.getElementById('jury-error');

  if (!name || !username) { errEl.textContent = 'Name and username/email are required.'; return; }

  let result;
  if (id) {
    result = Store.updateJury(session, id, { name, username, venueId, active: document.getElementById('jury-active').value === 'true' });
  } else {
    const password = document.getElementById('jury-password').value.trim();
    if (!password) { errEl.textContent = 'A password is required for a new jury.'; return; }
    result = Store.addJury(session, { name, username, password, venueId });
  }
  if (result.error) { errEl.textContent = result.error; return; }
  closeModal('modal-jury');
  toast(id ? 'Jury updated.' : 'Jury added.');
  renderAll();
});

// ---------------- VENUES ----------------
function renderVenues() {
  const venues = Store.getVenues();
  const teams = Store.getTeams();
  const users = Store.getUsers();
  const evaluations = Store.getEvaluations();

  document.getElementById('venues-grid').innerHTML = venues.map((v) => {
    const vTeams = teams.filter((t) => t.venueId === v.id);
    const vJuries = users.filter((u) => u.role === 'JURY' && u.venueId === v.id);
    const completed = evaluations.filter((e) => e.status === 'SUBMITTED' && vTeams.some((t) => t.id === e.teamId)).length;
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px;">
        <div>
          <strong style="font-size:16px;">${escapeHtml(v.name)}</strong>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Capacity ${v.capacity}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openVenueModal('${v.id}')">Edit</button>
      </div>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
        ${vTeams.length} teams · ${vJuries.length} juries · ${completed} evaluations submitted
      </div>
    </div>`;
  }).join('') || `<div class="empty-state">No venues yet.</div>`;
}

function openVenueModal(id) {
  document.getElementById('venue-error').textContent = '';
  const isEdit = !!id;
  document.getElementById('venue-modal-title').textContent = isEdit ? 'Edit Venue' : 'Add Venue';
  document.getElementById('venue-id').value = id || '';
  if (isEdit) {
    const v = Store.getVenues().find((x) => x.id === id);
    document.getElementById('venue-name').value = v.name;
    document.getElementById('venue-capacity').value = v.capacity;
  } else {
    document.getElementById('venue-name').value = '';
    document.getElementById('venue-capacity').value = '50';
  }
  openModal('modal-venue');
}
document.getElementById('add-venue-btn').addEventListener('click', () => openVenueModal(null));

document.getElementById('venue-save-btn').addEventListener('click', () => {
  const id = document.getElementById('venue-id').value;
  const name = document.getElementById('venue-name').value.trim();
  const capacity = document.getElementById('venue-capacity').value;
  const errEl = document.getElementById('venue-error');
  if (!name || !capacity || Number(capacity) <= 0) { errEl.textContent = 'A name and a positive capacity are required.'; return; }

  const result = id ? Store.updateVenue(session, id, { name, capacity }) : Store.addVenue(session, { name, capacity });
  if (result.error) { errEl.textContent = result.error; return; }
  closeModal('modal-venue');
  toast(id ? 'Venue updated.' : 'Venue added.');
  renderAll();
});

// ---------------- CRITERIA ----------------
function renderCriteria() {
  const criteria = [...Store.getCriteria()].sort((a, b) => a.displayOrder - b.displayOrder);
  document.getElementById('total-marks').textContent = Store.totalMaxMarks();
  document.getElementById('criteria-list').innerHTML = criteria.map((c) => `
    <div class="criteria-row">
      <div>
        <strong>${escapeHtml(c.name)}</strong>
        <span class="mono" style="color:var(--text-muted);font-size:12px;margin-left:8px;">Order ${c.displayOrder}</span>
        ${!c.active ? '<span class="badge badge-inactive" style="margin-left:8px;">INACTIVE</span>' : ''}
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        <span class="mono">${c.maxMarks} pts</span>
        <button class="btn btn-ghost btn-sm" onclick="openCriterionModal('${c.id}')">Edit</button>
      </div>
    </div>`).join('') || `<div class="empty-state">No criteria yet.</div>`;
}

function openCriterionModal(id) {
  document.getElementById('criterion-error').textContent = '';
  const isEdit = !!id;
  document.getElementById('criterion-modal-title').textContent = isEdit ? 'Edit Criterion' : 'Add Criterion';
  document.getElementById('criterion-id').value = id || '';
  document.getElementById('criterion-active-field').style.display = isEdit ? 'block' : 'none';
  if (isEdit) {
    const c = Store.getCriteria().find((x) => x.id === id);
    document.getElementById('criterion-name').value = c.name;
    document.getElementById('criterion-max').value = c.maxMarks;
    document.getElementById('criterion-order').value = c.displayOrder;
    document.getElementById('criterion-active').value = String(c.active);
  } else {
    document.getElementById('criterion-name').value = '';
    document.getElementById('criterion-max').value = '';
    document.getElementById('criterion-order').value = String(Store.getCriteria().length + 1);
  }
  openModal('modal-criterion');
}
document.getElementById('add-criterion-btn').addEventListener('click', () => openCriterionModal(null));

document.getElementById('criterion-save-btn').addEventListener('click', () => {
  const id = document.getElementById('criterion-id').value;
  const name = document.getElementById('criterion-name').value.trim();
  const maxMarks = document.getElementById('criterion-max').value;
  const displayOrder = document.getElementById('criterion-order').value;
  const errEl = document.getElementById('criterion-error');
  if (!name || !maxMarks || Number(maxMarks) <= 0) { errEl.textContent = 'Name and a positive max marks value are required.'; return; }

  const result = id
    ? Store.updateCriterion(session, id, { name, maxMarks, displayOrder, active: document.getElementById('criterion-active').value === 'true' })
    : Store.addCriterion(session, { name, maxMarks, displayOrder });
  if (result.error) { errEl.textContent = result.error; return; }
  closeModal('modal-criterion');
  toast(id ? 'Criterion updated.' : 'Criterion added.');
  renderAll();
});

// ---------------- LEADERBOARD ----------------
function renderLeaderboard() {
  const rows = Store.leaderboard();
  document.getElementById('leaderboard-body').innerHTML = rows.map((r) => `
    <tr>
      <td>${r.rank ?? '—'}</td>
      <td><strong>${escapeHtml(r.teamName)}</strong> <span class="mono" style="color:var(--text-muted);">${escapeHtml(r.teamNumber)}</span></td>
      <td>${escapeHtml(r.venueName)}</td>
      <td class="mono">${escapeHtml(r.problemCode)}</td>
      <td class="mono">${r.finalScore ?? '—'}</td>
      <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
    </tr>`).join('') || `<tr><td colspan="6"><div class="empty-state">No scores yet.</div></td></tr>`;
}
document.getElementById('refresh-leaderboard-btn').addEventListener('click', () => { renderLeaderboard(); toast('Leaderboard refreshed.'); });

// ---------------- AUDIT LOG ----------------
function renderAudit() {
  const logs = Store.getAuditLogs();
  document.getElementById('audit-body').innerHTML = logs.slice(0, 200).map((l) => `
    <tr>
      <td class="mono" style="font-size:12px;">${formatDate(l.timestamp)}</td>
      <td>${escapeHtml(l.userName || '—')} <span style="color:var(--text-muted);font-size:11px;">${escapeHtml(l.userRole || '')}</span></td>
      <td>${escapeHtml(l.action)}</td>
      <td>${escapeHtml(l.entity)}</td>
      <td style="color:var(--text-muted);">${escapeHtml(l.reason || '—')}</td>
    </tr>`).join('') || `<tr><td colspan="5"><div class="empty-state">No activity yet.</div></td></tr>`;
}

// ---------------- UNLOCK ----------------
function openUnlockModal(evaluationId) {
  document.getElementById('unlock-eval-id').value = evaluationId;
  document.getElementById('unlock-reason').value = '';
  document.getElementById('unlock-error').textContent = '';
  closeModal('modal-team-detail');
  openModal('modal-unlock');
}
document.getElementById('unlock-save-btn').addEventListener('click', () => {
  const id = document.getElementById('unlock-eval-id').value;
  const reason = document.getElementById('unlock-reason').value;
  const errEl = document.getElementById('unlock-error');
  const result = Store.unlockEvaluation(session, id, reason);
  if (result.error) { errEl.textContent = result.error; return; }
  closeModal('modal-unlock');
  toast('Evaluation unlocked.');
  renderAll();
});

// ---------------- EXPORT TO EXCEL ----------------
document.getElementById('export-excel-btn').addEventListener('click', () => {
  const rows = Store.leaderboard().map((r) => ({
    Rank: r.rank ?? '',
    'Team Number': r.teamNumber,
    'Team Name': r.teamName,
    Venue: r.venueName,
    'Problem Code': r.problemCode,
    'Problem Title': r.problemTitle,
    'Final Score': r.finalScore ?? '',
    Status: r.status,
    'Evaluations Submitted': r.evalCount,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const filename = `Hackathon_Evaluation_Results_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  Store.audit(session, 'EXPORT_EXCEL_RESULTS', 'Event', null, null, null, 'Admin downloaded evaluation result sheet');
  toast('Results exported.');
});

// ---------------- live updates ----------------
Store.onLiveChange(() => renderAll());

// ---------------- initial render ----------------
renderAll();
