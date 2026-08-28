import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, ref, onValue, set, remove, update, get } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const FB_CONFIG = {
  apiKey: "AIzaSyACW8aFQmlaoaxNtE55m8Pck6H8BRlfEbs",
  authDomain: "moon-night-x.firebaseapp.com",
  databaseURL: "https://moon-night-x-default-rtdb.firebaseio.com",
  projectId: "moon-night-x",
  storageBucket: "moon-night-x.firebasestorage.app",
  messagingSenderId: "779934381788",
  appId: "1:779934381788:web:1426fa035171015634a619"
};
const OWNER_EMAIL = "aryakaran836@gmail.com";

const app = initializeApp(FB_CONFIG);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let isSuperAdmin = false;
let currentClient = null;
let allClients = {};
let editingClientId = null;
let editingImgId = null;
let imgTarget = 'global'; // 'global' or 'client'

/* ── Dynamic URL Helpers ── */
function getBase() {
  let origin = window.location.origin;
  let pathname = window.location.pathname;
  pathname = pathname.replace(/\/index\.html$/, '');
  pathname = pathname.replace(/\/$/, '');
  if (!pathname.endsWith('/admin')) {
    pathname += '/admin';
  }
  return origin + pathname;
}

function getPublicBase() {
  const base = getBase();
  return base.replace(/\/admin\/?$/, '').replace(/\/$/, '');
}

function getAdminUrl(username) {
  return `${getBase()}/#/admin/${username}`;
}

function getSiteUrl(username) {
  return `${getPublicBase()}/#/${username}`;
}

/* ── Toast Helper ── */
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

/* ── Route Parsing ── */
function parseHashRoute() {
  const hash = window.location.hash || '';
  const match = hash.match(/^#\/admin\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return null;
}

/* ── UI View Switching ── */
function showView(viewId) {
  document.getElementById('view-login').style.display = viewId === 'login' ? 'flex' : 'none';
  document.getElementById('view-super').style.display = viewId === 'super' ? 'flex' : 'none';
  document.getElementById('view-client').style.display = viewId === 'client' ? 'flex' : 'none';
}

function initNavigation() {
  // Super Admin Navigation
  document.querySelectorAll('.super-nav .sb-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.super-nav .sb-item').forEach(i => i.classList.remove('on'));
      item.classList.add('on');
      const targetPage = item.dataset.saPage;
      document.querySelectorAll('#sa-main .page').forEach(p => p.classList.remove('on'));
      const pageEl = document.getElementById(`sa-page-${targetPage}`);
      if (pageEl) pageEl.classList.add('on');
    });
  });

  // Client Admin Navigation
  document.querySelectorAll('.client-nav .sb-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.client-nav .sb-item').forEach(i => i.classList.remove('on'));
      item.classList.add('on');
      const targetPage = item.dataset.clPage;
      document.querySelectorAll('#cl-main .page').forEach(p => p.classList.remove('on'));
      const pageEl = document.getElementById(`cl-page-${targetPage}`);
      if (pageEl) pageEl.classList.add('on');
    });
  });

  // Navigation shortcuts
  document.querySelectorAll('[data-sa-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.saGoto;
      const navItem = document.querySelector(`.super-nav .sb-item[data-sa-page="${page}"]`);
      if (navItem) navItem.click();
    });
  });
}

/* ── Auth State Handler ── */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    showView('login');
    return;
  }

  const userEmail = (user.email || '').toLowerCase();
  const routeUsername = parseHashRoute();

  if (userEmail === OWNER_EMAIL) {
    isSuperAdmin = true;
    showView('super');
    document.getElementById('sa-email').textContent = userEmail;
    setupSuperAdminListeners();
  } else {
    isSuperAdmin = false;
    // Client Lookup
    try {
      const snap = await get(ref(db, 'superAdmin/clients'));
      const clients = snap.exists() ? snap.val() : {};
      let matchedClient = null;

      for (const key in clients) {
        if (clients[key] && clients[key].email && clients[key].email.toLowerCase() === userEmail) {
          matchedClient = { id: key, ...clients[key] };
          break;
        }
      }

      if (!matchedClient) {
        document.getElementById('l-err').textContent = `Access denied for ${userEmail}. Contact super admin.`;
        showView('login');
        return;
      }

      // Route check if hash has username
      if (routeUsername && matchedClient.username !== routeUsername) {
        window.location.hash = `#/admin/${matchedClient.username}`;
      }

      currentClient = matchedClient;
      showView('client');
      document.getElementById('cl-email').textContent = userEmail;
      document.getElementById('cl-site-name').textContent = matchedClient.name || 'Client Gallery';
      setupClientAdminListeners(matchedClient.id);
    } catch (e) {
      console.error('Error fetching client auth data:', e);
      showToast('Authentication check failed', 'err');
    }
  }
});

/* ── Google Sign In & Logout ── */
document.getElementById('g-btn').addEventListener('click', async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    document.getElementById('l-err').textContent = e.message;
  }
});

const handleLogout = async () => {
  try {
    await signOut(auth);
    window.location.hash = '';
    showView('login');
  } catch (e) {
    showToast('Logout failed', 'err');
  }
};

document.getElementById('sa-btn-logout')?.addEventListener('click', handleLogout);
document.getElementById('sa-btn-logout2')?.addEventListener('click', handleLogout);
document.getElementById('cl-btn-logout')?.addEventListener('click', handleLogout);
document.getElementById('cl-btn-logout2')?.addEventListener('click', handleLogout);

/* ── SUPER ADMIN LOGIC ── */
function setupSuperAdminListeners() {
  // Populate Base URL settings
  document.getElementById('sa-base-url').value = getBase();
  document.getElementById('sa-public-url').value = getPublicBase();

  // Save URLs Button
  document.getElementById('sa-save-base')?.addEventListener('click', () => {
    showToast('URLs saved to local state');
  });

  // Listen to clients
  onValue(ref(db, 'superAdmin/clients'), (snap) => {
    allClients = snap.exists() ? snap.val() : {};
    renderSuperAdminClients(allClients);
    renderSuperAdminDashboard(allClients);
    renderRevenueTable(allClients);
    renderTrafficTable(allClients);
  });

  // Listen to Global Site Profile
  onValue(ref(db, 'superAdmin/settings/siteProfile'), (snap) => {
    const p = snap.exists() ? snap.val() : {};
    document.getElementById('sa-p-name').value = p.name || '';
    document.getElementById('sa-p-avatar').value = p.avatar || '';
    document.getElementById('sa-p-bio').value = p.bio || '';
    document.getElementById('sa-p-instagram').value = p.instagram || '';
    document.getElementById('sa-p-telegram').value = p.telegram || '';
  });

  // Save Global Site Profile
  document.getElementById('sa-btn-save-prof')?.addEventListener('click', async () => {
    try {
      await set(ref(db, 'superAdmin/settings/siteProfile'), {
        name: document.getElementById('sa-p-name').value.trim(),
        avatar: document.getElementById('sa-p-avatar').value.trim(),
        bio: document.getElementById('sa-p-bio').value.trim(),
        instagram: document.getElementById('sa-p-instagram').value.trim(),
        telegram: document.getElementById('sa-p-telegram').value.trim()
      });
      showToast('Global Profile Saved!');
    } catch(e) { showToast(e.message, 'err'); }
  });

  // Listen to Global Categories
  onValue(ref(db, 'globalSite/categories'), (snap) => {
    const cats = snap.exists() ? snap.val() : {};
    renderGlobalCategoriesTable(cats);
  });

  // Add Global Category Handler
  document.getElementById('sa-btn-add-cat')?.addEventListener('click', async () => {
    const catName = prompt('Enter Global Category Name:');
    if (!catName || !catName.trim()) return;
    const catId = catName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      await update(ref(db, `globalSite/categories/${catId}`), {
        id: catId,
        name: catName.trim(),
        createdAt: Date.now()
      });
      showToast('Global Category added!');
    } catch(e) { showToast(e.message, 'err'); }
  });

  // Listen to Global Site Ads
  onValue(ref(db, 'superAdmin/settings/globalAds'), (snap) => {
    const ads = snap.exists() ? snap.val() : {};
    document.getElementById('sa-ad-popunder').value = ads.popunder || '';
    document.getElementById('sa-ad-banner728').value = ads.banner728 || '';
    document.getElementById('sa-ad-banner320').value = ads.banner320 || '';
    document.getElementById('sa-ad-box300').value = ads.box300 || '';
    document.getElementById('sa-ad-smart').value = ads.smart || '';
  });

  // Save Global Ads
  document.getElementById('sa-save-ads')?.addEventListener('click', async () => {
    try {
      await set(ref(db, 'superAdmin/settings/globalAds'), {
        popunder: document.getElementById('sa-ad-popunder').value,
        banner728: document.getElementById('sa-ad-banner728').value,
        banner320: document.getElementById('sa-ad-banner320').value,
        box300: document.getElementById('sa-ad-box300').value,
        smart: document.getElementById('sa-ad-smart').value
      });
      showToast('Global Ads Saved!');
    } catch(e) { showToast(e.message, 'err'); }
  });

  // Listen to Global Gallery Images
  onValue(ref(db, 'globalSite/images'), (snap) => {
    const imgs = snap.exists() ? snap.val() : {};
    renderGlobalImagesTable(imgs);
  });

  // Client Modal Handlers
  const openClientModal = (clientId = null) => {
    editingClientId = clientId;
    const modal = document.getElementById('sa-client-modal');
    document.getElementById('sa-cm-title').textContent = clientId ? '✏️ Edit Client' : '👥 Add New Client';

    if (clientId && allClients[clientId]) {
      const c = allClients[clientId];
      document.getElementById('sa-cm-name').value = c.name || '';
      document.getElementById('sa-cm-username').value = c.username || '';
      document.getElementById('sa-cm-email').value = c.email || '';
      document.getElementById('sa-cm-pct').value = c.sharePct || 40;
      document.getElementById('sa-pct-val').textContent = c.sharePct || 40;
      document.getElementById('sa-cm-status').value = c.status || 'active';
      document.getElementById('sa-cm-ad-popunder').value = c.adPopunder || '';
      document.getElementById('sa-cm-ad-banner728').value = c.adBanner728 || '';
      document.getElementById('sa-cm-ad-banner320').value = c.adBanner320 || '';
      document.getElementById('sa-cm-ad-box300').value = c.adBox300 || '';
      document.getElementById('sa-cm-ad-smart').value = c.adSmart || '';
    } else {
      document.getElementById('sa-cm-name').value = '';
      document.getElementById('sa-cm-username').value = '';
      document.getElementById('sa-cm-email').value = '';
      document.getElementById('sa-cm-pct').value = 40;
      document.getElementById('sa-pct-val').textContent = 40;
      document.getElementById('sa-cm-status').value = 'active';
      document.getElementById('sa-cm-ad-popunder').value = '';
      document.getElementById('sa-cm-ad-banner728').value = '';
      document.getElementById('sa-cm-ad-banner320').value = '';
      document.getElementById('sa-cm-ad-box300').value = '';
      document.getElementById('sa-cm-ad-smart').value = '';
    }

    modal.style.display = 'flex';
  };

  document.getElementById('sa-btn-add')?.addEventListener('click', () => openClientModal());
  document.getElementById('sa-btn-add2')?.addEventListener('click', () => openClientModal());
  document.getElementById('sa-cm-cancel')?.addEventListener('click', () => {
    document.getElementById('sa-client-modal').style.display = 'none';
  });

  document.getElementById('sa-cm-pct')?.addEventListener('input', (e) => {
    document.getElementById('sa-pct-val').textContent = e.target.value;
  });

  document.getElementById('sa-cm-save')?.addEventListener('click', async () => {
    const name = document.getElementById('sa-cm-name').value.trim();
    const username = document.getElementById('sa-cm-username').value.trim().toLowerCase();
    const email = document.getElementById('sa-cm-email').value.trim().toLowerCase();
    const sharePct = parseInt(document.getElementById('sa-cm-pct').value, 10) || 40;
    const status = document.getElementById('sa-cm-status').value;
    const adPopunder = document.getElementById('sa-cm-ad-popunder').value;
    const adBanner728 = document.getElementById('sa-cm-ad-banner728').value;
    const adBanner320 = document.getElementById('sa-cm-ad-banner320').value;
    const adBox300 = document.getElementById('sa-cm-ad-box300').value;
    const adSmart = document.getElementById('sa-cm-ad-smart').value;

    if (!name || !username || !email) {
      showToast('Name, Username, and Email are required', 'err');
      return;
    }

    const clientId = editingClientId || `client_${Date.now()}`;
    const clientPayload = {
      id: clientId,
      name,
      username,
      email,
      sharePct,
      status,
      adPopunder,
      adBanner728,
      adBanner320,
      adBox300,
      adSmart,
      updatedAt: Date.now()
    };

    try {
      await update(ref(db, `superAdmin/clients/${clientId}`), clientPayload);
      await update(ref(db, `clients/${clientId}/info`), {
        id: clientId,
        name,
        username,
        email,
        sharePct,
        status
      });
      document.getElementById('sa-client-modal').style.display = 'none';
      showToast('Client saved successfully!');
    } catch (e) { showToast(e.message, 'err'); }
  });

  // Global Add Image Modal
  document.getElementById('sa-btn-add-img')?.addEventListener('click', () => {
    imgTarget = 'global';
    editingImgId = null;
    document.getElementById('im-title').textContent = '🖼️ Add Global Image';
    document.getElementById('m-title').value = '';
    document.getElementById('m-desc').value = '';
    document.getElementById('m-cat').value = 'general';
    document.getElementById('m-thumb').value = '';
    document.getElementById('m-hires').value = '';
    document.getElementById('img-modal').style.display = 'flex';
  });
}

/* ── CLIENT ADMIN LOGIC ── */
function setupClientAdminListeners(clientId) {
  // Listen to Client Profile
  onValue(ref(db, `clients/${clientId}/info/profile`), (snap) => {
    const p = snap.exists() ? snap.val() : {};
    document.getElementById('cl-p-bio').value = p.bio || '';
    document.getElementById('cl-p-avatar').value = p.avatar || '';
    document.getElementById('cl-p-instagram').value = p.instagram || '';
    document.getElementById('cl-p-telegram').value = p.telegram || '';
  });

  // Save Client Profile
  document.getElementById('cl-p-save')?.addEventListener('click', async () => {
    try {
      await set(ref(db, `clients/${clientId}/info/profile`), {
        bio: document.getElementById('cl-p-bio').value.trim(),
        avatar: document.getElementById('cl-p-avatar').value.trim(),
        instagram: document.getElementById('cl-p-instagram').value.trim(),
        telegram: document.getElementById('cl-p-telegram').value.trim()
      });
      showToast('Profile Saved!');
    } catch(e) { showToast(e.message, 'err'); }
  });

  // Listen to Client Stats
  onValue(ref(db, `clients/${clientId}/info`), (snap) => {
    const info = snap.exists() ? snap.val() : {};
    document.getElementById('cl-d-visits').textContent = (info.totalVisits || 0).toLocaleString();
    document.getElementById('cl-d-today').textContent = (info.todayVisits || 0).toLocaleString();
    document.getElementById('cl-d-earn').textContent = `₹${(info.totalEarning || 0).toLocaleString()}`;
    document.getElementById('cl-e-total').textContent = `₹${(info.totalEarning || 0).toLocaleString()}`;
    document.getElementById('cl-e-pct').textContent = `${info.sharePct || 40}%`;
  });

  // Listen to Client Images
  onValue(ref(db, `clients/${clientId}/images`), (snap) => {
    const imgs = snap.exists() ? snap.val() : {};
    const imgList = Object.keys(imgs);
    document.getElementById('cl-d-images').textContent = imgList.length;
    document.getElementById('cl-nb-img').textContent = imgList.length;
    renderClientImagesTable(imgs, clientId);
  });

  // Listen to Client Categories
  onValue(ref(db, `clients/${clientId}/categories`), (snap) => {
    const cats = snap.exists() ? snap.val() : {};
    const catList = Object.keys(cats);
    document.getElementById('cl-nb-cat').textContent = catList.length;
    renderClientCategoriesTable(cats, clientId);
  });

  // Add Category Handler
  document.getElementById('cl-btn-add-cat')?.addEventListener('click', async () => {
    const catName = prompt('Enter Category Name:');
    if (!catName || !catName.trim()) return;
    const catId = catName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      await update(ref(db, `clients/${clientId}/categories/${catId}`), {
        id: catId,
        name: catName.trim(),
        createdAt: Date.now()
      });
      showToast('Category added!');
    } catch(e) { showToast(e.message, 'err'); }
  });

  // Add Image Handlers
  const openClientImgModal = () => {
    imgTarget = 'client';
    editingImgId = null;
    document.getElementById('im-title').textContent = '🖼️ Add Image';
    document.getElementById('m-title').value = '';
    document.getElementById('m-desc').value = '';
    document.getElementById('m-cat').value = 'general';
    document.getElementById('m-thumb').value = '';
    document.getElementById('m-hires').value = '';
    document.getElementById('img-modal').style.display = 'flex';
  };

  document.getElementById('cl-btn-add-img')?.addEventListener('click', openClientImgModal);
  document.getElementById('cl-btn-add-img-page')?.addEventListener('click', openClientImgModal);
}

/* ── Image Modal Save Handler (Shared) ── */
document.getElementById('im-cancel')?.addEventListener('click', () => {
  document.getElementById('img-modal').style.display = 'none';
});

document.getElementById('im-save')?.addEventListener('click', async () => {
  const title = document.getElementById('m-title').value.trim();
  const description = document.getElementById('m-desc').value.trim();
  const category = document.getElementById('m-cat').value.trim() || 'general';
  const thumbnailUrl = document.getElementById('m-thumb').value.trim();
  const hiresUrl = document.getElementById('m-hires').value.trim();

  if (!title || !thumbnailUrl || !hiresUrl) {
    showToast('Title, Thumbnail URL, and Hi-Res URL are required', 'err');
    return;
  }

  const id = editingImgId || `img_${Date.now()}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const payload = {
    id,
    title,
    description,
    category,
    thumbnailUrl,
    hiresUrl,
    slug,
    views: 0,
    likes: 0,
    createdAt: Date.now()
  };

  try {
    if (imgTarget === 'global') {
      await update(ref(db, `globalSite/images/${id}`), payload);
    } else if (imgTarget === 'client' && currentClient) {
      await update(ref(db, `clients/${currentClient.id}/images/${id}`), payload);
    }
    document.getElementById('img-modal').style.display = 'none';
    showToast('Image Saved Successfully!');
  } catch(e) { showToast(e.message, 'err'); }
});

/* ── RENDERERS ── */

function renderSuperAdminClients(clients) {
  const tbody = document.getElementById('sa-clients-tbody');
  const dashBody = document.getElementById('sa-dash-clients');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (dashBody) dashBody.innerHTML = '';

  const clientList = Object.values(clients || {});
  document.getElementById('sa-nb-clients').textContent = clientList.length;

  clientList.forEach(c => {
    const adminUrl = getAdminUrl(c.username);
    const siteUrl = getSiteUrl(c.username);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td>
        <div style="font-size:11px;font-family:monospace;color:var(--grn)">Admin: ${adminUrl}</div>
        <div style="font-size:11px;font-family:monospace;color:var(--blu)">Site: ${siteUrl}</div>
      </td>
      <td><span class="lbadge ${c.status === 'active' ? 'owner' : ''}">${c.status}</span></td>
      <td>${c.sharePct || 40}%</td>
      <td>₹${(c.totalEarning || 0).toLocaleString()}</td>
      <td>
        <button class="btn btn-g btn-sm btn-share" data-id="${c.id}">📤 Share</button>
        <button class="btn btn-b btn-sm btn-edit" data-id="${c.id}">✏️ Edit</button>
        <button class="btn btn-d btn-sm btn-del" data-id="${c.id}">🗑 Delete</button>
      </td>
    `;
    tbody.appendChild(tr);

    if (dashBody) {
      const dtr = document.createElement('tr');
      dtr.innerHTML = `
        <td><strong>${c.name}</strong></td>
        <td><a href="${siteUrl}" target="_blank" style="color:var(--blu)">#/${c.username}</a></td>
        <td><span class="lbadge ${c.status === 'active' ? 'owner' : ''}">${c.status}</span></td>
        <td>${(c.totalVisits || 0).toLocaleString()}</td>
        <td>₹${(c.totalEarning || 0).toLocaleString()}</td>
        <td>${c.sharePct || 40}%</td>
      `;
      dashBody.appendChild(dtr);
    }
  });

  // Attach Listeners
  tbody.querySelectorAll('.btn-share').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.id;
      const c = allClients[cid];
      if (!c) return;

      document.getElementById('sm-name').textContent = c.name;
      document.getElementById('sm-admin-url').textContent = getAdminUrl(c.username);
      document.getElementById('sm-site-url').textContent = getSiteUrl(c.username);
      document.getElementById('share-modal').style.display = 'flex';
    });
  });

  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.id;
      if (allClients[cid]) {
        editingClientId = cid;
        const c = allClients[cid];
        document.getElementById('sa-cm-title').textContent = '✏️ Edit Client';
        document.getElementById('sa-cm-name').value = c.name || '';
        document.getElementById('sa-cm-username').value = c.username || '';
        document.getElementById('sa-cm-email').value = c.email || '';
        document.getElementById('sa-cm-pct').value = c.sharePct || 40;
        document.getElementById('sa-pct-val').textContent = c.sharePct || 40;
        document.getElementById('sa-cm-status').value = c.status || 'active';
        document.getElementById('sa-cm-ad-popunder').value = c.adPopunder || '';
        document.getElementById('sa-cm-ad-banner728').value = c.adBanner728 || '';
        document.getElementById('sa-cm-ad-banner320').value = c.adBanner320 || '';
        document.getElementById('sa-cm-ad-box300').value = c.adBox300 || '';
        document.getElementById('sa-cm-ad-smart').value = c.adSmart || '';
        document.getElementById('sa-client-modal').style.display = 'flex';
      }
    });
  });

  tbody.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.id;
      if (confirm('Are you sure you want to delete this client?')) {
        try {
          await remove(ref(db, `superAdmin/clients/${cid}`));
          await remove(ref(db, `clients/${cid}`));
          showToast('Client deleted');
        } catch(e) { showToast(e.message, 'err'); }
      }
    });
  });
}

function renderGlobalCategoriesTable(cats) {
  const tbody = document.getElementById('sa-cat-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.values(cats || {}).forEach(cat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${cat.id}</code></td>
      <td><strong>${cat.name}</strong></td>
      <td><button class="btn btn-d btn-sm btn-del-gcat" data-id="${cat.id}">🗑 Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-gcat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Delete global category?')) {
        await remove(ref(db, `globalSite/categories/${id}`));
        showToast('Global category deleted');
      }
    });
  });
}

function renderSuperAdminDashboard(clients) {
  const clientList = Object.values(clients || {});
  document.getElementById('sa-d-clients').textContent = clientList.length;
  document.getElementById('sa-d-active').textContent = clientList.filter(c => c.status === 'active').length;

  let totalVisits = 0;
  let todayVisits = 0;
  let totalRev = 0;

  clientList.forEach(c => {
    totalVisits += c.totalVisits || 0;
    todayVisits += c.todayVisits || 0;
    totalRev += c.totalEarning || 0;
  });

  document.getElementById('sa-d-traffic').textContent = totalVisits.toLocaleString();
  document.getElementById('sa-d-today').textContent = todayVisits.toLocaleString();
  document.getElementById('sa-d-rev').textContent = `₹${totalRev.toLocaleString()}`;
}

function renderRevenueTable(clients) {
  const tbody = document.getElementById('sa-rev-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const clientList = Object.values(clients || {});
  clientList.forEach(c => {
    const total = c.totalEarning || 0;
    const share = c.sharePct || 40;
    const clientGets = Math.round(total * (share / 100));
    const ownerGets = total - clientGets;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td>₹${total.toLocaleString()}</td>
      <td>${share}%</td>
      <td style="color:var(--grn)">₹${clientGets.toLocaleString()}</td>
      <td style="color:var(--blu)">₹${ownerGets.toLocaleString()}</td>
      <td><button class="btn btn-g btn-sm">Payout</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTrafficTable(clients) {
  const tbody = document.getElementById('sa-traffic-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const clientList = Object.values(clients || {});
  clientList.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td style="font-family:monospace">${getSiteUrl(c.username)}</td>
      <td>${(c.todayVisits || 0).toLocaleString()}</td>
      <td>${(c.totalVisits || 0).toLocaleString()}</td>
      <td><span class="lbadge ${c.status === 'active' ? 'owner' : ''}">${c.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderGlobalImagesTable(imgs) {
  const tbody = document.getElementById('sa-img-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.values(imgs || {}).forEach(img => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${img.thumbnailUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:6px"/></td>
      <td><strong>${img.title}</strong><br/><small style="color:var(--mu)">${img.id}</small></td>
      <td><span class="lbadge">${img.category}</span></td>
      <td><button class="btn btn-d btn-sm btn-del-gimg" data-id="${img.id}">🗑 Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-gimg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Delete global image?')) {
        await remove(ref(db, `globalSite/images/${id}`));
        showToast('Global image deleted');
      }
    });
  });
}

function renderClientImagesTable(imgs, clientId) {
  const tbody = document.getElementById('cl-img-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.values(imgs || {}).forEach(img => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${img.thumbnailUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:6px"/></td>
      <td><strong>${img.title}</strong><br/><small style="color:var(--mu)">${img.id}</small></td>
      <td><span class="lbadge">${img.category}</span></td>
      <td><button class="btn btn-d btn-sm btn-del-climg" data-id="${img.id}">🗑 Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-climg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Delete image?')) {
        await remove(ref(db, `clients/${clientId}/images/${id}`));
        showToast('Image deleted');
      }
    });
  });
}

function renderClientCategoriesTable(cats, clientId) {
  const tbody = document.getElementById('cl-cat-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.values(cats || {}).forEach(cat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${cat.id}</code></td>
      <td><strong>${cat.name}</strong></td>
      <td><button class="btn btn-d btn-sm btn-del-cat" data-id="${cat.id}">🗑 Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Delete category?')) {
        await remove(ref(db, `clients/${clientId}/categories/${id}`));
        showToast('Category deleted');
      }
    });
  });
}

// Share Modal Copy Listeners
document.getElementById('sm-copy-admin')?.addEventListener('click', () => {
  const text = document.getElementById('sm-admin-url').textContent;
  navigator.clipboard.writeText(text);
  showToast('Admin URL Copied!');
});

document.getElementById('sm-copy-site')?.addEventListener('click', () => {
  const text = document.getElementById('sm-site-url').textContent;
  navigator.clipboard.writeText(text);
  showToast('Public Site URL Copied!');
});

document.getElementById('sm-close')?.addEventListener('click', () => {
  document.getElementById('share-modal').style.display = 'none';
});

// Initialize Nav
initNavigation();
