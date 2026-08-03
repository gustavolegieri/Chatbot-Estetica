const CACHE_NAME = "garagem-ka-pwa-v1";
const APP_SHELL = [
  "/admin/mobile",
  "/admin/login",
  "/manifest.webmanifest",
  "/logo-garagem-do-ka.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/admin/mobile")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && ["script", "style", "image", "font"].includes(request.destination)) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    }))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, url, tag, icon } = event.data;
    event.waitUntil(self.registration.showNotification(title, {
      body,
      tag,
      icon: icon || "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      data: { url: url || "/admin/mobile" },
      vibrate: [120, 60, 120],
    }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin/mobile", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json?.() || {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || "Garagem do Ka", {
    body: data.body || "Nova mensagem recebida",
    tag: data.tag || "whatsapp-message",
    icon: data.icon || "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png",
    data: { url: data.url || "/admin/mobile" },
    vibrate: [120, 60, 120],
  }));
});
