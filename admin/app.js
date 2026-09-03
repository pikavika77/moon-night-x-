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
  if (typeof val === 'object') return Object.values(val).filter(Boolean);
  return [];
}

// ── STATE ──────────────────────────────────────────────────────────────
let saClients   = [];
let clImages    = [];
let clCats      = [];
let clClientData= null;
let saEditId    = null;
let clEditImgId = null;
let clEditCatId = null;
let saActLog    = JSON.parse(localStorage.getItem('sa_log') || '[]');
let trafficSortField = 'totalVisits';
let trafficSortAsc   = false;

// ── TOAST ──────────────────────────────────────────────────────────────
function toast(msg, type='ok') {
  const t = document.getElementById('toast');
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

// ── SAVE CLIENT WITH TIMEOUT ───────────────────────────────────────────
async function saveClient(data) {
  const dbRef = ref(db, 'superAdmin/clients/' + data.id);
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("TIMEOUT_ERROR: Firebase Realtime Database write timed out. Check connection or security rules."));
    }, 6000);
  });

  try {
    await Promise.race([
      set(dbRef, data).then(res => { clearTimeout(timeoutId); return res; }),
      timeoutPromise
    ]);
    return { success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("saveClient Error details:", error);
    throw error;
  }
}

// ── ROUTER ─────────────────────────────────────────────────────────────
function getRoute() {
  const hash = window.location.hash || '#/';
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

function parseRoute(path) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length)                             return { type: 'login' };
  if (parts[0] === 'super')                      return { type: 'super' };
  if (parts[0] === 'admin' && parts[1])          return { type: 'client', username: parts[1] };
  if (parts.length === 1 && parts[0] !== 'super' && parts[0] !== 'admin')
                                                 return { type: 'site', username: parts[0] };
  return { type: 'login' };
}

function navigate(path) {
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  window.location.hash = '#' + cleanPath;
}

function getDefaultBase() {
  // moonlightx.qd.je custom domain pe hamesha /admin hoga
  const origin = window.location.origin;
  const path   = (window.location.pathname || '').replace(/\/index\.(html?|php)$/i,'').replace(/\/+$/,'');
  // Agar custom domain hai (not github.io) → origin + /admin
  if (!origin.includes('github.io')) {
    return origin + '/admin';
  }
  // github.io fallback
  return (origin + path).replace(/\/+$/,'');
}

function getDefaultPublicBase() {
  // Real site base — always custom domain root
  const origin = window.location.origin;
  const path   = (window.location.pathname || '').replace(/\/index\.(html?|php)$/i,'').replace(/\/+$/,'');
  if (!origin.includes('github.io')) {
    return origin; // https://moonlightx.qd.je
  }
  // github.io fallback: strip /admin
  return (origin + path.replace(/\/admin$/i,'')).replace(/\/+$/,'');
}

function getBase() {
  const defaultBase = getDefaultBase(); // e.g. https://moonlightx.qd.je/admin
  const stored = localStorage.getItem('mnx_base_url');
  if (stored) {
    const clean = stored.trim().replace(/\/index\.(html?|php)$/i, '').replace(/\/+$/, '');
    // Clear stale value if it's root domain but we're now at /admin/
    if (clean === window.location.origin && defaultBase !== window.location.origin) {
      localStorage.removeItem('mnx_base_url');
      localStorage.setItem('mnx_base_url', defaultBase);
      return defaultBase;
    }
    return clean;
  }
  localStorage.setItem('mnx_base_url', defaultBase);
  return defaultBase;
}

function getPublicBase() {
  const stored = localStorage.getItem('mnx_public_url');
  if (stored && stored.trim()) {
    return stored.trim().replace(/\/+$/, '');
  }
  // Auto-detect: root domain (strip /admin from current path)
  return getDefaultPublicBase();
}

function getAppFilesBase() {
  const stored = localStorage.getItem('mnx_app_files_url');
  if (stored && stored.trim()) return stored.trim().replace(/\/+$/, '');
  // Fallback to public base if set
  return getPublicBase();
}

function checkPublicUrlWarning() {
  const banner = document.getElementById('public-url-banner');
  if (banner) banner.style.display = 'none'; // auto-detect always works
}

function getClientSiteUrl(c, base) {
  if (!c) return '';
  // Always use canonical public base — never use stale stored siteUrl
  const publicBase = getDefaultPublicBase(); // https://moonlightx.qd.je
  return `${publicBase}/#/${c.username}`;
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
      console.log('Redirect sign-in success:', result.user.email);
      // Redirect flow completed - process the user
      await handleRoute(result.user);
    }
  } catch(e) {
    console.error('Redirect result error:', e.code, e.message);
    const msgs = {
      'auth/unauthorized-domain':   `❌ Add "${location.hostname}" to Firebase Console → Authentication → Settings → Authorized domains.`,
      'auth/operation-not-allowed': '❌ Enable Google sign-in in Firebase Console → Authentication → Sign-in method → Google.',
      'auth/account-exists-with-different-credential': '❌ Account exists with different method.',
    };
    const msg = msgs[e.code] || ('❌ Sign-in failed: ' + (e.code || e.message));
    setTimeout(() => {
      showErr(msg);
      resetGBtn();
    }, 500);
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
        const snap = await get(ref(db, 'superAdmin/clients'));
        allClients = snapToArray(snap);
      } catch (err) {
        console.warn("Could not read superAdmin/clients during login check:", err);
      }

      const client = allClients.find(c => c.googleEmail && c.googleEmail.toLowerCase() === email);

      if (!client) {
        await signOut(auth);
        showErr(`❌ Access denied. Account "${email}" is not registered.`);
        resetGBtn();
        document.getElementById('g-btn').style.display = 'flex';
        setupLoginUI(route);
        return;
      }
      if (client.status !== 'active') {
        await signOut(auth);
        showErr('❌ Your account is inactive. Contact admin.');
        resetGBtn();
        document.getElementById('g-btn').style.display = 'flex';
        setupLoginUI(route);
        return;
      }
      if (!user.emailVerified) {
        await signOut(auth);
        showErr('❌ Pehle apni Google email verify karo, phir login karo.');
        resetGBtn();
        document.getElementById('g-btn').style.display = 'flex';
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
    document.getElementById('sa-email').textContent    = user.email;
    document.getElementById('sa-set-email').textContent= user.email;
    saAddLog('login', `✅ Super Admin signed in: ${user.email}`);
    saInitDB();
    checkPublicUrlWarning();

  } else if (route.type === 'client') {
    const username = route.username;

    let client = null;
    try {
      const snap = await get(ref(db, 'superAdmin/clients'));
      const allClients = snapToArray(snap);
      client = allClients.find(c => c.username === username);
    } catch (err) {
      console.warn("Could not fetch superAdmin/clients snapshot:", err);
    }

    if (!client) {
      try {
        const snap = await get(ref(db, `clients/${username}/info`));
        if (snap.exists()) client = snap.val();
      } catch (err) {
        console.warn("Could not fetch client info directly:", err);
      }
    }

    if (!client) {
      if (email === OWNER) {
        client = { id: username, name: username, username, googleEmail: email, status: 'active', earningPercent: 40 };
      } else {
        await signOut(auth);
        showView('login');
        showErr(`❌ Username "${username}" not found.`);
        resetGBtn();
        document.getElementById('g-btn').style.display = 'flex';
        return;
      }
    }

    if (email !== OWNER && client.googleEmail && client.googleEmail.toLowerCase() !== email) {
      await signOut(auth);
      showView('login');
      showErr(`❌ Access denied. This panel is for ${client.googleEmail}`);
      resetGBtn();
      document.getElementById('g-btn').style.display = 'flex';
      return;
    }

    if (email !== OWNER && client.status !== 'active') {
      await signOut(auth);
      showView('login');
      showErr('❌ Your account is inactive. Contact admin.');
      resetGBtn();
      document.getElementById('g-btn').style.display = 'flex';
      return;
    }

    clClientData = client;
    showView('client');
    document.getElementById('cl-email').textContent     = user.email;
    document.getElementById('cl-site-name').textContent = client.name || 'My Gallery';
    document.title = (client.name || 'My Gallery') + ' — Admin';
    clInitDB(client.id);

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
    lw.style.alignItems     = 'center';
    lw.style.justifyContent = 'center';
  }
}

function setupLoginUI(route) {
  const badge = document.getElementById('l-badge');
  const info  = document.getElementById('l-info');
  const sub   = document.getElementById('l-sub');

  if (route.type === 'client' && route.username) {
    badge.className = 'lbadge client';
    badge.textContent = 'CLIENT ACCESS';
    sub.textContent   = 'Client Admin Panel';
    info.innerHTML    = `Sign in with your authorized Google account<br>to access panel for <strong>${escapeHTML(route.username)}</strong>`;
  } else if (route.type === 'super') {
    badge.className   = 'lbadge owner';
    badge.textContent = 'SUPER ADMIN';
    sub.textContent   = 'Owner Control Panel';
    info.innerHTML    = `Only <strong>${OWNER}</strong> can access this panel`;
  } else if (route.type === 'site' && route.username) {
    badge.className   = 'lbadge client';
    badge.textContent = 'CLIENT ACCESS';
    sub.textContent   = 'Client Panel';
    info.innerHTML    = `Sign in with your authorized Google account<br>to access <strong>${escapeHTML(route.username)}</strong>'s admin panel`;
  } else {
    badge.className   = 'lbadge owner';
    badge.textContent = 'ADMIN';
    sub.textContent   = 'Platform Admin';
    info.textContent  = 'Sign in with Google to continue';
  }
}

function showErr(msg) {
  const el = document.getElementById('l-err');
  el.innerHTML = msg;
  el.style.display = 'block';
}

// ── GOOGLE LOGIN ────────────────────────────────────────────────────────
document.getElementById('g-btn').addEventListener('click', async () => {
  const btn = document.getElementById('g-btn');
  btn.innerHTML = '⏳ Signing in with Google...';
  btn.disabled  = true;
  document.getElementById('l-err').style.display = 'none';
  try {
    await signInWithPopup(auth, gp);
  } catch(e) {
    console.warn('Popup sign-in failed/blocked:', e.code, e.message);
    if (e.code === 'auth/popup-closed-by-user') {
      resetGBtn();
      return;
    }

    try {
      btn.innerHTML = '⏳ Redirecting to Google...';
      await signInWithRedirect(auth, gp);
    } catch(err2) {
      const msgs = {
        'auth/unauthorized-domain':   `❌ Add "${location.hostname}" to Firebase → Authentication → Authorized domains.`,
        'auth/operation-not-allowed': '❌ Enable Google sign-in in Firebase Console.',
        'auth/network-request-failed':'❌ Network error. Check connection.',
      };
      showErr(msgs[err2.code] || ('❌ ' + (err2.code || err2.message)));
      resetGBtn();
    }
  }
});

async function doLogout() {
  saAddLog('login', '🚪 Signed out');
  await signOut(auth);
  window.location.hash = '#/';
}
document.getElementById('sa-btn-logout').addEventListener('click', doLogout);
document.getElementById('sa-btn-logout2').addEventListener('click', doLogout);
document.getElementById('cl-btn-logout').addEventListener('click', doLogout);
document.getElementById('cl-btn-logout2').addEventListener('click', doLogout);

// ══════════════════════════════════════════════════════════════════════
// ── SUPER ADMIN ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

function saShowPage(name) {
  document.querySelectorAll('#view-super .page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('[data-sa-page]').forEach(i => i.classList.remove('on'));
  document.getElementById('sa-page-' + name)?.classList.add('on');
  document.querySelector(`[data-sa-page="${name}"]`)?.classList.add('on');
  if(name === 'activity')     saRenderLog();
  if(name === 'revenue')      saRenderRevenue();
  if(name === 'traffic')      saRenderTraffic();
  if(name === 'settings')     saLoadSettings();
  if(name === 'site-gallery') saInitGlobalSite();
  if(name === 'site-ads')     saInitGlobalSite();
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
  document.getElementById('sa-nb-log').textContent = saActLog.length;
  saRenderLog(); saRenderDashLog();
}
function saLogHTML(e) {
  const d = new Date(e.t);
  const colors = { add:'var(--grn)', edit:'var(--blu)', del:'var(--red)', login:'var(--ylw)' };
  return `<div style="display:flex;gap:11px;padding:11px 18px;border-bottom:1px solid var(--br)">
    <div style="width:7px;height:7px;border-radius:50%;background:${colors[e.type]||'#888'};margin-top:5px;flex-shrink:0"></div>
    <div><div style="font-size:12px;font-weight:600">${escapeHTML(e.msg)}</div>
    <div style="font-size:10px;color:var(--mu);font-family:monospace;margin-top:2px">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</div></div>
  </div>`;
}
function saRenderLog() {
  const f  = document.getElementById('sa-log-filter')?.value || '';
  const el = document.getElementById('sa-log-list');
  const list = f ? saActLog.filter(e => e.type === f) : saActLog;
  el.innerHTML = list.length ? list.map(saLogHTML).join('')
    : '<div class="empty"><div class="eic">📋</div>No activity</div>';
}
function saRenderDashLog() {
  document.getElementById('sa-dash-log').innerHTML =
    saActLog.slice(0,5).map(saLogHTML).join('') ||
    '<div class="empty"><div class="eic">📋</div>No activity yet</div>';
}

// DB
function saInitDB() {
  // Auto-load public site URL from Firebase settings
  // Load saved URLs from Firebase
  get(ref(db, 'superAdmin/settings')).then(snap => {
    if (!snap.exists()) return;
    const settings = snap.val();
    if (settings.publicUrl) {
      const pubUrl = settings.publicUrl.trim().replace(/\/+$/, '');
      localStorage.setItem('mnx_public_url', pubUrl);
      const field = document.getElementById('sa-public-url');
      if (field) field.value = pubUrl;
    }
    if (settings.appFilesUrl) {
      const appUrl = settings.appFilesUrl.trim().replace(/\/+$/, '');
      localStorage.setItem('mnx_app_files_url', appUrl);
      const field = document.getElementById('sa-app-files-url');
      if (field) field.value = appUrl;
    }
    checkPublicUrlWarning();
  }).catch(() => {});

  onValue(ref(db, 'superAdmin/clients'), snap => {
    saClients = snapToArray(snap);
    document.getElementById('sa-db-st').textContent   = 'Live';
    document.getElementById('sa-nb-clients').textContent = saClients.length;
    saUpdateDash();
    saRenderClients();
    saPopulateEarnSelect();
  }, err => {
    console.error('saInitDB error:', err);
    document.getElementById('sa-db-st').textContent = 'Error';
  });
}

// ── GLOBAL SITE GALLERY & ADS ────────────────────────────────────────────
let globalImages = [], globalSiteCats = [];
let _globalSiteListening = false; // guard: prevents duplicate onValue listeners

function saInitGlobalSite() {
  // Only register Firebase realtime listeners once
  if (!_globalSiteListening) {
    _globalSiteListening = true;
    onValue(ref(db, 'globalSite/images'), snap => {
      globalImages = snapToArray(snap);
      saRenderGlobalGallery();
    });
    onValue(ref(db, 'globalSite/categories'), snap => {
      globalSiteCats = snapToArray(snap);
      saRenderGlobalCats();
      saPopulateGlobalCatSelect();
    });
  } else {
    // Re-render with already-loaded data when switching between site-gallery/site-ads
    saRenderGlobalGallery();
    saRenderGlobalCats();
    saPopulateGlobalCatSelect();
  }
  // Load ads
  get(ref(db, 'superAdmin/settings/globalAds')).then(snap => {
    if (!snap.exists()) return;
    const ads = snap.val();
    ['popunder','banner728','banner320','box300','smart'].forEach(k => {
      const el = document.getElementById('sa-gad-' + k);
      if (el) el.value = ads[k] || '';
    });
  }).catch(() => {});
  // Load site profile
  get(ref(db, 'superAdmin/settings/siteProfile')).then(snap => {
    if (!snap.exists()) return;
    const p = snap.val();
    ['name','bio','avatar'].forEach(k => {
      const el = document.getElementById('sa-sp-' + k);
      if (el) el.value = p[k] || '';
    });
  }).catch(() => {});
}

function saRenderGlobalGallery() {
  const el = document.getElementById('sa-global-img-grid');
  if (!el) return;
  el.innerHTML = globalImages.length
    ? globalImages.map(img => `
      <div style="background:var(--s1);border:1px solid var(--br);border-radius:12px;overflow:hidden">
        <img src="${escapeHTML(img.thumb||img.thumbnail||img.url||'')}" style="width:100%;height:130px;object-fit:cover;display:block" onerror="this.style.display='none'"/>
        <div style="padding:8px 10px">
          <div style="font-weight:700;font-size:11px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(img.title||img.id||'—')}</div>
          <div style="font-size:10px;color:var(--mu);margin-bottom:6px">${escapeHTML(img.category||'general')}</div>
          <button class="btn btn-d btn-xs" style="width:100%" onclick="saDelGlobalImg('${escapeHTML(img.id)}')">🗑 Delete</button>
        </div>
      </div>`).join('')
    : '<div class="empty" style="grid-column:1/-1"><div class="eic">🖼️</div>Koi image nahi — "Add Image" se add karo</div>';
  document.getElementById('sa-global-img-count').textContent = globalImages.length;
}

function saRenderGlobalCats() {
  const el = document.getElementById('sa-global-cat-list');
  if (!el) return;
  el.innerHTML = globalSiteCats.length
    ? globalSiteCats.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:var(--bg);border:1px solid var(--br);border-radius:8px;margin-bottom:6px">
        <span style="font-size:12px;font-weight:700">${escapeHTML(c.name||c.id)}</span>
        <button class="btn btn-d btn-xs" onclick="saDelGlobalCat('${escapeHTML(c.id)}')">🗑</button>
      </div>`).join('')
    : '<div style="color:var(--mu);font-size:12px">Koi category nahi</div>';
}

function saPopulateGlobalCatSelect() {
  const sel = document.getElementById('sa-gadd-cat');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="general">General</option>' +
    globalSiteCats.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name||c.id)}</option>`).join('');
  if (cur) sel.value = cur;
}

async function saAddGlobalImg() {
  const title = document.getElementById('sa-gadd-title')?.value.trim();
  const thumb = document.getElementById('sa-gadd-thumb')?.value.trim();
  const hires = document.getElementById('sa-gadd-hires')?.value.trim()||'';
  const cat   = document.getElementById('sa-gadd-cat')?.value||'general';
  const desc  = document.getElementById('sa-gadd-desc')?.value.trim()||'';
  if (!title||!thumb) { toast('⚠️ Title aur Thumbnail URL zaroori hain!','warn'); return; }
  const id = 'img-' + Date.now();
  try {
    await set(ref(db, `globalSite/images/${id}`), { id, title, thumb, thumbnail:thumb, hires:hires||thumb, url:thumb, category:cat, description:desc, createdAt:new Date().toISOString() });
    ['sa-gadd-title','sa-gadd-thumb','sa-gadd-hires','sa-gadd-desc'].forEach(k => { const e=document.getElementById(k); if(e) e.value=''; });
    document.getElementById('sa-global-add-modal').style.display='none';
    toast('✅ Image add ho gayi!');
    saAddLog('add','Global site image added: '+title);
  } catch(e) { toast('❌ '+e.message,'err'); }
}

async function saDelGlobalImg(id) {
  if (!confirm('Yeh image delete karein?')) return;
  try { await remove(ref(db, `globalSite/images/${id}`)); toast('✅ Deleted!'); } catch(e) { toast('❌ '+e.message,'err'); }
}

async function saAddGlobalCat() {
  const name = document.getElementById('sa-gcat-name')?.value.trim();
  if (!name) { toast('⚠️ Category naam daalo!','warn'); return; }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  try {
    await set(ref(db, `globalSite/categories/${id}`), { id, name, createdAt:new Date().toISOString() });
    document.getElementById('sa-gcat-name').value='';
    toast('✅ Category add ho gayi!');
  } catch(e) { toast('❌ '+e.message,'err'); }
}

async function saDelGlobalCat(id) {
  if (!confirm('Category delete karein?')) return;
  try { await remove(ref(db, `globalSite/categories/${id}`)); toast('✅ Deleted!'); } catch(e) { toast('❌ '+e.message,'err'); }
}

async function saSaveGlobalAds() {
  const ads = { popunder:'', banner728:'', banner320:'', box300:'', smart:'' };
  Object.keys(ads).forEach(k => { ads[k] = document.getElementById('sa-gad-'+k)?.value.trim()||''; });
  try {
    await set(ref(db,'superAdmin/settings/globalAds'), ads);
    toast('✅ Ads save ho gaye! Real site pe turant apply honge.');
    saAddLog('edit','Global site ads updated');
  } catch(e) { toast('❌ '+e.message,'err'); }
}

async function saSaveSiteProfile() {
  const p = { name: document.getElementById('sa-sp-name')?.value.trim()||'Moon Light X', bio: document.getElementById('sa-sp-bio')?.value.trim()||'', avatar: document.getElementById('sa-sp-avatar')?.value.trim()||'' };
  try {
    await set(ref(db,'superAdmin/settings/siteProfile'), p);
    toast('✅ Site profile save ho gaya!');
  } catch(e) { toast('❌ '+e.message,'err'); }
}

const COLORS = ['#E02424','#3b82f6','#22c55e','#f59e0b','#a855f7','#06b6d4','#ec4899','#f97316'];

function saUpdateDash() {
  const active   = saClients.filter(c => c.status === 'active').length;
  const totalRev = saClients.reduce((a,c) => a+(c.totalEarning||0), 0);
  const payout   = saClients.reduce((a,c) => a+(c.totalEarning||0)*(c.earningPercent||40)/100, 0);
  const visits   = saClients.reduce((a,c) => a+(c.totalVisits||0), 0);
  const today    = saClients.reduce((a,c) => a+(c.todayVisits||0), 0);

  document.getElementById('sa-d-clients').textContent = saClients.length;
  document.getElementById('sa-d-active').textContent  = active;
  document.getElementById('sa-d-rev').textContent     = '₹' + totalRev.toFixed(0);
  document.getElementById('sa-d-mine').textContent    = '₹' + (totalRev-payout).toFixed(0);
  document.getElementById('sa-d-traffic').textContent = visits.toLocaleString();
  document.getElementById('sa-d-today').textContent   = today.toLocaleString();

  const max = Math.max(...saClients.map(c=>c.totalEarning||0), 1);
  document.getElementById('sa-rev-chart').innerHTML = saClients.length
    ? saClients.map((c,i) => `
        <div class="bwrp">
          <div class="bval">₹${(c.totalEarning||0).toFixed(0)}</div>
          <div class="bbar" style="height:${Math.max(((c.totalEarning||0)/max)*80,3)}px;background:${COLORS[i%COLORS.length]}"></div>
          <div class="blbl">${escapeHTML((c.name||'').slice(0,8))}</div>
        </div>`).join('')
    : '<div style="color:var(--mu);font-size:12px;margin:auto">No clients yet</div>';

  const base = getBase();
  document.getElementById('sa-dash-clients').innerHTML = saClients.map(c => {
    const adminUrl = `${base}/#/admin/${c.username}`;
    const siteUrl  = getClientSiteUrl(c, base);
    return `
    <tr>
      <td style="font-weight:700">${escapeHTML(c.name||'—')}</td>
      <td>
        <div style="font-family:monospace;font-size:11px;color:var(--mu)">${escapeHTML(c.username||'—')}</div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
          <a href="${adminUrl}" target="_blank" class="tag grn" style="text-decoration:none">⚙️ Admin</a>
          <a href="${siteUrl}" target="_blank" class="tag blu" style="text-decoration:none">🌐 Site</a>
        </div>
      </td>
      <td><span class="tag ${c.status==='active'?'grn':'mu'}">${escapeHTML(c.status||'inactive')}</span></td>
      <td style="font-size:11px">${(c.totalVisits||0).toLocaleString()}</td>
      <td style="color:var(--grn);font-weight:700">₹${(c.totalEarning||0).toFixed(0)}</td>
      <td>${c.earningPercent||40}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6"><div class="empty"><div class="eic">👥</div>No clients</div></td></tr>';

  saRenderDashLog();
}

function saRenderClients() {
  const q    = (document.getElementById('sa-q-client')?.value||'').toLowerCase();
  const list = saClients.filter(c => !q || (c.name||'').toLowerCase().includes(q) || (c.username||'').toLowerCase().includes(q));
  const base = getBase();

  document.getElementById('sa-clients-foot').textContent = `${list.length} of ${saClients.length} clients`;
  document.getElementById('sa-clients-tbody').innerHTML = list.length ? list.map(c => {
    const adminUrl = `${base}/#/admin/${c.username}`;
    const siteUrl  = getClientSiteUrl(c, base);
    return `<tr>
      <td><div style="font-weight:700">${escapeHTML(c.name||'—')}</div><div style="font-size:10px;color:var(--mu);font-family:monospace">${escapeHTML(c.id)}</div></td>
      <td>
        <div style="font-size:11px;font-family:monospace;color:var(--mu);font-weight:700">${escapeHTML(c.username||'—')}</div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
          <a href="${adminUrl}" target="_blank" class="tag grn" style="text-decoration:none">⚙️ Admin Panel</a>
          <a href="${siteUrl}" target="_blank" class="tag blu" style="text-decoration:none">🌐 Real Site</a>
        </div>
      </td>
      <td style="font-size:11px">${escapeHTML(c.googleEmail||'—')}</td>
      <td><span class="tag ${c.status==='active'?'grn':'mu'}">${escapeHTML(c.status||'inactive')}</span></td>
      <td style="color:var(--red);font-weight:700">${c.earningPercent||40}%</td>
      <td style="color:var(--grn);font-weight:700">₹${(c.totalEarning||0).toFixed(0)}</td>
      <td><div class="arow">
        <button class="btn btn-grn btn-xs" data-share="${escapeHTML(c.id)}">📤 Share</button>
        <button class="btn btn-g btn-xs" data-edit="${escapeHTML(c.id)}">✏️</button>
        <button class="btn btn-d btn-xs" data-del="${escapeHTML(c.id)}" data-dname="${escapeHTML(c.name||'')}">🗑</button>
      </div></td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="7"><div class="empty"><div class="eic">👥</div>No clients</div></td></tr>';

  document.querySelectorAll('[data-share]').forEach(btn => btn.addEventListener('click', () => saShowShareModal(btn.dataset.share)));
  document.querySelectorAll('[data-edit]').forEach(btn  => btn.addEventListener('click', () => saOpenEdit(btn.dataset.edit)));
  document.querySelectorAll('[data-del]').forEach(btn   => btn.addEventListener('click', () => saDeleteClient(btn.dataset.del, btn.dataset.dname)));
}
document.getElementById('sa-q-client')?.addEventListener('input', saRenderClients);

// ── REAL SITE GENERATION ───────────────────────────────────────────────
async function generateClientSiteHTML(clientId) {
  const c = saClients.find(x => x.id === clientId) || {};
  let profile = {};
  try {
    const snap = await get(ref(db, `clients/${clientId}/info/profile`));
    if (snap.exists()) profile = snap.val();
  } catch(e) {}

  const id        = c.id || clientId;
  const name      = c.name || 'Gallery';
  const bio       = profile.bio       || c.bio       || '';
  const avatar    = profile.avatar    || c.avatar    || '';
  const instagram = profile.instagram || c.instagram || '';
  const telegram  = profile.telegram  || c.telegram  || '';

  const adPopunder  = c.adPopunder  || '';
  const adBanner728 = c.adBanner728 || '';
  const adBanner320 = c.adBanner320 || '';
  const adBox300    = c.adBox300    || '';
  const adSmart     = c.adSmart     || '';

  const esc = v => JSON.stringify(v || '');

  // app.js aur app.css repo root se load hogi (../../app.css = clients/riya/ se 2 level upar)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name.replace(/</g,'&lt;')} — Premium 18+ Gallery</title>
  <meta name="description" content="${name.replace(/"/g,'&quot;')} – premium curated 18+ adult gallery. Fast, mobile-first platform with HD photography. Adults 18+ only.">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#050505">
  <link rel="stylesheet" href="../../app.css">

  <!-- POPUNDER placeholder -->
  <div id="mlx-popunder-slot"></div>

  <script type="module">
    import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
    import { getDatabase, ref, get, update }   from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

    const FB = {
      apiKey:            "AIzaSyACW8aFQmlaoaxNtE55m8Pck6H8BRlfEbs",
      authDomain:        "moon-night-x.firebaseapp.com",
      databaseURL:       "https://moon-night-x-default-rtdb.firebaseio.com",
      projectId:         "moon-night-x",
      storageBucket:     "moon-night-x.firebasestorage.app",
      messagingSenderId: "779934381788",
      appId:             "1:779934381788:web:1426fa035171015634a619"
    };

    const fbApp = getApps().length ? getApp() : initializeApp(FB);
    const db    = getDatabase(fbApp);

    /* ── Client data hardcoded — no hash routing needed ── */
    window.__mlxImgPath    = 'clients/${id}/images';
    window.__mlxCatPath    = 'clients/${id}/categories';
    window.__mlxClientId   = ${esc(id)};
    window.__mlxClientName = ${esc(name)};

    /* ── Profile: pehle hardcoded, phir Firebase se live update ── */
    window.__mlxProfile = {
      bio:       ${esc(bio)},
      avatar:    ${esc(avatar)},
      instagram: ${esc(instagram)},
      telegram:  ${esc(telegram)},
      socialLinks: { instagram: ${esc(instagram)}, telegram: ${esc(telegram)} }
    };

    /* Live profile update from Firebase */
    try {
      const pSnap = await get(ref(db, 'clients/${id}/info/profile'));
      if (pSnap.exists()) {
        const p = pSnap.val();
        window.__mlxProfile = {
          bio:       p.bio       || ${esc(bio)},
          avatar:    p.avatar    || ${esc(avatar)},
          instagram: p.instagram || ${esc(instagram)},
          telegram:  p.telegram  || ${esc(telegram)},
          socialLinks: {
            instagram: p.instagram || ${esc(instagram)},
            telegram:  p.telegram  || ${esc(telegram)}
          }
        };
      }
    } catch(e) {}

    window.__mlxAds = {
      popunder:  ${esc(adPopunder)},
      banner728: ${esc(adBanner728)},
      banner320: ${esc(adBanner320)},
      box300:    ${esc(adBox300)},
      smart:     ${esc(adSmart)}
    };

    document.title = window.__mlxClientName + ' — Premium 18+ Gallery';

    /* ── Execute scripts injected via innerHTML ── */
    function execScriptsIn(el) {
      el.querySelectorAll('script').forEach(old => {
        const s = document.createElement('script');
        if (old.src) { s.src = old.src; s.async = true; }
        else { s.textContent = old.textContent; }
        old.parentNode.replaceChild(s, old);
      });
    }

    /* ── Inject popunder ── */
    function injectPopunder(code) {
      if (!code) return;
      const div = document.getElementById('mlx-popunder-slot');
      if (div) { div.innerHTML = code; execScriptsIn(div); }
    }

    /* ── Inject banner/box ads into React ad slots ── */
    function injectBannerAds(ads) {
      if (!ads) return;
      const SLOT_MAP = {
        'adsterra-top-leaderboard':    ads.banner728 || '',
        'adsterra-native-incontent':   ads.box300    || '',
        'adsterra-sidebar-skyscraper': ads.smart     || '',
        'adsterra-mobile-sticky':      ads.banner320 || '',
        'adsterra-bottom-footer':      ads.banner728 || ''
      };
      const injected   = new Set();
      const totalSlots = Object.values(SLOT_MAP).filter(Boolean).length;
      if (totalSlots === 0) return;
      const obs = new MutationObserver(() => {
        Object.entries(SLOT_MAP).forEach(([sid, code]) => {
          if (!code || injected.has(sid)) return;
          const el = document.getElementById(sid);
          if (el) { el.innerHTML = code; el.dataset.injected = 'true'; execScriptsIn(el); injected.add(sid); }
        });
        if (injected.size >= totalSlots) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 25000);
    }

    injectPopunder(window.__mlxAds.popunder);
    injectBannerAds(window.__mlxAds);

    /* ── Visit tracking ── */
    try {
      const today   = new Date().toISOString().slice(0, 10);
      const infoRef = ref(db, 'clients/${id}/info');
      const snap    = await get(infoRef);
      const cur     = snap.exists() ? snap.val() : {};
      const upd     = { totalVisits: (cur.totalVisits || 0) + 1 };
      if (cur.todayKey === today) { upd.todayVisits = (cur.todayVisits || 0) + 1; }
      else { upd.todayVisits = 1; upd.todayKey = today; }
      await update(infoRef, upd);
      await update(ref(db, 'superAdmin/clients/${id}'), upd).catch(() => {});
    } catch(e) { console.warn('Visit track:', e.message); }

  <\/script>
</head>
<body>
  <div id="root"></div>
  <script src="../../app.js"><\/script>
</body>
</html>`;
}

// SHARE MODAL
function saShowShareModal(clientId) {
  const c    = saClients.find(x => x.id === clientId); if(!c) return;
  const base       = getDefaultBase();       // https://moonlightx.qd.je/admin
  const publicBase = getDefaultPublicBase(); // https://moonlightx.qd.je
  const adminUrl   = `${base}/#/admin/${c.username}`;
  const siteUrl    = `${publicBase}/#/${c.username}`;

  document.getElementById('sm-name').textContent       = c.name;
  document.getElementById('sm-admin-url').textContent  = adminUrl;
  document.getElementById('sm-site-url').textContent   = siteUrl;
  document.getElementById('sm-download-site').dataset.clientId  = clientId;
  document.getElementById('sm-download-status').style.display   = 'none';
  document.getElementById('sm-deploy-github').dataset.clientId  = clientId;
  document.getElementById('sm-deploy-status').style.display     = 'none';
  const pathHint = document.getElementById('sm-path-hint');
  if (pathHint) pathHint.textContent = `clients/${c.username}/index.html`;

  // Show deployed URL if already deployed
  const depSection = document.getElementById('sm-deployed-section');
  const depUrl     = document.getElementById('sm-deployed-url');
  if (c.deployedUrl) {
    depSection.style.display = 'block';
    depUrl.textContent       = c.deployedUrl;
    document.getElementById('sm-copy-deployed').onclick = () => {
      navigator.clipboard.writeText(c.deployedUrl);
      document.getElementById('sm-copy-deployed').textContent = '✅ Copied!';
      setTimeout(() => document.getElementById('sm-copy-deployed').textContent = '📋 Copy', 2000);
    };
    document.getElementById('sm-open-deployed').onclick = () => window.open(c.deployedUrl, '_blank');
  } else {
    depSection.style.display = 'none';
  }

  document.getElementById('sm-copy-admin').onclick = () => {
    navigator.clipboard.writeText(adminUrl);
    document.getElementById('sm-copy-admin').textContent = '✅ Copied!';
    setTimeout(() => document.getElementById('sm-copy-admin').textContent = '📋 Copy', 2000);
  };
  document.getElementById('sm-open-admin').onclick = () => window.open(adminUrl, '_blank');
  document.getElementById('sm-copy-site').onclick  = () => {
    navigator.clipboard.writeText(siteUrl);
    document.getElementById('sm-copy-site').textContent = '✅ Copied!';
    setTimeout(() => document.getElementById('sm-copy-site').textContent = '📋 Copy', 2000);
  };
  document.getElementById('sm-open-site').onclick  = () => window.open(siteUrl, '_blank');

  // Public URL warning in share modal
  const smWarn = document.getElementById('sm-public-warn');
  if (smWarn) smWarn.style.display = getPublicBase() ? 'none' : 'flex';

  document.getElementById('sm-copy-both').onclick  = () => {
    const msg = `🌙 Moon Light X — Aapke Links:

📌 Ye links sirf aapke liye hain.

Hi! Ye rahe aapke Moon Light X ke 2 links:\n\n⚙️ Admin Panel (images manage karo):\n${adminUrl}\n\n🌐 Public Gallery (visitors dekhenge):\n${siteUrl}\n\nAdmin panel pe apni Gmail (${c.googleEmail}) se login karo.`;
    navigator.clipboard.writeText(msg);
    document.getElementById('sm-copy-both').textContent = '✅ Copied!';
    setTimeout(() => document.getElementById('sm-copy-both').textContent = '📋 Copy Both Links', 2000);
  };

  (async () => {
    try {
      await update(ref(db, `superAdmin/clients/${clientId}`), {
        adminUrl,
        siteUrl,
        generatedAt: new Date().toISOString()
      });
      try {
        await update(ref(db, `clients/${clientId}/info`), {
          adminUrl,
          siteUrl,
          generatedAt: new Date().toISOString()
        });
      } catch(e){}
      saAddLog('add', `Generated URLs for "${c.name}" — site: ${siteUrl}`);
    } catch (err) {
      console.error('Error saving URLs to Firebase:', err);
      toast('❌ Failed to save URLs: ' + err.message, 'err');
    }
  })();

  document.getElementById('share-modal').style.display = 'flex';
}
document.getElementById('sm-close').addEventListener('click', () => document.getElementById('share-modal').style.display = 'none');

document.getElementById('sm-deploy-github').addEventListener('click', async () => {
  const btn      = document.getElementById('sm-deploy-github');
  const status   = document.getElementById('sm-deploy-status');
  const clientId = btn.dataset.clientId;
  if (!clientId) { toast('❌ Client ID missing', 'err'); return; }

  if (!ghGetToken()) {
    status.style.display    = 'block';
    status.style.background = '#2d0a0a';
    status.style.color      = 'var(--red)';
    status.innerHTML = '❌ GitHub Token nahi hai!<br>Settings mein jaao → GitHub Auto-Deploy Settings → Token daalo → Save karo.';
    return;
  }

  btn.textContent = '⏳ Deploying...';
  btn.disabled    = true;
  status.style.display    = 'block';
  status.style.background = '#0a1020';
  status.style.color      = '#60a5fa';
  status.textContent      = '🚀 GitHub pe push ho raha hai...';

  try {
    const deployedUrl = await deployToGitHub(clientId);
    const c = saClients.find(x => x.id === clientId);
    status.style.background = '#0a1a0a';
    status.style.color      = 'var(--grn)';
    status.innerHTML = `✅ Deploy successful!<br>
      <strong>Live URL:</strong> <a href="${deployedUrl}" target="_blank"
        style="color:#4ade80;word-break:break-all">${deployedUrl}</a><br>
      <span style="color:var(--mu);font-size:10px">GitHub Pages pe 1-2 min mein live hoga.</span>`;
    // Show deployed section in modal
    const depSection = document.getElementById('sm-deployed-section');
    const depUrl     = document.getElementById('sm-deployed-url');
    if (depSection && depUrl) {
      depSection.style.display = 'block';
      depUrl.textContent       = deployedUrl;
      document.getElementById('sm-copy-deployed').onclick = () => {
        navigator.clipboard.writeText(deployedUrl);
        document.getElementById('sm-copy-deployed').textContent = '✅ Copied!';
        setTimeout(() => document.getElementById('sm-copy-deployed').textContent = '📋 Copy', 2000);
      };
      document.getElementById('sm-open-deployed').onclick = () => window.open(deployedUrl, '_blank');
    }
    toast('✅ Deployed! ' + deployedUrl);
    saAddLog('add', `Deployed "${c?.name}" to GitHub: ${deployedUrl}`);
  } catch(e) {
    status.style.background = '#2d0a0a';
    status.style.color      = 'var(--red)';
    status.textContent      = '❌ ' + e.message;
    toast('❌ ' + e.message, 'err');
  }

  btn.textContent = '🚀 Deploy to GitHub';
  btn.disabled    = false;
});

document.getElementById('sm-download-site').addEventListener('click', async () => {
  const btn    = document.getElementById('sm-download-site');
  const status = document.getElementById('sm-download-status');
  const clientId = btn.dataset.clientId;
  if (!clientId) { toast('❌ Client ID missing', 'err'); return; }

  btn.textContent = '⏳ Generating...';
  btn.disabled    = true;
  status.style.display = 'none';

  try {
    const html = await generateClientSiteHTML(clientId);
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const c    = saClients.find(x => x.id === clientId);
    const username = c?.username || clientId;
    a.href     = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    status.style.display    = 'block';
    status.style.background = '#0a1020';
    status.style.color      = '#60a5fa';
    status.style.padding    = '10px';
    status.style.borderRadius = '8px';
    status.style.lineHeight = '1.8';
    status.innerHTML = '✅ <strong>File download ho gayi!</strong><br>' +
      '⚠️ <strong>ROOT mein upload mat karna!</strong><br>' +
      'GitHub repo mein yeh folder banao aur iske andar dalo:<br>' +
      '<code style="background:#1a2a60;padding:2px 6px;border-radius:4px;color:#93c5fd">clients/' + username + '/index.html</code><br>' +
      '<span style="color:var(--mu);font-size:10px">Ya ⚡ Auto Deploy use karo — woh automatically sahi jagah daalega.</span>';
    toast('✅ File downloaded!');
  } catch(e) {
    status.style.display = 'block';
    status.style.color   = 'var(--red)';
    status.textContent   = '❌ ' + e.message;
    toast('❌ ' + e.message, 'err');
  }
  btn.textContent = '⬇️ Download index.html';
  btn.disabled    = false;
});

// CLIENT MODAL
document.getElementById('sa-cm-pct').addEventListener('input', () => {
  const v = document.getElementById('sa-cm-pct').value;
  document.getElementById('sa-pct-val').textContent  = v;
  document.getElementById('sa-keep-val').textContent = 100 - v;
});
document.getElementById('sa-cm-username').addEventListener('input', () => {
  let u = document.getElementById('sa-cm-username').value.toLowerCase().replace(/[^a-z0-9-]/g,'');
  document.getElementById('sa-cm-username').value = u;
  const base = getBase();
  document.getElementById('sa-username-preview').innerHTML =
    u ? `Admin: <span style="color:var(--grn)">${base}/#/admin/${u}</span> &nbsp;|&nbsp; Site: <span style="color:var(--blu)">${base}/#/${u}</span>`
      : 'Preview: —';
});

function saOpenAdd() {
  saEditId = null;
  document.getElementById('sa-cm-title').textContent = '👥 Add New Client';
  document.getElementById('sa-cm-save').textContent  = '💾 Save & Generate URLs';
  ['sa-cm-name','sa-cm-email','sa-cm-username','sa-cm-adsterra','sa-cm-notes','sa-cm-ad-popunder','sa-cm-ad-banner728','sa-cm-ad-banner320','sa-cm-ad-box300','sa-cm-ad-smart'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('sa-cm-pct').value = 40;
  document.getElementById('sa-pct-val').textContent  = '40';
  document.getElementById('sa-keep-val').textContent = '60';
  document.getElementById('sa-cm-status').value = 'active';
  document.getElementById('sa-username-preview').textContent = 'Preview: —';
  document.getElementById('sa-client-modal').style.display = 'flex';
}
function saOpenEdit(id) {
  const c = saClients.find(x => x.id === id); if(!c) return;
  saEditId = id;
  document.getElementById('sa-cm-title').textContent   = '✏️ Edit Client';
  document.getElementById('sa-cm-save').textContent    = '💾 Update Client';
  document.getElementById('sa-cm-name').value          = c.name||'';
  document.getElementById('sa-cm-email').value         = c.googleEmail||'';
  document.getElementById('sa-cm-username').value      = c.username||'';
  document.getElementById('sa-cm-adsterra').value      = c.adsterraSiteId||'';
  document.getElementById('sa-cm-notes').value         = c.notes||'';
  document.getElementById('sa-cm-ad-popunder').value  = c.adPopunder  ||'';
  document.getElementById('sa-cm-ad-banner728').value = c.adBanner728 ||'';
  document.getElementById('sa-cm-ad-banner320').value = c.adBanner320 ||'';
  document.getElementById('sa-cm-ad-box300').value    = c.adBox300    ||'';
  document.getElementById('sa-cm-ad-smart').value     = c.adSmart     ||'';
  document.getElementById('sa-cm-status').value        = c.status||'active';
  const pct = c.earningPercent||40;
  document.getElementById('sa-cm-pct').value           = pct;
  document.getElementById('sa-pct-val').textContent    = pct;
  document.getElementById('sa-keep-val').textContent   = 100 - pct;
  document.getElementById('sa-cm-username').dispatchEvent(new Event('input'));
  document.getElementById('sa-client-modal').style.display = 'flex';
}

document.getElementById('sa-btn-add').addEventListener('click', saOpenAdd);
document.getElementById('sa-btn-add2').addEventListener('click', saOpenAdd);
document.getElementById('sa-cm-cancel').addEventListener('click', () => document.getElementById('sa-client-modal').style.display = 'none');

document.getElementById('sa-cm-save').addEventListener('click', async () => {
  const name     = document.getElementById('sa-cm-name').value.trim();
  const email    = document.getElementById('sa-cm-email').value.trim().toLowerCase();
  const username = document.getElementById('sa-cm-username').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');

  if(!name)     { toast('❌ Name required!','err'); return; }
  if(!email)    { toast('❌ Email required!','err'); return; }
  if(!username) { toast('❌ Username required (only a-z, 0-9, - allowed)!','err'); return; }

  if(!saEditId) {
    const exists = saClients.find(c => c.username === username);
    if(exists) { toast('❌ Username "'+username+'" already taken! Choose another.','err'); return; }
  }

  try {
    checkAuth();
  } catch (authError) {
    console.error("Auth check failed:", authError);
    toast("❌ " + authError.message, "err");
    return;
  }

  const id       = saEditId || ('cl_' + username + '_' + Date.now());
  const existing = saEditId ? saClients.find(c => c.id === id) : null;
  const base     = getBase();

  const data = {
    id,
    name,
    username,
    googleEmail:    email,
    earningPercent: parseInt(document.getElementById('sa-cm-pct').value) || 40,
    status:         document.getElementById('sa-cm-status').value || 'active',
    adsterraSiteId: document.getElementById('sa-cm-adsterra').value.trim(),
    notes:          document.getElementById('sa-cm-notes').value.trim(),
    adPopunder:     document.getElementById('sa-cm-ad-popunder')?.value.trim()||'',
    adBanner728:    document.getElementById('sa-cm-ad-banner728')?.value.trim()||'',
    adBanner320:    document.getElementById('sa-cm-ad-banner320')?.value.trim()||'',
    adBox300:       document.getElementById('sa-cm-ad-box300')?.value.trim()||'',
    adSmart:        document.getElementById('sa-cm-ad-smart')?.value.trim()||'',
    createdAt:      existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
    totalEarning:   existing ? (existing.totalEarning  || 0) : 0,
    totalVisits:    existing ? (existing.totalVisits   || 0) : 0,
    todayVisits:    existing ? (existing.todayVisits   || 0) : 0,
    totalViews:     existing ? (existing.totalViews    || 0) : 0,
    adminUrl:       getDefaultBase() + '/#/admin/' + username,
    siteUrl:        getDefaultPublicBase() + '/#/' + username,
  };

  const btn = document.getElementById('sa-cm-save');
  btn.textContent = '⏳ Saving...';
  btn.disabled    = true;

  try {
    console.log('Saving client to Firebase path: superAdmin/clients/' + id);
    await saveClient(data);

    try {
      await update(ref(db, `clients/${id}/info`), data);
    } catch(syncErr) {
      console.warn("Syncing to clients/info failed:", syncErr);
    }

    console.log('✅ Client saved successfully');
    toast('✅ Client "' + name + '" ' + (saEditId ? 'updated' : 'created') + '!');
    document.getElementById('sa-client-modal').style.display = 'none';

    try {
      saAddLog(saEditId ? 'edit' : 'add',
        (saEditId ? 'Updated' : 'Created') + ' client: "' + name + '" (@' + username + ')');
    } catch(logErr) { console.warn('Log failed:', logErr); }

    if(!saEditId) {
      setTimeout(() => saShowShareModal(id), 500);
    }

  } catch(e) {
    console.error('Client save error:', e);
    let msg = e.message || 'Unknown error';
    if(e.code === 'PERMISSION_DENIED' || msg.includes('permission') || msg.includes('Permission') || msg.includes('PERMISSION_DENIED')) {
      msg = 'Firebase permission denied! Database Rules check karo.';
    } else if(msg.includes('network') || msg.includes('Network')) {
      msg = 'Network error! Internet connection check karo.';
    }
    toast('❌ ' + msg, 'err');
  } finally {
    btn.textContent = saEditId ? '💾 Update Client' : '💾 Save & Generate URLs';
    btn.disabled    = false;
  }
});

async function saDeleteClient(id, name) {
  if(!confirm(`Delete client "${name}"?`)) return;
  try {
    await remove(ref(db, `superAdmin/clients/${id}`));
    try { await remove(ref(db, `clients/${id}/info`)); } catch(e){}
    saAddLog('del', `Deleted client: "${name}"`);
    toast('🗑️ Client deleted');
  } catch(e) { toast('❌ '+e.message,'err'); }
}

// REVENUE
function saRenderRevenue() {
  const total  = saClients.reduce((a,c)=>a+(c.totalEarning||0),0);
  const payout = saClients.reduce((a,c)=>a+(c.totalEarning||0)*(c.earningPercent||40)/100,0);
  document.getElementById('sa-r-total').textContent  = '₹'+total.toFixed(0);
  document.getElementById('sa-r-mine').textContent   = '₹'+(total-payout).toFixed(0);
  document.getElementById('sa-r-payout').textContent = '₹'+payout.toFixed(0);
  document.getElementById('sa-rev-tbody').innerHTML  = saClients.map(c => {
    const t=c.totalEarning||0, p=c.earningPercent||40;
    return `<tr>
      <td style="font-weight:700">${escapeHTML(c.name)}</td>
      <td style="color:var(--grn)">₹${t.toFixed(0)}</td>
      <td>
        <input type="range" min="0" max="100" value="${p}" data-cid="${escapeHTML(c.id)}" data-tot="${t}" class="pct-sl" style="width:80px;accent-color:var(--red)"/>
        <span id="psl-${escapeHTML(c.id)}" style="font-size:11px;font-weight:700;color:var(--red);margin-left:4px">${p}%</span>
      </td>
      <td style="color:var(--ylw)" id="cget-${escapeHTML(c.id)}">₹${(t*p/100).toFixed(0)}</td>
      <td style="color:var(--blu)" id="ykeep-${escapeHTML(c.id)}">₹${(t*(100-p)/100).toFixed(0)}</td>
      <td><button class="btn btn-grn btn-xs" data-sp="${escapeHTML(c.id)}">💾</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6"><div class="empty"><div class="eic">💰</div>No clients</div></td></tr>';

  document.querySelectorAll('.pct-sl').forEach(sl => sl.addEventListener('input', () => {
    const cid = sl.dataset.cid;
    const val = parseInt(sl.value) || 0;
    const tot = parseFloat(sl.dataset.tot) || 0;
    document.getElementById('psl-'+cid).textContent = val+'%';
    document.getElementById('cget-'+cid).textContent = '₹' + (tot * val / 100).toFixed(0);
    document.getElementById('ykeep-'+cid).textContent = '₹' + (tot * (100 - val) / 100).toFixed(0);
  }));
  document.querySelectorAll('[data-sp]').forEach(btn => btn.addEventListener('click', async () => {
    const cid = btn.dataset.sp;
    const sl = document.querySelector(`.pct-sl[data-cid="${cid}"]`);
    const val = parseInt(sl.value) || 0;
    try {
      await update(ref(db,`superAdmin/clients/${cid}`),{earningPercent:val});
      try { await update(ref(db,`clients/${cid}/info`),{earningPercent:val}); } catch(e){}
      toast('✅ % updated');
    } catch(e){ toast('❌ '+e.message,'err'); }
  }));
}

function setTrafficSort(field) {
  if (trafficSortField === field) {
    trafficSortAsc = !trafficSortAsc;
  } else {
    trafficSortField = field;
    trafficSortAsc = false;
  }
  saRenderTraffic();
}

function saRenderTraffic() {
  document.getElementById('sa-t-total').textContent = saClients.reduce((a,c)=>a+(c.totalVisits||0),0).toLocaleString();
  document.getElementById('sa-t-today').textContent = saClients.reduce((a,c)=>a+(c.todayVisits||0),0).toLocaleString();
  document.getElementById('sa-t-views').textContent = saClients.reduce((a,c)=>a+(c.totalViews||0),0).toLocaleString();

  const sortedClients = [...saClients].sort((a, b) => {
    let valA = a[trafficSortField];
    let valB = b[trafficSortField];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    if (valA < valB) return trafficSortAsc ? -1 : 1;
    if (valA > valB) return trafficSortAsc ? 1 : -1;
    return 0;
  });

  const headers = [
    { label: 'Client', field: 'name' },
    { label: 'Site URL', field: 'siteUrl' },
    { label: 'Today', field: 'todayVisits' },
    { label: 'Total Visits', field: 'totalVisits' },
    { label: 'Views', field: 'totalViews' },
    { label: 'Status', field: 'status' }
  ];

  const theadHTML = `<tr>${headers.map(h => {
    const isSorted = trafficSortField === h.field;
    const arrow = isSorted ? (trafficSortAsc ? ' ▲' : ' ▼') : '';
    return `<th style="cursor:pointer;user-select:none" id="th-traffic-${h.field}">${h.label}${arrow}</th>`;
  }).join('')}</tr>`;

  const tbodyHTML = sortedClients.map(c=>`
    <tr>
      <td style="font-weight:700">${escapeHTML(c.name)}</td>
      <td><a href="${c.siteUrl||'#'}" target="_blank" style="color:var(--blu);font-size:11px">${escapeHTML(c.siteUrl||'—')}</a></td>
      <td style="color:var(--ylw);font-weight:700">${(c.todayVisits||0).toLocaleString()}</td>
      <td style="color:var(--grn);font-weight:700">${(c.totalVisits||0).toLocaleString()}</td>
      <td>${(c.totalViews||0).toLocaleString()}</td>
      <td><span class="tag ${c.status==='active'?'grn':'mu'}">${escapeHTML(c.status)}</span></td>
    </tr>`).join('') || '<tr><td colspan="6"><div class="empty"><div class="eic">📈</div>No data</div></td></tr>';

  const tableContainer = document.getElementById('sa-traffic-tbody').parentElement;
  tableContainer.querySelector('thead').innerHTML = theadHTML;
  document.getElementById('sa-traffic-tbody').innerHTML = tbodyHTML;

  headers.forEach(h => {
    document.getElementById(`th-traffic-${h.field}`)?.addEventListener('click', () => setTrafficSort(h.field));
  });
}

// EARN ADD
function saPopulateEarnSelect() {
  const sel = document.getElementById('sa-earn-client');
  if(!sel) return;
  sel.innerHTML = '<option value="">Choose client...</option>';
  saClients.forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
}
document.getElementById('sa-btn-earn').addEventListener('click', async () => {
  const cid    = document.getElementById('sa-earn-client').value;
  const amount = parseFloat(document.getElementById('sa-earn-amount').value);
  const note   = document.getElementById('sa-earn-note').value.trim();
  if(!cid||!amount) { toast('Select client and amount','inf'); return; }
  const c = saClients.find(x=>x.id===cid);
  const newEarn = (c?.totalEarning||0)+amount;
  const earnItem = {amount,note,t:new Date().toISOString()};
  const earnKey = `earn_${Date.now()}`;
  try {
    await update(ref(db,`superAdmin/clients/${cid}`),{totalEarning:newEarn});
    await set(ref(db,`superAdmin/clients/${cid}/earningHistory/${earnKey}`),earnItem);
    try {
      await update(ref(db,`clients/${cid}/info`),{totalEarning:newEarn});
      await set(ref(db,`clients/${cid}/earningHistory/${earnKey}`),earnItem);
    } catch(e){}
    saAddLog('add',`Added ₹${amount} to "${c?.name}"`);
    toast(`✅ ₹${amount} added`);
    document.getElementById('sa-earn-amount').value='';
    document.getElementById('sa-earn-note').value='';
  } catch(e){ toast('❌ '+e.message,'err'); }
});

// ── GITHUB DEPLOY ─────────────────────────────────────────────────────

function ghGetToken()  { return localStorage.getItem('mnx_gh_token')  || ''; }
function ghGetRepo()   { return localStorage.getItem('mnx_gh_repo')   || 'pikavika77/moonlightx'; }
function ghGetBranch() { return localStorage.getItem('mnx_gh_branch') || 'main'; }

async function deployToGitHub(clientId) {
  const token  = ghGetToken();
  const repo   = ghGetRepo();
  const branch = ghGetBranch();

  if (!token) throw new Error('GitHub Token nahi hai! Settings mein pehle token daalo.');
  if (!repo)  throw new Error('GitHub Repo nahi hai! Settings mein repo daalo (e.g. pikavika77/moonlightx).');

  const c = saClients.find(x => x.id === clientId);
  if (!c) throw new Error('Client nahi mila!');

  // Generate HTML
  const html = await generateClientSiteHTML(clientId);
  const path = `clients/${c.username}/index.html`;

  // Check if file already exists (to get SHA for update)
  const apiBase = `https://api.github.com/repos/${repo}/contents/${path}`;
  let sha = null;
  try {
    const existing = await fetch(`${apiBase}?ref=${branch}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch(e) {}

  // Base64 encode the HTML
  const content = btoa(unescape(encodeURIComponent(html)));

  // Push to GitHub
  const body = {
    message: `Deploy: ${c.name} (@${c.username}) — ${new Date().toISOString()}`,
    content,
    branch
  };
  if (sha) body.sha = sha; // needed for update

  const res = await fetch(apiBase, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }

  // Save deployed URL to Firebase
  const publicBase = getPublicBase();
  const deployedUrl = `${publicBase}/clients/${c.username}/`;
  try {
    await update(ref(db, `superAdmin/clients/${clientId}`), { deployedUrl, deployedAt: new Date().toISOString() });
    await update(ref(db, `clients/${clientId}/info`), { deployedUrl, deployedAt: new Date().toISOString() });
  } catch(e) {}

  return deployedUrl;
}

// SETTINGS
function saLoadSettings() {
  const base       = getDefaultBase();       // https://moonlightx.qd.je/admin
  const publicBase = getDefaultPublicBase(); // https://moonlightx.qd.je

  // Auto-save correct values to localStorage (override any stale github.io values)
  localStorage.setItem('mnx_base_url',    base);
  localStorage.setItem('mnx_public_url',  publicBase);

  const baseEl   = document.getElementById('sa-base-url');
  const publicEl = document.getElementById('sa-public-url');
  if (baseEl)   { baseEl.value   = base;       baseEl.readOnly   = true; baseEl.style.opacity   = '0.7'; baseEl.style.cursor = 'default'; }
  if (publicEl) { publicEl.value = publicBase; publicEl.readOnly = true; publicEl.style.opacity = '0.7'; publicEl.style.cursor = 'default'; }

  document.getElementById('sa-url-preview').textContent  = base + '/#/admin/username';
  document.getElementById('sa-site-preview').textContent = publicBase + '/#/username';

  // Load GitHub settings
  const ghT = document.getElementById('sa-gh-token');
  const ghR = document.getElementById('sa-gh-repo');
  const ghB = document.getElementById('sa-gh-branch');
  if (ghT) ghT.value = ghGetToken();
  if (ghR) ghR.value = ghGetRepo()  || 'pikavika77/moonlightx';
  if (ghB) ghB.value = ghGetBranch() || 'main';

  checkPublicUrlWarning();
}
document.getElementById('sa-base-url').addEventListener('input', () => {
  const v = document.getElementById('sa-base-url').value.trim().replace(/\/+$/, '');
  document.getElementById('sa-url-preview').textContent  = (v || getBase()) + '/#/admin/username';
  document.getElementById('sa-site-preview').textContent = getPublicBase() + '/#/username';
});
document.getElementById('sa-save-base').addEventListener('click', () => {
  let url = document.getElementById('sa-base-url').value.trim().replace(/\/index\.(html?|php)$/i, '').replace(/\/+$/, '');
  if (!url) url = getDefaultBase();
  localStorage.setItem('mnx_base_url', url);
  document.getElementById('sa-base-url').value = url;

  // Save public site URL
  const pubUrl = (document.getElementById('sa-public-url')?.value||'').trim().replace(/\/index\.(html?|php)$/i,'').replace(/\/+$/,'');
  if (pubUrl) {
    localStorage.setItem('mnx_public_url', pubUrl);
    set(ref(db,'superAdmin/settings/publicUrl'), pubUrl).catch(console.warn);
    set(ref(db,'superAdmin/settings/adminUrl'), url).catch(console.warn);
  }

  checkPublicUrlWarning();
  toast('✅ URLs save ho gaye!');
  saAddLog('edit','URLs — Admin: '+url+' | Public: '+(pubUrl||'auto-detect'));
});

// GITHUB SETTINGS SAVE
document.getElementById('sa-save-gh')?.addEventListener('click', () => {
  const token  = document.getElementById('sa-gh-token')?.value.trim();
  const repo   = document.getElementById('sa-gh-repo')?.value.trim();
  const branch = document.getElementById('sa-gh-branch')?.value.trim() || 'main';
  const status = document.getElementById('sa-gh-status');

  if (!token || !repo) {
    status.style.display = 'block';
    status.style.color   = 'var(--red)';
    status.textContent   = '❌ Token aur Repo dono zaroori hain!';
    return;
  }

  localStorage.setItem('mnx_gh_token',  token);
  localStorage.setItem('mnx_gh_repo',   repo);
  localStorage.setItem('mnx_gh_branch', branch);

  status.style.display = 'block';
  status.style.color   = 'var(--grn)';
  status.textContent   = `✅ Saved! Repo: ${repo} | Branch: ${branch}`;
  toast('✅ GitHub settings save ho gaye!');
  setTimeout(() => { status.style.display = 'none'; }, 4000);
});

// ACTIVITY CONTROLS
document.getElementById('sa-log-filter').addEventListener('change', saRenderLog);
document.getElementById('sa-btn-clr-log').addEventListener('click', () => {
  if(!confirm('Clear all logs?')) return;
  saActLog=[]; localStorage.setItem('sa_log','[]');
  document.getElementById('sa-nb-log').textContent='0';
  saRenderLog(); saRenderDashLog();
  toast('Log cleared');
});

// ══════════════════════════════════════════════════════════════════════
// ── CLIENT ADMIN ───────────────────────────────────════════════════════
// ══════════════════════════════════════════════════════════════════════

function clShowPage(name) {
  document.querySelectorAll('#view-client .page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('[data-cl-page]').forEach(i => i.classList.remove('on'));
  document.getElementById('cl-page-'+name)?.classList.add('on');
  document.querySelector(`[data-cl-page="${name}"]`)?.classList.add('on');
  if(name==='earning') clRenderEarning();
  if(name==='profile')  clLoadProfile();
}
document.querySelectorAll('[data-cl-page]').forEach(el => el.addEventListener('click', () => clShowPage(el.dataset.clPage)));
document.querySelectorAll('[data-cl-goto]').forEach(el  => el.addEventListener('click', () => clShowPage(el.dataset.clGoto)));
document.getElementById('cl-p-save')?.addEventListener('click', clSaveProfile);
document.getElementById('cl-p-reset')?.addEventListener('click', clResetProfile);

function clInitDB(clientId) {
  if (!clientId) return;

  onValue(ref(db,`clients/${clientId}/images`), snap => {
    clImages = snapToArray(snap);
    document.getElementById('cl-db-st').textContent  = 'Live';
    document.getElementById('cl-nb-img').textContent = clImages.length;
    document.getElementById('cl-d-images').textContent = clImages.length;
    clRenderTable(); clRenderDashImgs(); clPopulateCatFilter();
  }, err => {
    console.error('clInitDB images error:', err);
    document.getElementById('cl-db-st').textContent = 'Error';
  });

  onValue(ref(db,`clients/${clientId}/categories`), snap => {
    clCats = snapToArray(snap);
    document.getElementById('cl-nb-cat').textContent = clCats.length;
    clRenderCatTable(); clPopulateCatDropdowns();
  }, err => {
    console.error('clInitDB categories error:', err);
  });

  const handleClientDataSnap = snap => {
    if(!snap.exists()) return;
    clClientData = { ...clClientData, ...snap.val() };
    const d=clClientData, pct=d.earningPercent||40, earn=(d.totalEarning||0)*pct/100;
    document.getElementById('cl-d-visits').textContent = (d.totalVisits||0).toLocaleString();
    document.getElementById('cl-d-today').textContent  = (d.todayVisits||0).toLocaleString();
    document.getElementById('cl-d-earn').textContent   = '₹'+earn.toFixed(0);
    document.getElementById('cl-d-pct').textContent    = pct+'%';
    document.getElementById('cl-e-total').textContent  = '₹'+earn.toFixed(0);
    document.getElementById('cl-e-pct').textContent    = pct+'%';
    const month = (d.thisMonthEarning||0)*pct/100;
    document.getElementById('cl-d-month').textContent  = '₹'+month.toFixed(0);
    const pctBar = Math.min((earn/1000)*100,100);
    document.getElementById('cl-earn-fill').style.width   = pctBar+'%';
    document.getElementById('cl-earn-pct-lbl').textContent= pctBar.toFixed(0)+'%';
    clLoadProfile();
    clLoadProfile();
  };

  onValue(ref(db,`superAdmin/clients/${clientId}`), handleClientDataSnap, err => {
    console.warn('clInitDB superAdmin client listener warning:', err);
  });

  onValue(ref(db,`clients/${clientId}/info`), handleClientDataSnap, err => {
    console.warn('clInitDB clients info listener warning:', err);
  });
}

// ── PROFILE / SOCIAL LINKS ─────────────────────────────────────────────

function clLoadProfile() {
  if (!clClientData) return;
  const p = clClientData.profile || {};
  document.getElementById('cl-p-name').value      = clClientData.name  || p.name      || '';
  document.getElementById('cl-p-bio').value       = p.bio       || '';
  document.getElementById('cl-p-avatar').value    = p.avatar    || '';
  document.getElementById('cl-p-instagram').value = p.instagram || '';
  document.getElementById('cl-p-telegram').value  = p.telegram  || '';
}

async function clSaveProfile() {
  const btn = document.getElementById('cl-p-save');
  const msg = document.getElementById('cl-p-msg');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const profile = {
      bio:       document.getElementById('cl-p-bio').value.trim(),
      avatar:    document.getElementById('cl-p-avatar').value.trim(),
      instagram: document.getElementById('cl-p-instagram').value.trim(),
      telegram:  document.getElementById('cl-p-telegram').value.trim(),
    };
    await set(ref(db, `clients/${clClientData?.id}/info/profile`), profile);
    msg.style.display = 'block';
    msg.style.color   = 'var(--grn)';
    msg.textContent   = '✅ Profile saved! Visitors ko abhi dikhega.';
    setTimeout(() => { msg.style.display = 'none'; }, 4000);
  } catch(e) {
    msg.style.display = 'block';
    msg.style.color   = 'var(--red)';
    msg.textContent   = '❌ Save failed: ' + e.message;
  }
  btn.disabled = false;
  btn.textContent = '💾 Save Profile';
}

function clResetProfile() {
  clLoadProfile();
  const msg = document.getElementById('cl-p-msg');
  msg.style.display = 'block';
  msg.style.color   = 'var(--mu)';
  msg.textContent   = 'Reset ho gaya.';
  setTimeout(() => { msg.style.display = 'none'; }, 2000);
}


function clRenderDashImgs() {
  document.getElementById('cl-dash-imgs').innerHTML = clImages.slice(0,12).map(img=>`
    <div style="cursor:pointer" data-edit-img="${escapeHTML(img.id)}" title="${escapeHTML(img.title||'')}">
      <img src="${escapeHTML(img.thumbnailUrl||'')}" onerror="this.src=''" alt=""
        style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:7px;border:1px solid var(--br)"/>
    </div>`).join('') || '<div style="color:var(--mu);font-size:12px">No images yet</div>';
  document.querySelectorAll('[data-edit-img]').forEach(el => el.addEventListener('click', () => clOpenEditImg(el.dataset.editImg)));
}

function clPopulateCatFilter() {
  const sel = document.getElementById('cl-f-cat');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>';
  [...new Set(clImages.map(i=>i.category).filter(Boolean))].sort().forEach(c => {
    const o=document.createElement('option'); o.value=c; o.textContent=c; if(c===cur) o.selected=true; sel.appendChild(o);
  });
}

function clRenderTable() {
  const q    = (document.getElementById('cl-q-img')?.value||'').toLowerCase();
  const fcat = document.getElementById('cl-f-cat')?.value||'';
  const list = clImages.filter(img => {
    const mq = !q||[img.title,img.id,img.modelName].some(s=>(s||'').toLowerCase().includes(q));
    return mq && (!fcat||img.category===fcat);
  });
  document.getElementById('cl-img-foot').textContent = `${list.length} of ${clImages.length} images`;
  document.getElementById('cl-img-tbody').innerHTML = list.length ? list.map(img=>`
    <tr>
      <td><img class="thumb" src="${escapeHTML(img.thumbnailUrl||'')}" onerror="this.src=''" alt=""/></td>
      <td><div style="font-weight:700;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(img.title||'—')}</div>
          <div style="font-size:10px;color:var(--mu);font-family:monospace">${escapeHTML(img.id)}</div></td>
      <td><span class="tag cat">${escapeHTML(img.category||'—')}</span></td>
      <td>
        ${img.isFeatured?'<span class="tag ft">⭐</span>':''}
        ${img.isTrending?'<span class="tag grn">🔥</span>':''}
        ${img.isNew?'<span class="tag ylw">✨</span>':''}
      </td>
      <td><div style="font-size:10px;color:var(--mu)">👁 ${(img.views||0).toLocaleString()}</div>
          <div style="font-size:10px;color:var(--mu)">❤️ ${(img.likes||0).toLocaleString()}</div></td>
      <td><div class="arow">
        <button class="btn btn-g btn-xs" data-edit-img="${escapeHTML(img.id)}">✏️</button>
        <button class="btn btn-d btn-xs" data-del-img="${escapeHTML(img.id)}" data-dtitle="${escapeHTML(img.title||'')}">🗑</button>
      </div></td>
    </tr>`).join('')
  : '<tr><td colspan="6"><div class="empty"><div class="eic">🖼️</div>No images found</div></td></tr>';
  document.querySelectorAll('[data-edit-img]').forEach(btn => btn.addEventListener('click', () => clOpenEditImg(btn.dataset.editImg)));
  document.querySelectorAll('[data-del-img]').forEach(btn  => btn.addEventListener('click', () => clDeleteImg(btn.dataset.delImg, btn.dataset.dtitle)));
}
['cl-q-img','cl-f-cat'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', clRenderTable);
  document.getElementById(id)?.addEventListener('change', clRenderTable);
});

// IMAGE MODAL
function clPopulateCatDropdowns() {
  const sel=document.getElementById('cl-m-cat');
  if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="general">General</option>';
  clCats.forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; if(c.id===cur) o.selected=true; sel.appendChild(o); });
}

function clClearImgForm() {
  ['cl-m-id','cl-m-slug','cl-m-title','cl-m-desc','cl-m-thumb','cl-m-hires','cl-m-gallery','cl-m-model','cl-m-res','cl-m-size','cl-m-tags','cl-m-up'].forEach(id=>document.getElementById(id).value='');
  ['cl-m-views','cl-m-likes'].forEach(id=>document.getElementById(id).value='0');
  ['cl-m-ft','cl-m-tr','cl-m-pp','cl-m-nw'].forEach(id=>document.getElementById(id).checked=false);
  document.getElementById('cl-m-aspect').value='portrait';
  document.getElementById('cl-m-fmt').value='WebP';
  document.getElementById('cl-p-thumb').style.display='none';
  document.getElementById('cl-p-hires').style.display='none';
}

function clOpenAddImg() {
  clEditImgId=null;
  document.getElementById('cl-im-title').textContent='➕ Add Image';
  document.getElementById('cl-im-save').textContent='💾 Save Image';
  clClearImgForm();
  clPopulateCatDropdowns();
  document.getElementById('cl-m-id').disabled=false;
  document.getElementById('cl-img-modal').style.display='flex';
}
function clOpenEditImg(id) {
  const img=clImages.find(i=>i.id===id); if(!img) return;
  clEditImgId=id;
  document.getElementById('cl-im-title').textContent='✏️ Edit Image';
  document.getElementById('cl-im-save').textContent='💾 Update';
  clPopulateCatDropdowns();
  document.getElementById('cl-m-id').value=img.id||''; document.getElementById('cl-m-id').disabled=true;
  document.getElementById('cl-m-slug').value=img.slug||'';
  document.getElementById('cl-m-title').value=img.title||'';
  document.getElementById('cl-m-desc').value=img.description||'';
  document.getElementById('cl-m-cat').value=img.category||'general';
  document.getElementById('cl-m-aspect').value=img.aspectRatio||'portrait';
  document.getElementById('cl-m-thumb').value=img.thumbnailUrl||'';
  document.getElementById('cl-m-hires').value=img.highResUrl||'';
  document.getElementById('cl-m-gallery').value=(img.galleryImages||[]).join('\n');
  document.getElementById('cl-m-model').value=img.modelName||'';
  document.getElementById('cl-m-res').value=img.resolution||'';
  document.getElementById('cl-m-fmt').value=img.format||'WebP';
  document.getElementById('cl-m-size').value=img.fileSize||'';
  document.getElementById('cl-m-views').value=img.views||0;
  document.getElementById('cl-m-likes').value=img.likes||0;
  document.getElementById('cl-m-up').value=img.uploadedAt||'';
  document.getElementById('cl-m-tags').value=(img.tags||[]).join(', ');
  document.getElementById('cl-m-ft').checked=!!img.isFeatured;
  document.getElementById('cl-m-tr').checked=!!img.isTrending;
  document.getElementById('cl-m-pp').checked=!!img.isPopular;
  document.getElementById('cl-m-nw').checked=!!img.isNew;
  clPrevImg('cl-m-thumb','cl-p-thumb'); clPrevImg('cl-m-hires','cl-p-hires');
  document.getElementById('cl-img-modal').style.display='flex';
}

document.getElementById('cl-btn-add-img').addEventListener('click', clOpenAddImg);
document.getElementById('cl-btn-add-img-page').addEventListener('click', clOpenAddImg);
document.getElementById('cl-im-cancel').addEventListener('click', ()=>document.getElementById('cl-img-modal').style.display='none');
['cl-m-thumb','cl-m-hires'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{ clPrevImg('cl-m-thumb','cl-p-thumb'); clPrevImg('cl-m-hires','cl-p-hires'); }));

document.getElementById('cl-im-save').addEventListener('click', async ()=>{
  const clientId = clClientData?.id; if(!clientId) return;
  const id=document.getElementById('cl-m-id').value.trim(), title=document.getElementById('cl-m-title').value.trim();
  const thumb=document.getElementById('cl-m-thumb').value.trim(), hires=document.getElementById('cl-m-hires').value.trim();
  const slug=document.getElementById('cl-m-slug').value.trim();
  if(!id||!title||!thumb||!hires||!slug){toast('❌ ID, Slug, Title, Thumb & HiRes required!','err');return;}
  const data={
    id,slug,title,description:document.getElementById('cl-m-desc').value.trim(),
    category:document.getElementById('cl-m-cat').value,aspectRatio:document.getElementById('cl-m-aspect').value,
    thumbnailUrl:thumb,highResUrl:hires,
    galleryImages:document.getElementById('cl-m-gallery').value.trim().split('\n').map(s=>s.trim()).filter(Boolean),
    modelName:document.getElementById('cl-m-model').value.trim(),resolution:document.getElementById('cl-m-res').value.trim(),
    format:document.getElementById('cl-m-fmt').value,fileSize:document.getElementById('cl-m-size').value.trim(),
    views:parseInt(document.getElementById('cl-m-views').value)||0,likes:parseInt(document.getElementById('cl-m-likes').value)||0,
    uploadedAt:document.getElementById('cl-m-up').value.trim()||'Just now',
    tags:document.getElementById('cl-m-tags').value.split(',').map(s=>s.trim()).filter(Boolean),
    isFeatured:document.getElementById('cl-m-ft').checked,isTrending:document.getElementById('cl-m-tr').checked,
    isPopular:document.getElementById('cl-m-pp').checked,isNew:document.getElementById('cl-m-nw').checked,
    width:0,height:0,
  };
  const btn=document.getElementById('cl-im-save'); btn.textContent='⏳...'; btn.disabled=true;
  try{
    await set(ref(db,`clients/${clientId}/images/${id}`),data);
    toast(`✅ Image ${clEditImgId?'updated':'saved'}!`);
    document.getElementById('cl-img-modal').style.display='none';
  }catch(e){toast('❌ '+e.message,'err');}
  finally{btn.textContent='💾 Save Image';btn.disabled=false;}
});

async function clDeleteImg(id,title){
  if(!confirm(`Delete "${title}"?`)) return;
  try{ await remove(ref(db,`clients/${clClientData?.id}/images/${id}`)); toast('🗑️ Deleted'); }
  catch(e){ toast('❌ '+e.message,'err'); }
}

function clPrevImg(inId,prevId){
  const url=document.getElementById(inId)?.value.trim(), img=document.getElementById(prevId);
  if(!img) return;
  if(url){img.src=url;img.style.display='block';img.onerror=()=>img.style.display='none';}
  else img.style.display='none';
}

// CATEGORIES
function clRenderCatTable(){
  document.getElementById('cl-cat-tbody').innerHTML = clCats.length ? clCats.map(cat=>{
    const cnt=clImages.filter(i=>i.category===cat.id).length;
    return `<tr>
      <td><code style="font-size:11px;background:var(--s2);padding:2px 6px;border-radius:4px">${escapeHTML(cat.id)}</code></td>
      <td style="font-weight:700">${escapeHTML(cat.name)}</td>
      <td><span class="tag cat">${cnt}</span></td>
      <td><div class="arow">
        <button class="btn btn-g btn-xs" data-ecat="${escapeHTML(cat.id)}">✏️</button>
        <button class="btn btn-d btn-xs" data-dcat="${escapeHTML(cat.id)}" data-dcname="${escapeHTML(cat.name)}">🗑</button>
      </div></td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="4"><div class="empty"><div class="eic">📂</div>No categories</div></td></tr>';
  document.querySelectorAll('[data-ecat]').forEach(btn=>btn.addEventListener('click',()=>clOpenEditCat(btn.dataset.ecat)));
  document.querySelectorAll('[data-dcat]').forEach(btn=>btn.addEventListener('click',()=>clDeleteCat(btn.dataset.dcat,btn.dataset.dcname)));
}

function clOpenAddCat(){
  clEditCatId=null;
  document.getElementById('cl-cm-title').textContent='📂 Add Category';
  document.getElementById('cl-cm-save').textContent='💾 Save';
  ['cl-c-id','cl-c-name','cl-c-desc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('cl-c-id').disabled=false;
  document.getElementById('cl-cat-modal').style.display='flex';
}
function clOpenEditCat(id){
  const cat=clCats.find(c=>c.id===id); if(!cat) return;
  clEditCatId=id;
  document.getElementById('cl-cm-title').textContent='✏️ Edit Category';
  document.getElementById('cl-cm-save').textContent='💾 Update';
  document.getElementById('cl-c-id').value=cat.id; document.getElementById('cl-c-id').disabled=true;
  document.getElementById('cl-c-name').value=cat.name||'';
  document.getElementById('cl-c-desc').value=cat.description||'';
  document.getElementById('cl-cat-modal').style.display='flex';
}
document.getElementById('cl-btn-add-cat').addEventListener('click',clOpenAddCat);
document.getElementById('cl-cm-cancel').addEventListener('click',()=>document.getElementById('cl-cat-modal').style.display='none');
document.getElementById('cl-cm-save').addEventListener('click',async()=>{
  const clientId=clClientData?.id; if(!clientId) return;
  const id=document.getElementById('cl-c-id').value.trim().toLowerCase().replace(/\s+/g,'-');
  const name=document.getElementById('cl-c-name').value.trim();
  if(!id||!name){toast('❌ ID and Name required!','err');return;}
  const data={id,name,description:document.getElementById('cl-c-desc').value.trim(),iconName:'Grid',slug:id,tags:[],count:0};
  const btn=document.getElementById('cl-cm-save'); btn.textContent='⏳...'; btn.disabled=true;
  try{
    await set(ref(db,`clients/${clientId}/categories/${id}`),data);
    toast(`✅ Category "${name}" saved!`);
    document.getElementById('cl-cat-modal').style.display='none';
  }catch(e){toast('❌ '+e.message,'err');}
  finally{btn.textContent='💾 Save';btn.disabled=false;}
});
async function clDeleteCat(id,name){
  if(!confirm(`Delete "${name}"?`)) return;
  try{ await remove(ref(db,`clients/${clClientData?.id}/categories/${id}`)); toast('🗑️ Category deleted'); }
  catch(e){ toast('❌ '+e.message,'err'); }
}

// EARNING
function clRenderEarning(){
  if(!clClientData) return;
  const pct=clClientData.earningPercent||40;
  const hist=clClientData.earningHistory||{};
  document.getElementById('cl-earn-tbody').innerHTML = Object.values(hist).reverse().map(r=>`
    <tr>
      <td style="font-size:11px;font-family:monospace">${new Date(r.t).toLocaleDateString()}</td>
      <td style="color:var(--grn)">₹${(r.amount||0).toFixed(0)}</td>
      <td style="color:var(--blu);font-weight:700">₹${((r.amount||0)*pct/100).toFixed(0)}</td>
      <td style="font-size:11px;color:var(--mu)">${escapeHTML(r.note||'—')}</td>
    </tr>`).join('')
  || '<tr><td colspan="4"><div class="empty"><div class="eic">💰</div>No earning history yet</div></td></tr>';
}

// ── INIT ───────────────────────────────────────────────────────────────
document.getElementById('sa-nb-log').textContent = saActLog.length;
saRenderLog();

getBase();
