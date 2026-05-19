/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA SERVICE WORKER  v1.0.0                                     ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Enables offline functionality and fast loading                 ║
 * ║   Cache-first strategy for static assets                        ║
 * ║   Network-first strategy for API calls                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const CACHE_NAME    = "ofa-v1.0.0";
const OFFLINE_URL   = "/offline.html";

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,300;9..144,0,700;9..144,0,900;9..144,1,300;9..144,1,700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap",
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("[OFA SW] Pre-caching assets");
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache:"reload" })));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.log("[OFA SW] Pre-cache failed:", err))
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log("[OFA SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip Chrome extensions and non-http
  if (!url.protocol.startsWith("http")) return;

  // API calls — network first, no cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .catch(() => new Response(
          JSON.stringify({ error:"offline", message:"No internet connection" }),
          { headers:{ "Content-Type":"application/json" } }
        ))
    );
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;

        return fetch(request)
          .then(response => {
            // Only cache successful responses
            if (!response || response.status !== 200 || response.type === "opaque") {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, responseToCache));

            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (request.mode === "navigate") {
              return caches.match("/index.html");
            }
          });
      })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || "Open Feed Network", {
      body:    data.body    || "New activity on Open Feed Network",
      icon:    data.icon    || "/icons/icon-192.png",
      badge:   data.badge   || "/icons/icon-72.png",
      tag:     data.tag     || "ofa-notification",
      data:    data.url     || "/",
      actions: [
        { action:"view",    title:"View"    },
        { action:"dismiss", title:"Dismiss" },
      ],
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data || "/";

  event.waitUntil(
    clients.matchAll({ type:"window" })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ── BACKGROUND SYNC ───────────────────────────────────────────────────────────
self.addEventListener("sync", event => {
  if (event.tag === "ofa-sync") {
    event.waitUntil(syncOfflineActions());
  }
});

async function syncOfflineActions() {
  // When back online — sync any queued posts or tips
  console.log("[OFA SW] Background sync triggered");
}

console.log("[OFA SW] Service worker loaded — Open Feed Network v1.0.0");
