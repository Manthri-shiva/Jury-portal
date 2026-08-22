/* ============================================================
   Jury Portal — Jury page logic
   ============================================================ */

const session = requireSession('JURY');
let currentTeamId = null;

if (session) {
  document.getElementById('session-name').textContent = session.name;
  document.getElementById('session-initial').textContent = session.name.charAt(0).toUpperCase();
  const venue = Store.getVenues().find((v) => v.id === session.venueId);
  document.getElementById('sidebar-venue').textContent = venue ? venue.name : 'No venue assigned';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  Store.logout();
  window.location.href = 'index.html';
});

function showView(name) {
  document.getElementById('view-list').classList.toggle('active', name === 'list');
  document.getElementById('view-evaluate').classList.toggle('active', name === 'evaluate');
}
document.getElementById('back-btn').addEventListener('click', () => { currentTeamId = null; showView('list'); renderTeamList(); });

// ---------------- TEAM LIST ----------------
function renderTeamList() {
  const search = (document.getElementById('team-search').value || '').toLowerCase();
  const myAssignments = Store.getAssignments().filter((a) => a.juryId === session.userId);
  const teams = Store.getTeams().filter((t) =>
    myAssignments.some((a) => a.teamId === t.id) &&
    (t.teamName.toLowerCase().includes(search) || t.teamNumber.toLowerCase().includes(search))
  );
  const venues = Store.getVenues();
  const problems = Store.getProblems();

  document.getElementById('teams-grid').innerHTML = teams.map((t) => {
    const venue = venues.find((v) => v.id === t.venueId);
    const problem = problems.find((p) => p.id === t.problemId);
    const ev = Store.getEvaluationFor(t.id, session.userId);
    const status = ev ? ev.status : 'PENDING';
    return `
      <div class="card" style="cursor:pointer;" onclick="openEvaluate('${t.id}')">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
          <div>
            <strong style="font-size:16px;">${escapeHtml(t.teamName)}</strong>
            <div class="mono" style="font-size:12px;color:var(--text-muted);">${escapeHtml(t.teamNumber)}</div>
          </div>
          <span class="badge badge-${status.toLowerCase()}">${status}</span>
        </div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.7;">
          ${venue ? escapeHtml(venue.name) : '—'}<br/>
          ${problem ? escapeHtml(problem.code) + ' — ' + escapeHtml(problem.title) : 'No problem statement'}
        </div>
        ${ev && ev.totalScore != null ? `<div class="mono" style="margin-top:10px;font-size:20px;font-weight:700;color:var(--accent-2);">${ev.totalScore}</div>` : ''}
      </div>`;
  }).join('') || `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">🗂️</div>No teams match your search.</div>`;
}
document.getElementById('team-search').addEventListener('input', renderTeamList);

// ---------------- EVALUATE VIEW ----------------
function openEvaluate(teamId) {
  currentTeamId = teamId;
  const team = Store.getTeams().find((t) => t.id === teamId);
  const venue = Store.getVenues().find((v) => v.id === team.venueId);
  const problem = Store.getProblems().find((p) => p.id === team.problemId);
  const criteria = Store.getCriteria().filter((c) => c.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const existing = Store.getEvaluationFor(teamId, session.userId);
  const locked = existing && existing.status === 'SUBMITTED';

  document.getElementById('eval-team-name').textContent = team.teamName;
  document.getElementById('eval-venue-name').textContent = `${venue ? venue.name : '—'} · ${team.teamNumber}`;
  document.getElementById('eval-problem-code').textContent = problem ? problem.code : 'No problem statement';
  document.getElementById('eval-problem-title').textContent = problem ? problem.title : '—';
  document.getElementById('eval-problem-desc').textContent = problem ? problem.description : '';
  document.getElementById('eval-total-max').textContent = Store.totalMaxMarks();
  document.getElementById('eval-comment').value = existing ? existing.comment || '' : '';
  document.getElementById('eval-error').textContent = '';

  document.getElementById('eval-status-badge').innerHTML = existing
    ? `<span class="badge badge-${existing.status.toLowerCase()}">${existing.status}</span>`
    : `<span class="badge badge-pending">NOT STARTED</span>`;

  document.getElementById('eval-criteria-list').innerHTML = criteria.map((c) => {
    const val = existing && existing.scores ? existing.scores[c.id] ?? '' : '';
    return `
      <div class="score-input-row">
        <div>
          <div class="crit-name">${escapeHtml(c.name)}</div>
          <div class="crit-max">Max ${c.maxMarks} pts</div>
        </div>
        <input type="number" min="0" max="${c.maxMarks}" step="0.5" class="crit-score-input" data-crit="${c.id}" data-max="${c.maxMarks}" value="${val}" ${locked ? 'disabled' : ''} />
      </div>`;
  }).join('');

  updateLiveTotal();
  document.querySelectorAll('.crit-score-input').forEach((input) => input.addEventListener('input', updateLiveTotal));

  const submitBtn = document.getElementById('eval-submit-btn');
  submitBtn.disabled = !!locked;
  submitBtn.textContent = locked ? 'Locked — Ask Admin to Unlock' : (existing ? 'Resubmit Evaluation' : 'Submit Evaluation');

  showView('evaluate');
}

function updateLiveTotal() {
  let total = 0;
  document.querySelectorAll('.crit-score-input').forEach((input) => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) total += v;
  });
  document.getElementById('eval-live-total').textContent = total;
}

document.getElementById('eval-submit-btn').addEventListener('click', () => {
  const errEl = document.getElementById('eval-error');
  errEl.textContent = '';
  const scores = {};
  let valid = true;
  document.querySelectorAll('.crit-score-input').forEach((input) => {
    const critId = input.dataset.crit;
    const max = Number(input.dataset.max);
    const val = parseFloat(input.value);
    if (Number.isNaN(val) || val < 0 || val > max) valid = false;
    scores[critId] = val;
  });
  if (!valid) { errEl.textContent = 'Please enter a valid score within range for every criterion.'; return; }

  const comment = document.getElementById('eval-comment').value;
  const result = Store.submitEvaluation(session, { teamId: currentTeamId, scores, comment });
  if (result.error) { errEl.textContent = result.error; return; }

  toast('Evaluation submitted and locked.');
  currentTeamId = null;
  showView('list');
  renderTeamList();
});

// ---------------- live updates ----------------
Store.onLiveChange(() => {
  if (document.getElementById('view-list').classList.contains('active')) renderTeamList();
});

// ---------------- initial render ----------------
renderTeamList();
