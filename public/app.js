const state = {
  token: localStorage.getItem('fw_token') || null,
  me: null,
  prayerFeed: [],
  myPrayers: [],
  notifications: [],
  selectedPrayerId: null,
  selectedPrayer: null,
  authMode: 'login',
  feedTab: 'create',
  includeClosed: false,
  loading: false,
  error: null,
  success: null,
  logoSrc: null
};

const appEl = document.getElementById('app');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

const LOGO_CANDIDATES = [
  '/logo.png',
  '/logo.jpg',
  '/logo.jpeg',
  '/logo.webp',
  '/logo.svg',
  '/faith-whisperer-logo.png',
  '/faith-whisperer.png'
];

async function resolveLogoSrc() {
  for (const candidate of LOGO_CANDIDATES) {
    try {
      const response = await fetch(candidate, {
        method: 'HEAD',
        cache: 'no-store'
      });

      if (response.ok) {
        state.logoSrc = candidate;
        return;
      }
    } catch (_error) {
    }
  }

  state.logoSrc = null;
}

function logoMarkup(size = 'large') {
  if (!state.logoSrc) {
    const fallbackClass = size === 'small' ? 'logo-fallback logo-sm' : 'logo-fallback logo-lg';
    return `<div class="${fallbackClass}" aria-label="Faith Whisperer">FW</div>`;
  }

  const sizeClass = size === 'small' ? 'logo-sm' : 'logo-lg';
  return `<img src="${state.logoSrc}" alt="Faith Whisperer" class="logo ${sizeClass}" />`;
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function setStatus({ error = null, success = null }) {
  state.error = error;
  state.success = success;
}

function setToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem('fw_token', token);
  } else {
    localStorage.removeItem('fw_token');
  }
}

async function loadMe() {
  if (!state.token) {
    state.me = null;
    return;
  }

  state.me = await api('/me');
}

async function loadFeed() {
  const prayers = await api(`/prayers?includeClosed=${state.includeClosed}`);
  state.prayerFeed = prayers.filter((prayer) => prayer.requesterUserId !== state.me.id);
}

async function loadMyPrayers() {
  const allPrayers = await api('/prayers?includeClosed=true');
  state.myPrayers = allPrayers.filter((prayer) => prayer.requesterUserId === state.me.id);
}

async function refreshFeedData() {
  await Promise.all([loadFeed(), loadMyPrayers()]);
}

async function loadNotifications() {
  state.notifications = await api('/notifications');
}

async function loadPrayerDetail(id) {
  state.selectedPrayer = await api(`/prayers/${id}`);
  state.selectedPrayerId = id;
}

function authView() {
  return `
    <div class="container">
      <div class="card">
        <div class="brand brand-center">
          ${logoMarkup('large')}
        </div>
        <h1 class="brand-title">Faith Whisperer</h1>
        <p class="muted">Volunteer Prayer App</p>
        <div class="actions">
          <button class="${state.authMode === 'login' ? '' : 'secondary'}" data-action="switch-login">Login</button>
          <button class="${state.authMode === 'register' ? '' : 'secondary'}" data-action="switch-register">Register</button>
        </div>
      </div>

      <div class="card">
        <h2>${state.authMode === 'login' ? 'Login' : 'Register'}</h2>
        <form id="auth-form" class="row">
          <div>
            <label>Email</label>
            <input name="email" type="email" required />
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" required minlength="8" />
          </div>
          <button type="submit">${state.authMode === 'login' ? 'Login' : 'Create account'}</button>
        </form>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ''}
      </div>
    </div>
  `;
}

function navigation() {
  const unreadCount = state.notifications.filter((item) => !item.isRead).length;
  return `
    <div class="nav">
      <div class="nav-inner">
        <div class="brand brand-nav">
          ${logoMarkup('small')}
          <div>
            <strong>Faith Whisperer</strong>
          </div>
          <div class="muted">${escapeHtml(state.me.email)}</div>
        </div>
        <div class="nav-buttons">
          <button class="secondary" data-action="go-feed">Feed</button>
          <button class="secondary" data-action="go-settings">Settings</button>
          <button class="secondary" data-action="go-notifications">Notifications (${unreadCount})</button>
          <button data-action="logout">Logout</button>
        </div>
      </div>
    </div>
  `;
}

function feedView() {
  const myPrayerItems = state.myPrayers
    .map(
      (prayer) => `
        <div class="list-item">
          <div class="actions" style="justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(prayer.title || 'Untitled Request')}</strong>
            <span class="badge ${prayer.status === 'OPEN' ? 'open' : 'closed'}">${prayer.status}</span>
          </div>
          <p>${escapeHtml(prayer.body)}</p>
          <p class="muted">Praying: ${prayer.prayingCount} · ${formatDate(prayer.createdAt)}</p>
          <button data-action="open-prayer" data-id="${prayer.id}">View details</button>
        </div>
      `
    )
    .join('');

  const list = state.prayerFeed
    .map(
      (prayer) => `
        <div class="list-item">
          <div class="actions" style="justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(prayer.title || 'Untitled Request')}</strong>
            <span class="badge ${prayer.status === 'OPEN' ? 'open' : 'closed'}">${prayer.status}</span>
          </div>
          <p>${escapeHtml(prayer.body)}</p>
          <p class="muted">Requester: ${escapeHtml(prayer.requesterEmail)} · Praying: ${prayer.prayingCount} · ${formatDate(prayer.createdAt)}</p>
          <button data-action="open-prayer" data-id="${prayer.id}">View details</button>
        </div>
      `
    )
    .join('');

  const isCreateTab = state.feedTab === 'create';
  const isMyPrayersTab = state.feedTab === 'my-prayers';
  const isPrayerFeedTab = state.feedTab === 'prayer-feed';

  return `
    <div class="container">
      <div class="card">
        <div class="tabs" role="tablist" aria-label="Prayer sections">
          <button class="tab-btn ${isCreateTab ? 'active' : 'secondary'}" data-action="set-feed-tab" data-tab="create">Create Prayer Request</button>
          <button class="tab-btn ${isMyPrayersTab ? 'active' : 'secondary'}" data-action="set-feed-tab" data-tab="my-prayers">My Prayers (${state.myPrayers.length})</button>
          <button class="tab-btn ${isPrayerFeedTab ? 'active' : 'secondary'}" data-action="set-feed-tab" data-tab="prayer-feed">Prayer Feed</button>
        </div>

        ${isCreateTab ? `
          <div class="tab-panel" role="tabpanel">
            <h2>Create Prayer Request</h2>
            <form id="new-prayer-form" class="row">
              <div>
                <label>Title (optional)</label>
                <input name="title" maxlength="120" />
              </div>
              <div>
                <label>Prayer text</label>
                <textarea name="body" required></textarea>
              </div>
              <button type="submit">Submit Prayer Request</button>
            </form>
          </div>
        ` : ''}

        ${isMyPrayersTab ? `
          <div class="tab-panel" role="tabpanel">
            <h2>My Prayers (${state.myPrayers.length})</h2>
            ${myPrayerItems || '<p class="muted">You have not created any prayer requests yet.</p>'}
          </div>
        ` : ''}

        ${isPrayerFeedTab ? `
          <div class="tab-panel" role="tabpanel">
            <div class="actions" style="justify-content:space-between;">
              <h2 style="margin:0;">Prayer Feed</h2>
              <button class="secondary" data-action="toggle-closed">${state.includeClosed ? 'Hide closed' : 'Include closed'}</button>
            </div>
            ${list || '<p class="muted">No prayer requests yet.</p>'}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function settingsView() {
  return `
    <div class="container">
      <div class="card">
        <h2>Settings</h2>
        <form id="settings-form" class="row">
          <label>
            <input name="volunteeredToPray" type="checkbox" ${state.me.volunteeredToPray ? 'checked' : ''} />
            I volunteer to pray (receive notifications on new prayer requests)
          </label>
          <button type="submit">Save Settings</button>
        </form>
      </div>
    </div>
  `;
}

function notificationsView() {
  const items = state.notifications
    .map(
      (item) => `
        <div class="list-item">
          <div class="actions" style="justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(item.type)}</strong>
            <span class="badge ${item.isRead ? 'open' : 'closed'}">${item.isRead ? 'READ' : 'UNREAD'}</span>
          </div>
          <p>${escapeHtml(item.text)}</p>
          <p class="muted">${formatDate(item.createdAt)}</p>
          <div class="actions">
            <button class="secondary" data-action="open-prayer" data-id="${item.prayerRequestId}">Open request</button>
            ${item.isRead ? '' : `<button data-action="mark-read" data-id="${item.id}">Mark read</button>`}
          </div>
        </div>
      `
    )
    .join('');

  return `
    <div class="container">
      <div class="card">
        <h2>Notifications</h2>
        ${items || '<p class="muted">No notifications yet.</p>'}
      </div>
    </div>
  `;
}

function prayerDetailView() {
  const prayer = state.selectedPrayer;
  const isRequester = prayer.requesterUserId === state.me.id;
  const isClosed = prayer.status === 'CLOSED';

  const responses = prayer.responses
    .map(
      (item) => `
        <div class="list-item">
          <strong>${escapeHtml(item.fromUserEmail)}</strong>
          <p class="muted">${formatDate(item.createdAt)} · ${item.type}</p>
          ${item.message ? `<p>${escapeHtml(item.message)}</p>` : '<p class="muted">No message provided.</p>'}
        </div>
      `
    )
    .join('');

  const updates = prayer.updates
    .map(
      (item) => `
        <div class="list-item">
          <p>${escapeHtml(item.body)}</p>
          <p class="muted">${escapeHtml(item.fromUserEmail)} · ${formatDate(item.createdAt)}</p>
        </div>
      `
    )
    .join('');

  return `
    <div class="container">
      <div class="card">
        <div class="actions" style="justify-content:space-between;align-items:center;">
          <h2 style="margin:0;">${escapeHtml(prayer.title || 'Untitled Request')}</h2>
          <span class="badge ${isClosed ? 'closed' : 'open'}">${prayer.status}</span>
        </div>
        <p>${escapeHtml(prayer.body)}</p>
        <p class="muted">Requester: ${escapeHtml(prayer.requesterEmail)} · Created: ${formatDate(prayer.createdAt)}</p>
        <p><strong>People praying:</strong> ${prayer.prayingCount}</p>
      </div>

      <div class="card">
        <h3>I am praying for you</h3>
        <form id="respond-form" class="row">
          <div>
            <label>Optional message</label>
            <textarea name="message" placeholder="Optional encouragement..."></textarea>
          </div>
          <button type="submit" ${isClosed || prayer.alreadyPraying || isRequester ? 'disabled' : ''}>I am praying for you</button>
          ${isRequester ? '<p class="muted">You cannot respond to your own request.</p>' : ''}
          ${prayer.alreadyPraying ? '<p class="muted">You are already praying for this request.</p>' : ''}
          ${isClosed ? '<p class="muted">This prayer request is closed.</p>' : ''}
        </form>
      </div>

      <div class="card">
        <h3>Praying Volunteers & Messages</h3>
        ${responses || '<p class="muted">No responses yet.</p>'}
      </div>

      <div class="card">
        <h3>Updates</h3>
        ${updates || '<p class="muted">No updates yet.</p>'}

        ${isRequester ? `
          <form id="update-form" class="row">
            <div>
              <label>Post update</label>
              <textarea name="body" ${isClosed ? 'disabled' : ''}></textarea>
            </div>
            <button type="submit" ${isClosed ? 'disabled' : ''}>Post Update</button>
          </form>
          <div class="actions">
            <button id="close-request-btn" ${isClosed ? 'disabled' : ''}>Close Request</button>
          </div>
        ` : '<p class="muted">Only requester can post updates or close request.</p>'}
      </div>

      <div class="actions">
        <button class="secondary" data-action="go-feed">Back to feed</button>
      </div>
    </div>
  `;
}

function shell(content) {
  const statusText = state.error
    ? `<p class="error">${escapeHtml(state.error)}</p>`
    : state.success
      ? `<p class="success">${escapeHtml(state.success)}</p>`
      : '';

  return `${navigation()}${statusText ? `<div class="container">${statusText}</div>` : ''}${content}`;
}

function currentView() {
  if (!state.token || !state.me) {
    return authView();
  }

  if (state.selectedPrayer) {
    return shell(prayerDetailView());
  }

  if (location.hash === '#settings') {
    return shell(settingsView());
  }

  if (location.hash === '#notifications') {
    return shell(notificationsView());
  }

  return shell(feedView());
}

function render() {
  appEl.innerHTML = currentView();
}

async function bootstrap() {
  setStatus({ error: null, success: null });
  await resolveLogoSrc();

  if (!state.token) {
    render();
    return;
  }

  try {
    await loadMe();
    await Promise.all([refreshFeedData(), loadNotifications()]);
    render();
  } catch (error) {
    setToken(null);
    state.me = null;
    state.prayerFeed = [];
    state.myPrayers = [];
    state.notifications = [];
    state.selectedPrayer = null;
    setStatus({ error: 'Session expired. Please login again.' });
    render();
  }
}

document.addEventListener('submit', async (event) => {
  const form = event.target;

  if (form.id === 'auth-form') {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password')
    };

    try {
      const endpoint = state.authMode === 'login' ? '/auth/login' : '/auth/register';
      const data = await api(endpoint, { method: 'POST', body: payload });
      setToken(data.token);
      await loadMe();
      await Promise.all([refreshFeedData(), loadNotifications()]);
      setStatus({ success: state.authMode === 'login' ? 'Logged in.' : 'Account created.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
  }

  if (form.id === 'new-prayer-form') {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      title: formData.get('title'),
      body: formData.get('body')
    };

    try {
      await api('/prayers', { method: 'POST', body: payload });
      form.reset();
      await Promise.all([refreshFeedData(), loadNotifications()]);
      setStatus({ success: 'Prayer request created.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
  }

  if (form.id === 'settings-form') {
    event.preventDefault();
    const formData = new FormData(form);
    const volunteeredToPray = formData.get('volunteeredToPray') === 'on';
    try {
      state.me = await api('/me', {
        method: 'PATCH',
        body: { volunteeredToPray }
      });
      setStatus({ success: 'Settings updated.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
  }

  if (form.id === 'respond-form') {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      message: formData.get('message')
    };

    try {
      await api(`/prayers/${state.selectedPrayerId}/respond`, {
        method: 'POST',
        body: payload
      });
      await Promise.all([
        loadPrayerDetail(state.selectedPrayerId),
        refreshFeedData(),
        loadNotifications()
      ]);
      setStatus({ success: 'Your prayer response has been sent.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
  }

  if (form.id === 'update-form') {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      body: formData.get('body')
    };

    try {
      await api(`/prayers/${state.selectedPrayerId}/updates`, {
        method: 'POST',
        body: payload
      });
      form.reset();
      await Promise.all([
        loadPrayerDetail(state.selectedPrayerId),
        loadNotifications()
      ]);
      setStatus({ success: 'Update posted.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], #close-request-btn');
  if (!target) return;

  const action = target.dataset.action;

  if (action === 'switch-login') {
    state.authMode = 'login';
    setStatus({ error: null, success: null });
    render();
    return;
  }

  if (action === 'switch-register') {
    state.authMode = 'register';
    setStatus({ error: null, success: null });
    render();
    return;
  }

  if (action === 'logout') {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (_error) {
    } finally {
      setToken(null);
      state.me = null;
      state.prayerFeed = [];
      state.myPrayers = [];
      state.notifications = [];
      state.selectedPrayer = null;
      location.hash = '';
      setStatus({ success: 'Logged out.' });
      render();
    }
    return;
  }

  if (action === 'go-feed') {
    state.selectedPrayer = null;
    state.selectedPrayerId = null;
    location.hash = '';
    await refreshFeedData();
    render();
    return;
  }

  if (action === 'go-settings') {
    state.selectedPrayer = null;
    state.selectedPrayerId = null;
    location.hash = '#settings';
    render();
    return;
  }

  if (action === 'go-notifications') {
    state.selectedPrayer = null;
    state.selectedPrayerId = null;
    location.hash = '#notifications';
    await loadNotifications();
    render();
    return;
  }

  if (action === 'toggle-closed') {
    state.includeClosed = !state.includeClosed;
    await refreshFeedData();
    render();
    return;
  }

  if (action === 'set-feed-tab') {
    state.feedTab = target.dataset.tab;
    render();
    return;
  }

  if (action === 'open-prayer') {
    const prayerId = target.dataset.id;
    try {
      await loadPrayerDetail(prayerId);
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
    return;
  }

  if (action === 'mark-read') {
    try {
      await api(`/notifications/${target.dataset.id}/read`, { method: 'POST' });
      await loadNotifications();
      setStatus({ success: 'Notification marked as read.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
    return;
  }

  if (target.id === 'close-request-btn') {
    try {
      await api(`/prayers/${state.selectedPrayerId}/close`, { method: 'POST' });
      await Promise.all([
        loadPrayerDetail(state.selectedPrayerId),
        refreshFeedData(),
        loadNotifications()
      ]);
      setStatus({ success: 'Prayer request closed.' });
      render();
    } catch (error) {
      setStatus({ error: error.message });
      render();
    }
  }
});

window.addEventListener('hashchange', async () => {
  if (state.token && state.me) {
    if (location.hash === '#notifications') {
      await loadNotifications();
    }
    if (location.hash !== '#settings' && location.hash !== '#notifications') {
      await refreshFeedData();
    }
  }
  render();
});

bootstrap();
