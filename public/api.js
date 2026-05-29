const API_BASE = 'https://api.candortheopenfeednetwork.com/api/v1';
let _token = null;
export const setToken = (t) => { _token = t; };
export const getToken = () => _token;
export const clearToken = () => { _token = null; };

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) { clearToken(); window.dispatchEvent(new CustomEvent('candor:unauthorized')); throw new Error('Session expired.'); }
  if (!res.ok) { const err = await res.json().catch(() => ({ message: 'Request failed' })); throw new Error(err.message || `HTTP ${res.status}`); }
  return res.json();
}

export const auth = {
  signup: (data) => request('POST', '/auth/register', data),
  login: (email, pass) => request('POST', '/auth/login', { email, password: pass }),
  logout: () => { clearToken(); return Promise.resolve(); },
  me: () => request('GET', '/auth/me'),
};

export const feed = {
  getForYou: (cursor) => request('GET', `/feed${cursor ? `?before=${cursor}` : ''}`),
  getFollowing: (cursor) => request('GET', `/feed/following${cursor ? `?before=${cursor}` : ''}`),
};

export const posts = {
  create: (content, media_url = null) => request('POST', '/posts', { content, media_url }),
  like: (id) => request('POST', `/posts/${id}/like`),
  get: (id) => request('GET', `/posts/${id}`),
  delete: (id) => request('DELETE', `/posts/${id}`),
};

export const users = {
  getProfile: (handle) => request('GET', `/users/${handle}`),
  follow: (handle) => request('POST', `/follows/${handle}`),
  update: (data) => request('PATCH', '/users/me', data),
};

export const search = {
  query: (q, type = 'posts') => request('GET', `/search?q=${encodeURIComponent(q)}&type=${type}`),
};

export function connectFeedSocket(onMessage) {
  const WS_BASE = 'wss://api.candortheopenfeednetwork.com';
  const url = _token ? `${WS_BASE}/ws/feed?token=${_token}` : `${WS_BASE}/ws/feed`;
  const ws = new WebSocket(url);
  ws.onopen = () => console.log('[Candor WS] Connected');
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
  ws.onclose = () => { setTimeout(() => connectFeedSocket(onMessage), 3000); };
  return ws;
}
