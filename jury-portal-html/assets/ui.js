/* ============================================================
   Jury Portal — shared UI helpers
   Used by admin.js and jury.js. Keep this the ONLY place
   toast/modal/escape logic lives.
   ============================================================ */

function toast(message, type = 'success') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function requireSession(allowedRole) {
  const session = Store.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  if (allowedRole && session.role !== allowedRole) {
    window.location.href = session.role === 'ADMIN' ? 'admin.html' : 'jury.html';
    return null;
  }
  return session;
}
