/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     OFA SERVICE WORKER  v1.0.0                           ║
 * ║     Progressive Web App — Offline Support                ║
 * ║     Open Feed Platform                                   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Strategy:
 *   - App shell:     Cache First (instant load)
 *   - API calls:     Network First with offline fallback
 *   - Media:         Stale While Revalidate
 *   - Static assets: Cache First with version control
 *
 * Offline capabilities:
 *   - Full app UI loads without internet
 *   - Last fetched feed cached for offline reading
 *   - Posts queued offline, synced when connection restored
 *   - Truth Shield analysis results cached per content hash
 */

const CACHE_VERSION   = "ofa-v1.0.0";
const SHELL_CACHE     = `${CACHE_VERSION}-shell`;
const API_CACHE       = `${CACHE_VERSION}-api`;
const MEDIA_CACHE     = `${CACHE_VERSION}-media`;
const OFFLINE_QUEUE   = `${CACHE_VERSION}-queue`;

// App shell — everything needed to render the UI offline
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// API endpoints to cache for offline reading
const CACHE_API_PATTERNS = [
  /\/api\/v1\/feed/,
  /\/api\/v1\/governance\/proposals/,
  /\/api\/v1\/truthshield\/stats/,
  /\/api\/v1\/feed\/weights/,
];

// Never cache these — always need fresh data
const NEVER_CACHE = [
  /\/api\/v1\/users\/login/,
  /\/api\/v1\/users\/register/,
  /\/api\/v1\/governance\/proposals\/.*\/vote/,
  /\/api\/v1\/posts$/,
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  console.log("[SW] Installing OFA Service Worker", CACHE_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn("[SW] Shell cache failed:", err))
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  console.log("[SW] Activating OFA Service Worker", CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      // Remove old caches
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith("ofa-") && !k.startsWith(CACHE_VERSION))
            .map(k => { console.log("[SW] Removing old cache:", k); return caches.delete(k); })
        )
      ),
      self.clients.claim(),
    ])
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET for caching (except background sync handles POST offline)
  if (request.method !== "GET") {
    // Queue POST requests when offline
    if (request.method === "POST" && url.pathname.startsWith("/api/")) {
      event.respondWith(networkWithOfflineQueue(request));
    }
    return;
  }

  // Never cache patterns
  if (NEVER_CACHE.some(p => p.test(url.pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // App shell — Cache First
  if (SHELL_ASSETS.includes(url.pathname) || url.pathname === "/") {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // API calls — Network First with cache fallback
  if (url.pathname.startsWith("/api/") && CACHE_API_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // External fonts, CDN assets — Stale While Revalidate
  if (url.hostname.includes("googleapis") || url.hostname.includes("gstatic") ||
      url.pathname.match(/\.(woff2?|ttf|otf)$/)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }

  // Everything else — Network First
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ── CACHE STRATEGIES ──────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      console.log("[SW] Serving from cache (offline):", request.url);
      return cached;
    }
    return offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || networkPromise;
}

async function networkWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch {
    // Queue for background sync
    const body = await request.clone().text();
    const queuedItem = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    };
    // Store in IndexedDB for background sync
    await storeOfflineRequest(queuedItem);
    return new Response(JSON.stringify({
      queued: true,
      message: "Post queued for sync when connection is restored",
      offline: true,
    }), { status: 202, headers: { "Content-Type": "application/json" } });
  }
}

function offlineFallback(request) {
  if (request.headers.get("accept")?.includes("text/html")) {
    return caches.match("/offline.html");
  }
  if (request.url.includes("/api/")) {
    return new Response(JSON.stringify({
      offline: true,
      message: "You are offline. Showing cached data.",
      data: [],
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  return new Response("Offline", { status: 503 });
}

// Simple IndexedDB wrapper for offline queue
async function storeOfflineRequest(item) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ofa-offline-queue", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("requests", { autoIncrement: true });
    req.onsuccess = e => {
      const tx = e.target.result.transaction("requests", "readwrite");
      tx.objectStore("requests").add(item);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    };
    req.onerror = reject;
  });
}

// ── BACKGROUND SYNC ───────────────────────────────────────────────────────────
self.addEventListener("sync", event => {
  if (event.tag === "ofa-post-sync") {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ofa-offline-queue", 1);
    req.onsuccess = async e => {
      const db = e.target.result;
      const tx = db.transaction("requests", "readwrite");
      const store = tx.objectStore("requests");
      const allReq = store.getAll();
      allReq.onsuccess = async () => {
        const items = allReq.result;
        for (const item of items) {
          try {
            await fetch(item.url, {
              method: item.method,
              headers: item.headers,
              body: item.body,
            });
            console.log("[SW] Synced offline request:", item.url);
          } catch (err) {
            console.warn("[SW] Sync failed for:", item.url, err);
          }
        }
        store.clear();
        resolve();
      };
    };
    req.onerror = reject;
  });
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body:    data.body || "New activity on Open Feed Platform",
    icon:    "/icons/icon-192.png",
    badge:   "/icons/badge-72.png",
    vibrate: [200, 100, 200],
    tag:     data.tag || "ofa-notification",
    renotify: true,
    data:    { url: data.url || "/" },
    actions: [
      { action:"open",   title:"View",    icon:"/icons/action-view.png" },
      { action:"dismiss",title:"Dismiss", icon:"/icons/action-dismiss.png" },
    ],
  };

  // Customize by notification type
  if (data.type === "truth_shield_verdict") {
    options.body = `🛡 Truth Shield: ${data.verdict} (${data.confidence}% confidence)`;
    options.tag  = "ts-verdict";
  } else if (data.type === "suppression_blocked") {
    options.body = `⚠ Platform tried to suppress your post — OFA blocked it`;
    options.tag  = "suppression";
  } else if (data.type === "governance_vote") {
    options.body = `🗳 Governance: "${data.proposal}" — ${data.days_left} days left to vote`;
    options.tag  = "governance";
  } else if (data.type === "appeal_resolved") {
    options.body = `⚖ Your appeal has been resolved: ${data.resolution}`;
    options.tag  = "appeal";
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Open Feed Platform", options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type:"window", includeUncontrolled:true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes(url) && "focus" in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── MESSAGE HANDLER ───────────────────────────────────────────────────────────
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION")  event.ports[0].postMessage({ version: CACHE_VERSION });
  if (event.data?.type === "CLEAR_CACHE") {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => event.ports[0].postMessage({ cleared: true }));
  }
});

console.log("[SW] OFA Service Worker loaded:", CACHE_VERSION);
