import { initializeApp }   from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
                           from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, ref, onValue, set, remove, update, get }
                           from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const FB = {
  apiKey:"AIzaSyACW8aFQmlaoaxNtE55m8Pck6H8BRlfEbs",
  authDomain:"moon-night-x.firebaseapp.com",
  databaseURL:"https://moon-night-x-default-rtdb.firebaseio.com",
  projectId:"moon-night-x",
  storageBucket:"moon-night-x.firebasestorage.app",
  messagingSenderId:"779934381788",
  appId:"1:779934381788:web:1426fa035171015634a619"
};
const OWNER = "aryakaran836@gmail.com";

const fbApp = initializeApp(FB);
const auth  = getAuth(fbApp);
const db    = getDatabase(fbApp);
const gp    = new GoogleAuthProvider();

// ── UTILS ──────────────────────────────────────────────────────────────
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function snapToArray(snap) {
  if (!snap || !snap.exists()) return [];
  const val = snap.val();
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'object') {
    return Object.entries(val).map(([k, v]) => {
      if (v && typeof v === 'object') {
        return { _key: k, username: k, ...v };
      }
      return v;
    }).filter(Boolean);
  }
  return [];
}

// ── STATE ──────────────────────────────────────────────────────────────
let saClients     = [];
let saWithdrawals = [];
let clImages      = [];
let clCats        = [];
let clClientData  = null;
let saEditId      = null;
let clEditImgId   = null;
let clEditCatId   = null;
let saActLog      = JSON.parse(localStorage.getItem('sa_log') || '[]');

// ── TOAST ──────────────────────────────────────────────────────────────
function toast(msg, type='ok') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.className = 'on ' + type;
  clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 3000);
}

// ── AUTH CHECK ─────────────────────────────────────────────────────────
function checkAuth() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("AUTH_REQUIRED: User is not logged in. Please sign in with Google.");
  }
  const email = (user.email || '').toLowerCase();
  if (email !== OWNER) {
    throw new Error(`UNAUTHORIZED: Access denied. User "${email}" is not authorized as Super Admin.`);
  }
  return user;
}

// ── ROUTER ─────────────────────────────────────────────────────────────
function getRoute() {
  const hash = window.location.hash || '#/';
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

function parseRoute(path) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length)                    return { type: 'login' };
  if (parts[0] === 'super')             return { type: 'super' };
  if (parts[0] === 'admin' && parts[1]) return { type: 'client', username: parts[1] };
  if (parts.length === 1 && parts[0] !== 'super' && parts[0] !== 'admin')
                                        return { type: 'site', username: parts[0] };
  return { type: 'login' };
}

function navigate(path) {
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  window.location.hash = '#' + cleanPath;
}

function getClientSiteUrl(c) {
  if (!c) return '';
  const username = c.username || c.id;
  return `https://moonlightx.qd.je/${username}`;
}

// ── AUTH STATE & ROUTE HANDLING ────────────────────────────────────────
const G_SVG = document.getElementById('g-btn') ? document.getElementById('g-btn').innerHTML : '';
function resetGBtn() {
  const btn = document.getElementById('g-btn');
  if(btn) { btn.innerHTML = G_SVG; btn.disabled = false; }
}

(async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await handleRoute(result.user);
    }
  } catch(e) {
    console.error('Redirect result error:', e.code, e.message);
  }
})();

async function handleRoute(user) {
  const route = parseRoute(getRoute());

  if (!user) {
    showView('login');
    setupLoginUI(route);
    resetGBtn();
    return;
  }

  const email = (user.email || '').toLowerCase();

  if (route.type === 'login') {
    if (email === OWNER) {
      navigate('super');
      return;
    }

    showView('login');
    document.getElementById('l-sub').textContent   = 'Verifying access...';
    document.getElementById('g-btn').style.display = 'none';

    try {
      let allClients = [];
      try {
        const snap = await get(ref(db, 'clients'));
        allClients = snapToArray(snap);
      } catch (err) {
        console.warn("Could not read clients during login check:", err);
      }

      const client = allClients.find(c => c.googleEmail && c.googleEmail.toLowerCase() === email);

      if (!client) {
        await signOut(auth);
        showErr('❌ Account not found');
        resetGBtn();
        document.getElementById('g-btn').style.display = 'flex';
        setupLoginUI(route);
        return;
      }
      if (client.status === 'disabled' || client.status === 'deleted' || client.active === false) {
        await signOut(auth);
        showErr('❌ Account suspended or disabled');
        resetGBtn();
        document.getElementById('g-btn').style.display = 'flex';
        setupLoginUI(route);
        return;
      }

      clClientData = client;
      navigate(`admin/${client.username}`);
      return;
    } catch (err) {
      console.error('Error during automatic login redirect:', err);
      await signOut(auth);
      showErr('❌ Verification failed. Please try again.');
      resetGBtn();
      document.getElementById('g-btn').style.display = 'flex';
      setupLoginUI(route);
      return;
    }
  }

  if (route.type === 'super') {
    if (email !== OWNER) {
      await signOut(auth);
      showView('login');
      showErr('❌ Access denied. Only owner can access super admin.');
      return;
    }
    showView('super');
    document.getElementById('sa-email').textContent = user.email;
    saInitDB();

  } else if (route.type === 'client') {
    const username = route.username;

    let client = null;
    try {
      const snap = await get(ref(db, 'clients/' + username));
      if (snap.exists()) {
        client = snap.val();
      } else {
        const snapAll = await get(ref(db, 'clients'));
        const allClients = snapToArray(snapAll);
        client = allClients.find(c => c.username === username || c.id === username);
      }
    } catch (err) {
      console.warn("Could not fetch client snapshot:", err);
    }

    if (!client) {
      await signOut(auth);
      showView('login');
      showErr('❌ Client account not found');
      resetGBtn();
      document.getElementById('g-btn').style.display = 'flex';
      return;
    }

    if (client.status === 'disabled' || client.status === 'deleted' || client.active === false) {
      await signOut(auth);
      showView('login');
      showErr('❌ Account is disabled or suspended');
      resetGBtn();
      document.getElementById('g-btn').style.display = 'flex';
      return;
    }

    if (email !== OWNER && client.googleEmail && client.googleEmail.toLowerCase() !== email) {
      await signOut(auth);
      showView('login');
      showErr(`❌ Access denied. This panel is for ${client.googleEmail}`);
      resetGBtn();
      document.getElementById('g-btn').style.display = 'flex';
      return;
    }

    clClientData = client;
    showView('client');
    document.getElementById('cl-email').textContent     = user.email;
    document.getElementById('cl-site-name').textContent = client.displayName || client.name || username;
    document.title = (client.displayName || client.name || username) + ' — Dashboard';
    clInitDB(client.username || client.id);

  } else if (route.type === 'site') {
    showView('login');
    setupLoginUI(route);
  }
}

onAuthStateChanged(auth, async user => { await handleRoute(user); });
window.addEventListener('hashchange', () => handleRoute(auth.currentUser));

function showView(name) {
  ['login','super','client'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (!el) return;
    if (v === name) {
      el.style.display     = 'flex';
      el.style.flexDirection = 'column';
      el.style.height      = '100vh';
    } else {
      el.style.display = 'none';
    }
  });
  if (name === 'login') {
    const lw = document.getElementById('view-login');
    if (lw) {
      lw.style.alignItems     = 'center';
      lw.style.justifyContent = 'center';
    }
  }
}

function setupLoginUI(route) {
  const badge = document.getElementById('l-badge');
  const info  = document.getElementById('l-info');
  const sub   = document.getElementById('l-sub');

  if (route.type === 'client' && route.username) {
    badge.className = 'lbadge client';
    badge.textContent = 'CLIENT ACCESS';
    sub.textContent   = 'Client Dashboard';
    info.innerHTML    = `Sign in with your Google account to access <strong>${escapeHTML(route.username)}</strong>`;
  } else if (route.type === 'super') {
    badge.className   = 'lbadge owner';
    badge.textContent = 'SUPER ADMIN';
    sub.textContent   = 'Owner Control Panel';
    info.innerHTML    = `Only <strong>${OWNER}</strong> can access this panel`;
  } else {
    badge.className   = 'lbadge owner';
    badge.textContent = 'ADMIN';
    sub.textContent   = 'Platform Admin';
    info.textContent  = 'Sign in with Google to continue';
  }
}

function showErr(msg) {
  const el = document.getElementById('l-err');
  if (!el) return;
  el.innerHTML = msg;
  el.style.display = 'block';
}

// ── GOOGLE LOGIN ────────────────────────────────────────────────────────
document.getElementById('g-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('g-btn');
  btn.innerHTML = '⏳ Signing in...';
  btn.disabled  = true;
  document.getElementById('l-err').style.display = 'none';
  try {
    await signInWithPopup(auth, gp);
  } catch(e) {
    if (e.code === 'auth/popup-closed-by-user') {
      resetGBtn();
      return;
    }
    try {
      btn.innerHTML = '⏳ Redirecting...';
      await signInWithRedirect(auth, gp);
    } catch(err2) {
      showErr('❌ Sign in failed: ' + (err2.code || err2.message));
      resetGBtn();
    }
  }
});

async function doLogout() {
  await signOut(auth);
  window.location.hash = '#/';
}
document.getElementById('sa-btn-logout')?.addEventListener('click', doLogout);
document.getElementById('sa-btn-logout2')?.addEventListener('click', doLogout);
document.getElementById('cl-btn-logout')?.addEventListener('click', doLogout);
document.getElementById('cl-btn-logout2')?.addEventListener('click', doLogout);

// ══════════════════════════════════════════════════════════════════════
// ── SUPER ADMIN NAVIGATION & PAGES ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

function saShowPage(name) {
  document.querySelectorAll('#view-super .page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('[data-sa-page]').forEach(i => i.classList.remove('on'));
  document.getElementById('sa-page-' + name)?.classList.add('on');
  document.querySelector(`[data-sa-page="${name}"]`)?.classList.add('on');

  if (name === 'client-earnings') saRenderEarningsTable();
  if (name === 'withdrawals')     saRenderWithdrawalsTable();
}

document.querySelectorAll('[data-sa-page]').forEach(el =>
  el.addEventListener('click', () => saShowPage(el.dataset.saPage)));
document.querySelectorAll('[data-sa-goto]').forEach(el =>
  el.addEventListener('click', () => saShowPage(el.dataset.saGoto)));

// LOG
function saAddLog(type, msg) {
  saActLog.unshift({ type, msg, t: new Date().toISOString() });
  if(saActLog.length > 300) saActLog = saActLog.slice(0, 300);
  localStorage.setItem('sa_log', JSON.stringify(saActLog));
  saRenderLog();
}
function saLogHTML(e) {
  const d = new Date(e.t);
  return `<div style="display:flex;gap:11px;padding:11px 18px;border-bottom:1px solid var(--br)">
    <div><div style="font-size:12px;font-weight:600">${escapeHTML(e.msg)}</div>
    <div style="font-size:10px;color:var(--mu);font-family:monospace;margin-top:2px">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</div></div>
  </div>`;
}
function saRenderLog() {
  const el = document.getElementById('sa-log-list');
  if (el) el.innerHTML = saActLog.length ? saActLog.map(saLogHTML).join('') : '<div class="empty">No activity</div>';
}

// ── REALTIME FIREBASE DB INIT ──────────────────────────────────────────
function saInitDB() {
  // Realtime listener on clients node
  onValue(ref(db, 'clients'), snap => {
    saClients = snapToArray(snap);
    document.getElementById('sa-db-st').textContent = 'Live';
    document.getElementById('sa-nb-clients').textContent = saClients.length;
    saUpdateDash();
    saRenderClients();
    saRenderEarningsTable();
  }, err => {
    console.error('saInitDB clients error:', err);
    document.getElementById('sa-db-st').textContent = 'Error';
  });

  // Realtime listener on withdrawRequests node
  onValue(ref(db, 'withdrawRequests'), snap => {
    saWithdrawals = [];
    if (snap.exists()) {
      const val = snap.val();
      saWithdrawals = Object.entries(val).map(([id, w]) => ({ reqId: id, ...w }));
    }
    const pendingCount = saWithdrawals.filter(w => w.status === 'pending').length;
    const nb = document.getElementById('sa-nb-withdrawals');
    if (nb) nb.textContent = pendingCount;
    saRenderWithdrawalsTable();
  }, err => {
    console.warn('withdrawRequests listener error:', err);
  });
}

function saUpdateDash() {
  const activeCount = saClients.filter(c => c.status === 'active' || c.active !== false).length;
  const totalRev    = saClients.reduce((a,c) => a + Number(c.earnings || c.totalEarning || 0), 0);
  const totalVisits = saClients.reduce((a,c) => a + Number(c.totalViews || c.totalVisits || 0), 0);
  const todayVisits = saClients.reduce((a,c) => a + Number(c.today || c.todayVisits || 0), 0);

  document.getElementById('sa-d-clients').textContent = saClients.length;
  document.getElementById('sa-d-active').textContent  = activeCount;
  document.getElementById('sa-d-rev').textContent     = '$' + totalRev.toFixed(2);
  document.getElementById('sa-d-traffic').textContent = totalVisits.toLocaleString();
  document.getElementById('sa-d-today').textContent   = todayVisits.toLocaleString();

  document.getElementById('sa-dash-clients').innerHTML = saClients.map(c => {
    const username = c.username || c.id;
    const url = `https://moonlightx.qd.je/${username}`;
    return `
    <tr>
      <td style="font-weight:700">${escapeHTML(c.displayName || c.name || username)}</td>
      <td>
        <a href="${url}" target="_blank" style="color:var(--blu);font-size:11px;font-family:monospace">${url}</a>
      </td>
      <td><span class="tag ${c.status==='disabled'?'mu':'grn'}">${escapeHTML(c.status || 'active')}</span></td>
      <td>${(c.totalViews || 0).toLocaleString()}</td>
      <td style="color:var(--grn);font-weight:700">$${Number(c.earnings || 0).toFixed(2)}</td>
      <td>
        <button class="btn btn-g btn-xs" onclick="saCopyClientUrl('${escapeHTML(username)}')">📋 Copy URL</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6"><div class="empty">No clients</div></td></tr>';
}

// ── CLIENT MANAGEMENT UI ───────────────────────────────────────────────
function saRenderClients() {
  const q = (document.getElementById('sa-q-client')?.value || '').toLowerCase();
  const list = saClients.filter(c => {
    const un = (c.username || c.id || '').toLowerCase();
    const dn = (c.displayName || c.name || '').toLowerCase();
    return !q || un.includes(q) || dn.includes(q);
  });

  const foot = document.getElementById('sa-clients-foot');
  if (foot) foot.textContent = `${list.length} of ${saClients.length} clients`;

  const tbody = document.getElementById('sa-clients-tbody');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(c => {
    const username     = c.username || c.id;
    const displayName  = c.displayName || c.name || username;
    const clientId     = c.clientId || (username + '001');
    const adsterraPSID = c.adsterraPSID || c.psid || clientId;
    const status       = c.status || (c.active !== false ? 'active' : 'disabled');
    const url          = `https://moonlightx.qd.je/${username}`;

    return `<tr>
      <td><strong style="color:var(--tx)">${escapeHTML(username)}</strong></td>
      <td style="font-weight:600">${escapeHTML(displayName)}</td>
      <td><code style="font-size:11px;background:var(--s2);padding:2px 6px;border-radius:4px">${escapeHTML(clientId)}</code></td>
      <td><code style="font-size:11px;background:var(--s2);padding:2px 6px;border-radius:4px;color:var(--ylw)">${escapeHTML(adsterraPSID)}</code></td>
      <td><span class="tag ${status==='disabled'?'mu':'grn'}">${escapeHTML(status)}</span></td>
      <td>
        <div style="font-size:11px;font-family:monospace;color:var(--blu);margin-bottom:2px">${url}</div>
        <button class="btn btn-g btn-xs" onclick="saCopyClientUrl('${escapeHTML(username)}')">📋 Copy URL</button>
      </td>
      <td>
        <div class="arow">
          <button class="btn btn-g btn-xs" onclick="saOpenEditClient('${escapeHTML(username)}')">✏️ Edit</button>
          <button class="btn ${status==='disabled'?'btn-grn':'btn-g'} btn-xs" onclick="saToggleDisableClient('${escapeHTML(username)}')">${status==='disabled'?'✅ Enable':'⏸️ Disable'}</button>
          <button class="btn btn-d btn-xs" onclick="saDeleteClient('${escapeHTML(username)}')">🗑 Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="7"><div class="empty">No clients found</div></td></tr>';
}

document.getElementById('sa-q-client')?.addEventListener('input', saRenderClients);

// Auto generate Client ID and PSID when Username is typed
document.getElementById('sa-cm-username')?.addEventListener('input', (e) => {
  const u = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  e.target.value = u;
  const preview = document.getElementById('sa-username-preview');
  if (preview) {
    preview.textContent = u ? `Generated URL: https://moonlightx.qd.je/${u}` : 'Generated URL: https://moonlightx.qd.je/—';
  }
  const cidInput  = document.getElementById('sa-cm-clientid');
  const psidInput = document.getElementById('sa-cm-psid');
  if (cidInput && (!cidInput.value || cidInput.dataset.auto === 'true')) {
    cidInput.value = u ? u + '001' : '';
    cidInput.dataset.auto = 'true';
  }
  if (psidInput && (!psidInput.value || psidInput.dataset.auto === 'true')) {
    psidInput.value = u ? u + '001' : '';
    psidInput.dataset.auto = 'true';
  }
});

function saOpenAddClient() {
  saEditId = null;
  document.getElementById('sa-cm-title').textContent = '👥 Create Client';
  document.getElementById('sa-cm-save').textContent  = '💾 Create Client';
  document.getElementById('sa-cm-username').disabled  = false;
  ['sa-cm-username','sa-cm-display-name','sa-cm-clientid','sa-cm-psid','sa-cm-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.dataset.auto = 'true'; }
  });
  document.getElementById('sa-cm-status').value = 'active';
  document.getElementById('sa-username-preview').textContent = 'Generated URL: https://moonlightx.qd.je/—';
  document.getElementById('sa-client-modal').style.display = 'flex';
}

function saOpenEditClient(username) {
  const c = saClients.find(x => x.username === username || x.id === username);
  if (!c) return;
  saEditId = username;
  document.getElementById('sa-cm-title').textContent   = '✏️ Edit Client';
  document.getElementById('sa-cm-save').textContent    = '💾 Update Client';
  const unInput = document.getElementById('sa-cm-username');
  unInput.value = c.username || username;
  unInput.disabled = true;

  document.getElementById('sa-cm-display-name').value = c.displayName || c.name || '';
  document.getElementById('sa-cm-clientid').value     = c.clientId || (username + '001');
  document.getElementById('sa-cm-psid').value         = c.adsterraPSID || c.psid || (username + '001');
  document.getElementById('sa-cm-email').value        = c.googleEmail || '';
  document.getElementById('sa-cm-status').value       = c.status || (c.active !== false ? 'active' : 'disabled');
  document.getElementById('sa-username-preview').textContent = `Generated URL: https://moonlightx.qd.je/${c.username || username}`;
  document.getElementById('sa-client-modal').style.display = 'flex';
}

document.getElementById('sa-btn-add')?.addEventListener('click', saOpenAddClient);
document.getElementById('sa-btn-add2')?.addEventListener('click', saOpenAddClient);
document.getElementById('sa-cm-cancel')?.addEventListener('click', () => document.getElementById('sa-client-modal').style.display = 'none');

document.getElementById('sa-cm-save')?.addEventListener('click', async () => {
  const username    = document.getElementById('sa-cm-username').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const displayName = document.getElementById('sa-cm-display-name').value.trim();
  const clientId    = document.getElementById('sa-cm-clientid').value.trim() || (username + '001');
  const psid        = document.getElementById('sa-cm-psid').value.trim() || (username + '001');
  const email       = document.getElementById('sa-cm-email').value.trim().toLowerCase();
  const status      = document.getElementById('sa-cm-status').value || 'active';

  if (!username)    { toast('❌ Username required!', 'err'); return; }
  if (!displayName) { toast('❌ Display Name required!', 'err'); return; }
  if (!email)       { toast('❌ Client Gmail required!', 'err'); return; }

  if (!saEditId) {
    const exists = saClients.find(c => c.username === username);
    if (exists) { toast(`❌ Username "${username}" already taken!`, 'err'); return; }
  }

  const existing = saClients.find(c => c.username === username || c.id === username);
  const clientData = {
    username,
    clientId,
    displayName,
    name: displayName,
    adsterraPSID: psid,
    psid,
    googleEmail: email,
    status,
    active: status === 'active',
    earnings: existing ? (existing.earnings || 0) : 0,
    today: existing ? (existing.today || 0) : 0,
    totalClicks: existing ? (existing.totalClicks || 0) : 0,
    totalViews: existing ? (existing.totalViews || 0) : 0,
    withdrawable: existing ? (existing.withdrawable || 0) : 0,
    createdAt: existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    siteUrl: `https://moonlightx.qd.je/${username}`
  };

  const btn = document.getElementById('sa-cm-save');
  btn.textContent = '⏳ Saving...';
  btn.disabled    = true;

  try {
    // Write directly to `clients/${username}`
    await set(ref(db, 'clients/' + username), clientData);
    await set(ref(db, 'superAdmin/clients/' + clientId), clientData).catch(() => {});

    toast(`✅ Client "${displayName}" ${saEditId ? 'updated' : 'created'}!`);
    document.getElementById('sa-client-modal').style.display = 'none';
    saAddLog(saEditId ? 'edit' : 'add', `${saEditId ? 'Updated' : 'Created'} client @${username}`);
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  } finally {
    btn.textContent = saEditId ? '💾 Update Client' : '💾 Save Client';
    btn.disabled    = false;
  }
});

async function saToggleDisableClient(username) {
  const c = saClients.find(x => x.username === username || x.id === username);
  if (!c) return;
  const currentStatus = c.status || (c.active !== false ? 'active' : 'disabled');
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

  try {
    await update(ref(db, 'clients/' + (c.username || username)), { status: newStatus, active: newStatus === 'active' });
    if (c.clientId) {
      await update(ref(db, 'superAdmin/clients/' + c.clientId), { status: newStatus, active: newStatus === 'active' }).catch(() => {});
    }
    toast(`Client ${newStatus === 'disabled' ? 'disabled' : 'enabled'}`);
    saAddLog('edit', `Toggled @${username} to ${newStatus}`);
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

async function saDeleteClient(username) {
  if (!confirm(`Are you sure you want to delete client @${username}? This action cannot be undone.`)) return;
  try {
    await remove(ref(db, 'clients/' + username));
    const c = saClients.find(x => x.username === username);
    if (c && c.clientId) {
      await remove(ref(db, 'superAdmin/clients/' + c.clientId)).catch(() => {});
    }
    toast('🗑️ Client deleted');
    saAddLog('del', `Deleted client @${username}`);
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

function saCopyClientUrl(username) {
  const url = `https://moonlightx.qd.je/${username}`;
  navigator.clipboard.writeText(url);
  toast('📋 Copied: ' + url);
}

// ══════════════════════════════════════════════════════════════════════
// ── CLIENT EARNINGS TABLE (REALTIME ONVALUE LISTENER) ─────────────────
// ══════════════════════════════════════════════════════════════════════

function saRenderEarningsTable() {
  const tbody = document.getElementById('sa-earnings-tbody');
  if (!tbody) return;

  const q = (document.getElementById('sa-q-earnings')?.value || '').toLowerCase();
  const sortVal = document.getElementById('sa-sort-earnings')?.value || 'earnings-desc';

  let list = saClients.filter(c => {
    const un = (c.username || c.id || '').toLowerCase();
    const dn = (c.displayName || c.name || '').toLowerCase();
    return !q || un.includes(q) || dn.includes(q);
  });

  list.sort((a, b) => {
    if (sortVal === 'earnings-desc') return (Number(b.earnings || 0) - Number(a.earnings || 0));
    if (sortVal === 'today-desc')    return (Number(b.today || 0) - Number(a.today || 0));
    if (sortVal === 'views-desc')    return (Number(b.totalViews || 0) - Number(a.totalViews || 0));
    if (sortVal === 'clicks-desc')   return (Number(b.totalClicks || 0) - Number(a.totalClicks || 0));
    if (sortVal === 'username-asc')  return (a.username || '').localeCompare(b.username || '');
    return 0;
  });

  tbody.innerHTML = list.length ? list.map(c => {
    const username     = c.username || c.id;
    const displayName  = c.displayName || c.name || username;
    const todayEarn    = Number(c.today || 0).toFixed(2);
    const totalEarn    = Number(c.earnings || 0).toFixed(2);
    const views        = Number(c.totalViews || 0).toLocaleString();
    const clicks       = Number(c.totalClicks || 0).toLocaleString();
    const withdrawable = Number(c.withdrawable || 0).toFixed(2);
    const lastUpdate   = c.updatedAt ? new Date(c.updatedAt).toLocaleString() : (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—');

    return `<tr>
      <td><strong style="color:var(--tx)">${escapeHTML(username)}</strong></td>
      <td style="font-weight:600">${escapeHTML(displayName)}</td>
      <td style="color:var(--ylw);font-weight:700">$${todayEarn}</td>
      <td style="color:var(--grn);font-weight:700">$${totalEarn}</td>
      <td>${views}</td>
      <td>${clicks}</td>
      <td style="color:var(--blu);font-weight:700">$${withdrawable}</td>
      <td style="font-size:11px;color:var(--mu);font-family:monospace">${escapeHTML(lastUpdate)}</td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="8"><div class="empty">No client earnings data</div></td></tr>';
}

document.getElementById('sa-q-earnings')?.addEventListener('input', saRenderEarningsTable);
document.getElementById('sa-sort-earnings')?.addEventListener('change', saRenderEarningsTable);

// ══════════════════════════════════════════════════════════════════════
// ── WITHDRAWAL SYSTEM (SUPER ADMIN) ───────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

function saRenderWithdrawalsTable() {
  const tbody = document.getElementById('sa-withdrawals-tbody');
  if (!tbody) return;

  tbody.innerHTML = saWithdrawals.length ? saWithdrawals.reverse().map(w => {
    const statusTag = w.status === 'approved' ? 'grn' : (w.status === 'rejected' ? 'red' : 'ylw');
    const reqDate   = w.requestDate ? new Date(w.requestDate).toLocaleString() : '—';

    return `<tr>
      <td><code style="font-size:11px">${escapeHTML(w.reqId)}</code></td>
      <td><strong>${escapeHTML(w.username)}</strong></td>
      <td style="color:var(--grn);font-weight:700">$${Number(w.amount || 0).toFixed(2)}</td>
      <td style="font-size:11px;color:var(--mu);font-family:monospace">${escapeHTML(reqDate)}</td>
      <td><span class="tag ${statusTag}">${escapeHTML(w.status || 'pending').toUpperCase()}</span></td>
      <td style="font-size:11px;font-family:monospace">${escapeHTML(w.transactionId || '—')}</td>
      <td>
        ${w.status === 'pending' ? `
          <div class="arow">
            <button class="btn btn-grn btn-xs" onclick="saApproveWithdrawal('${escapeHTML(w.reqId)}', '${escapeHTML(w.username)}', ${w.amount})">✓ Approve</button>
            <button class="btn btn-d btn-xs" onclick="saRejectWithdrawal('${escapeHTML(w.reqId)}')">✕ Reject</button>
          </div>
        ` : '—'}
      </td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="7"><div class="empty">No withdrawal requests</div></td></tr>';
}

async function saApproveWithdrawal(reqId, username, amount) {
  const txId = prompt('Enter Transaction ID / Reference Number:');
  if (!txId) return;

  try {
    await update(ref(db, `withdrawRequests/${reqId}`), {
      status: 'approved',
      transactionId: txId,
      processedAt: new Date().toISOString()
    });

    // Deduct withdrawable balance
    const clientSnap = await get(ref(db, `clients/${username}`));
    if (clientSnap.exists()) {
      const cur = clientSnap.val();
      const newWithdrawable = Math.max(0, Number(cur.withdrawable || 0) - Number(amount));
      await update(ref(db, `clients/${username}`), { withdrawable: newWithdrawable });
    }

    toast('✅ Withdrawal Approved');
    saAddLog('edit', `Approved withdrawal of $${amount} for @${username}`);
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

async function saRejectWithdrawal(reqId) {
  if (!confirm('Reject this withdrawal request?')) return;
  try {
    await update(ref(db, `withdrawRequests/${reqId}`), {
      status: 'rejected',
      processedAt: new Date().toISOString()
    });
    toast('Request rejected');
    saAddLog('edit', `Rejected withdrawal request ${reqId}`);
  } catch(e) {
    toast('❌ ' + e.message, 'err');
  }
}

// ══════════════════════════════════════════════════════════════════════
// ── CLIENT ADMIN DASHBOARD & WITHDRAWAL REQUESTS ──────────────────────
// ══════════════════════════════════════════════════════════════════════

function clInitDB(username) {
  if (!username) return;

  // Realtime listener for client's own node
  onValue(ref(db, `clients/${username}`), snap => {
    if (!snap.exists()) return;
    clClientData = { ...clClientData, ...snap.val() };
    const d = clClientData;

    document.getElementById('cl-db-st').textContent = 'Live';
    document.getElementById('cl-d-displayname').textContent = d.displayName || d.name || username;
    document.getElementById('cl-d-today-earn').textContent   = '$' + Number(d.today || 0).toFixed(2);
    document.getElementById('cl-d-total-earn').textContent   = '$' + Number(d.earnings || d.totalEarning || 0).toFixed(2);
    document.getElementById('cl-d-total-views').textContent  = Number(d.totalViews || 0).toLocaleString();
    document.getElementById('cl-d-total-clicks').textContent = Number(d.totalClicks || 0).toLocaleString();
    document.getElementById('cl-d-withdrawable').textContent = '$' + Number(d.withdrawable || 0).toFixed(2);

    if (document.getElementById('cl-e-total-val')) {
      document.getElementById('cl-e-total-val').textContent = '$' + Number(d.earnings || 0).toFixed(2);
    }
    if (document.getElementById('cl-e-withdrawable-val')) {
      document.getElementById('cl-e-withdrawable-val').textContent = '$' + Number(d.withdrawable || 0).toFixed(2);
    }
  });

  // Realtime listener for client's withdrawal requests
  onValue(ref(db, 'withdrawRequests'), snap => {
    if (!snap.exists()) {
      clRenderWithdrawalHistory([]);
      return;
    }
    const val = snap.val();
    const myRequests = Object.entries(val)
      .map(([id, r]) => ({ reqId: id, ...r }))
      .filter(r => r.username === username);

    clRenderWithdrawalHistory(myRequests);
  });
}

function clRenderWithdrawalHistory(requests) {
  const tbody = document.getElementById('cl-withdraw-tbody');
  if (!tbody) return;

  tbody.innerHTML = requests.length ? requests.reverse().map(r => {
    const statusTag = r.status === 'approved' ? 'grn' : (r.status === 'rejected' ? 'red' : 'ylw');
    const dateStr   = r.requestDate ? new Date(r.requestDate).toLocaleString() : '—';

    return `<tr>
      <td style="font-size:11px;font-family:monospace">${escapeHTML(dateStr)}</td>
      <td style="color:var(--grn);font-weight:700">$${Number(r.amount || 0).toFixed(2)}</td>
      <td><span class="tag ${statusTag}">${escapeHTML(r.status || 'pending').toUpperCase()}</span></td>
      <td style="font-size:11px;font-family:monospace">${escapeHTML(r.transactionId || '—')}</td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="4"><div class="empty">No withdrawal requests yet</div></td></tr>';
}

document.getElementById('cl-btn-request-withdraw')?.addEventListener('click', async () => {
  if (!clClientData) return;
  const username = clClientData.username || clClientData.id;
  const amountInput = document.getElementById('cl-withdraw-amount');
  const txInput     = document.getElementById('cl-withdraw-tx');
  const msgEl       = document.getElementById('cl-withdraw-msg');

  const amount = parseFloat(amountInput?.value);
  const txInfo = txInput?.value.trim() || '';

  if (!amount || amount <= 0) {
    if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = 'var(--red)'; msgEl.textContent = '❌ Valid amount required'; }
    return;
  }

  const withdrawable = Number(clClientData.withdrawable || 0);
  if (amount > withdrawable) {
    if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = 'var(--red)'; msgEl.textContent = `❌ Insufficient balance. Maximum withdrawable: $${withdrawable.toFixed(2)}`; }
    return;
  }

  const reqId = 'req_' + Date.now();
  const reqData = {
    username,
    amount,
    transactionId: txInfo,
    status: 'pending',
    requestDate: new Date().toISOString()
  };

  try {
    await set(ref(db, `withdrawRequests/${reqId}`), reqData);
    if (amountInput) amountInput.value = '';
    if (txInput)     txInput.value = '';
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.style.color   = 'var(--grn)';
      msgEl.textContent   = '✅ Withdrawal request submitted!';
      setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
    }
    toast('✅ Request submitted!');
  } catch(e) {
    if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = 'var(--red)'; msgEl.textContent = '❌ ' + e.message; }
  }
});

// EXPOSE WINDOW GLOBALS
window.saOpenAddClient        = saOpenAddClient;
window.saOpenEditClient       = saOpenEditClient;
window.saToggleDisableClient  = saToggleDisableClient;
window.saDeleteClient         = saDeleteClient;
window.saCopyClientUrl        = saCopyClientUrl;
window.saApproveWithdrawal    = saApproveWithdrawal;
window.saRejectWithdrawal     = saRejectWithdrawal;
