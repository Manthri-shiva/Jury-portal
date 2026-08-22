/* ============================================================
   Jury Portal — data store
   All data lives in localStorage under one namespaced key.
   Every page (login/admin/jury) imports this one file for
   ALL reads/writes — no duplicate data-access code anywhere.
   ============================================================ */

const DB_KEY = 'jury_portal_db_v1';
const SESSION_KEY = 'jury_portal_session_v1';
const CHANNEL_NAME = 'jury_portal_live';

// ---------- id helper ----------
function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- seed data (first run only — clean state) ----------
function seedData() {
  const criteria = [
    { id: 'c1', name: 'Innovation', maxMarks: 25, displayOrder: 1, active: true },
    { id: 'c2', name: 'Technical Execution', maxMarks: 25, displayOrder: 2, active: true },
    { id: 'c3', name: 'Presentation', maxMarks: 20, displayOrder: 3, active: true },
    { id: 'c4', name: 'Real-World Impact', maxMarks: 20, displayOrder: 4, active: true },
    { id: 'c5', name: 'Feasibility', maxMarks: 10, displayOrder: 5, active: true },
  ];

  const users = [
    { id: 'u_admin', name: 'Event Admin', username: 'admin', password: 'admin123', role: 'ADMIN', active: true, venueId: null }
  ];

  const venues = [];
  const problems = [];
  const teams = [];
  const assignments = [];

  return { criteria, venues, problems, users, teams, assignments, evaluations: [], auditLogs: [] };
}

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const fresh = seedData();
    localStorage.setItem(DB_KEY, JSON.stringify(fresh));
    return fresh;
  }
  return JSON.parse(raw);
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  broadcast({ type: 'DB_CHANGED', ts: Date.now() });
}

// ---------- live / real-time layer ----------
const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL_NAME) : null;
const liveListeners = [];

function broadcast(payload) {
  if (bc) bc.postMessage(payload);
}

function onLiveChange(cb) {
  liveListeners.push(cb);
}

if (bc) {
  bc.onmessage = (e) => liveListeners.forEach((cb) => cb(e.data));
}

window.addEventListener('storage', (e) => {
  if (e.key === DB_KEY) liveListeners.forEach((cb) => cb({ type: 'DB_CHANGED', ts: Date.now() }));
});

// ============================================================
// Public Store API
// ============================================================
const Store = {
  // ---- session ----
  getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  },
  setSession(session) {
    session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },
  clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  },

  // ---- auth ----
  login(username, password) {
    const db = loadDB();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
    );
    if (!user) return { error: 'Invalid username or password.' };
    if (!user.active) return { error: 'This account has been deactivated. Contact the admin.' };
    const session = { userId: user.id, username: user.username, name: user.name, role: user.role, venueId: user.venueId };
    Store.setSession(session);
    Store.audit(session, 'LOGIN', 'User', user.id);
    return { session };
  },
  logout() {
    const session = Store.getSession();
    if (session) Store.audit(session, 'LOGOUT', 'User', session.userId);
    Store.clearSession();
  },
  changePassword(userId, oldPassword, newPassword) {
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return { error: 'User not found.' };
    if (user.password !== oldPassword) return { error: 'Current password is incorrect.' };
    user.password = newPassword;
    saveDB(db);
    return { ok: true };
  },

  // ---- audit ----
  audit(session, action, entity, entityId, previousValue = null, newValue = null, reason = null) {
    const db = loadDB();
    db.auditLogs.unshift({
      id: uid('log'),
      userId: session ? session.userId : null,
      userRole: session ? session.role : null,
      userName: session ? session.name : 'System',
      action,
      entity,
      entityId: entityId || null,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      reason: reason || null,
      timestamp: new Date().toISOString(),
    });
    saveDB(db);
  },
  getAuditLogs() {
    return loadDB().auditLogs;
  },

  // ---- raw getters ----
  raw() { return loadDB(); },
  getVenues() { return loadDB().venues; },
  getProblems() { return loadDB().problems; },
  getCriteria() { return loadDB().criteria; },
  getUsers() { return loadDB().users; },
  getTeams() { return loadDB().teams; },
  getAssignments() { return loadDB().assignments; },
  getEvaluations() { return loadDB().evaluations; },

  // ---- venues ----
  addVenue(session, { name, capacity }) {
    const db = loadDB();
    const venue = { id: uid('v'), name, capacity: Number(capacity) };
    db.venues.push(venue);
    saveDB(db);
    Store.audit(session, 'CREATE', 'Venue', venue.id, null, venue);
    return venue;
  },
  updateVenue(session, id, patch) {
    const db = loadDB();
    const venue = db.venues.find((v) => v.id === id);
    if (!venue) return { error: 'Venue not found' };
    const before = { ...venue };
    Object.assign(venue, patch, { capacity: Number(patch.capacity ?? venue.capacity) });
    saveDB(db);
    Store.audit(session, 'UPDATE', 'Venue', id, before, venue);
    return venue;
  },

  // ---- criteria ----
  addCriterion(session, { name, maxMarks, displayOrder }) {
    const db = loadDB();
    const crit = { id: uid('c'), name, maxMarks: Number(maxMarks), displayOrder: Number(displayOrder), active: true };
    db.criteria.push(crit);
    saveDB(db);
    Store.audit(session, 'CREATE', 'Criterion', crit.id, null, crit);
    return crit;
  },
  updateCriterion(session, id, patch) {
    const db = loadDB();
    const crit = db.criteria.find((c) => c.id === id);
    if (!crit) return { error: 'Criterion not found' };
    const before = { ...crit };
    Object.assign(crit, patch);
    if (patch.maxMarks !== undefined) crit.maxMarks = Number(patch.maxMarks);
    if (patch.displayOrder !== undefined) crit.displayOrder = Number(patch.displayOrder);
    saveDB(db);
    Store.audit(session, 'UPDATE', 'Criterion', id, before, crit);
    return crit;
  },

  // ---- teams ----
  addTeam(session, { teamNumber, teamName, venueId, problemId }) {
    const db = loadDB();
    const team = { id: uid('t'), teamNumber, teamName, venueId: venueId || null, problemId: problemId || null, status: 'PENDING' };
    db.teams.push(team);
    saveDB(db);
    Store.audit(session, 'CREATE', 'Team', team.id, null, team);
    return team;
  },
  updateTeam(session, id, patch) {
    const db = loadDB();
    const team = db.teams.find((t) => t.id === id);
    if (!team) return { error: 'Team not found' };
    const before = { ...team };
    Object.assign(team, patch);
    saveDB(db);
    Store.audit(session, 'UPDATE', 'Team', id, before, team);
    return team;
  },

  // ---- juries ----
  addJury(session, { name, username, password, venueId }) {
    const db = loadDB();
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { error: 'That username/email is already in use.' };
    }
    const jury = { id: uid('u'), name, username, password, role: 'JURY', active: true, venueId: venueId || null };
    db.users.push(jury);
    saveDB(db);
    Store.audit(session, 'CREATE', 'Jury', jury.id, null, { ...jury, password: '••••' });
    return jury;
  },
  updateJury(session, id, patch) {
    const db = loadDB();
    const jury = db.users.find((u) => u.id === id && u.role === 'JURY');
    if (!jury) return { error: 'Jury not found' };
    const before = { ...jury, password: '••••' };
    Object.assign(jury, patch);
    saveDB(db);
    Store.audit(session, 'UPDATE', 'Jury', id, before, { ...jury, password: '••••' });
    return jury;
  },

  // ---- assignments ----
  assignJuryToTeam(session, juryId, teamId) {
    const db = loadDB();
    const exists = db.assignments.some((a) => a.juryId === juryId && a.teamId === teamId);
    if (exists) return { error: 'Already assigned.' };
    const asg = { id: uid('asg'), juryId, teamId };
    db.assignments.push(asg);
    saveDB(db);
    Store.audit(session, 'CREATE', 'Assignment', asg.id, null, asg);
    return asg;
  },

  // ---- evaluations ----
  getEvaluationFor(teamId, juryId) {
    return loadDB().evaluations.find((e) => e.teamId === teamId && e.juryId === juryId) || null;
  },
  submitEvaluation(session, { teamId, scores, comment }) {
    const db = loadDB();
    const juryId = session.userId;

    const isAssigned = db.assignments.some((a) => a.juryId === juryId && a.teamId === teamId);
    if (!isAssigned) return { error: 'You are not assigned to evaluate this team.' };

    let evaluation = db.evaluations.find((e) => e.teamId === teamId && e.juryId === juryId);
    if (evaluation && evaluation.status === 'SUBMITTED') {
      return { error: 'This evaluation is already submitted and locked. Ask an admin to unlock it.' };
    }

    const activeCriteria = db.criteria.filter((c) => c.active);
    let total = 0;
    for (const crit of activeCriteria) {
      const val = Number(scores[crit.id]);
      if (Number.isNaN(val) || val < 0 || val > crit.maxMarks) {
        return { error: `Score for "${crit.name}" must be between 0 and ${crit.maxMarks}.` };
      }
      total += val;
    }

    const before = evaluation ? { ...evaluation } : null;
    if (!evaluation) {
      evaluation = { id: uid('ev'), teamId, juryId };
      db.evaluations.push(evaluation);
    }
    evaluation.scores = scores;
    evaluation.totalScore = total;
    evaluation.comment = comment || '';
    evaluation.status = 'SUBMITTED';
    evaluation.submittedAt = new Date().toISOString();

    Store._recomputeTeamScore(db, teamId);

    saveDB(db);
    Store.audit(session, before ? 'RESUBMIT' : 'SUBMIT', 'Evaluation', evaluation.id, before, evaluation);

    return { evaluation };
  },
  unlockEvaluation(session, evaluationId, reason) {
    const db = loadDB();
    const evaluation = db.evaluations.find((e) => e.id === evaluationId);
    if (!evaluation) return { error: 'Evaluation not found.' };
    if (!reason || !reason.trim()) return { error: 'A reason is required to unlock an evaluation.' };
    const before = { ...evaluation };
    evaluation.status = 'UNLOCKED';
    evaluation.unlockedAt = new Date().toISOString();
    Store._recomputeTeamScore(db, evaluation.teamId);
    saveDB(db);
    Store.audit(session, 'UNLOCK', 'Evaluation', evaluationId, before, evaluation, reason);
    return { evaluation };
  },
  _recomputeTeamScore(db, teamId) {
    const submitted = db.evaluations.filter((e) => e.teamId === teamId && e.status === 'SUBMITTED');
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) return;
    if (submitted.length === 0) {
      team.status = 'PENDING';
      team.finalScore = null;
      return;
    }
    const avg = submitted.reduce((sum, e) => sum + e.totalScore, 0) / submitted.length;
    team.finalScore = Math.round(avg * 100) / 100;
    const assignedJuryIds = db.assignments.filter((a) => a.teamId === teamId).map((a) => a.juryId);
    const submittedJuryIds = new Set(submitted.map((e) => e.juryId));
    team.status = assignedJuryIds.every((id) => submittedJuryIds.has(id)) ? 'COMPLETED' : 'PENDING';
  },

  // ---- derived / view helpers ----
  totalMaxMarks() {
    return loadDB().criteria.filter((c) => c.active).reduce((sum, c) => sum + c.maxMarks, 0);
  },
  leaderboard() {
    const db = loadDB();
    const rows = db.teams.map((team) => {
      const venue = db.venues.find((v) => v.id === team.venueId);
      const problem = db.problems.find((p) => p.id === team.problemId);
      const evalCount = db.evaluations.filter((e) => e.teamId === team.id && e.status === 'SUBMITTED').length;
      return {
        id: team.id,
        teamNumber: team.teamNumber,
        teamName: team.teamName,
        venueName: venue ? venue.name : '—',
        problemCode: problem ? problem.code : '—',
        problemTitle: problem ? problem.title : '—',
        finalScore: team.finalScore ?? null,
        status: team.status,
        evalCount,
      };
    });
    rows.sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
    let rank = 0;
    return rows.map((r, i) => {
      rank = r.finalScore != null ? i + 1 : null;
      return { ...r, rank };
    });
  },
  onLiveChange,
};

window.Store = Store;