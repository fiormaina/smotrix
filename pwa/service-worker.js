const SW_VERSION = "movie-tracker-pwa-v19";
const HTML_CACHE = `${SW_VERSION}-html`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./landing-simple.css",
  "./main-simple.js",
  "./manifest.webmanifest",
  "./pages/watch-history.html",
  "./pages/folders.html",
  "./pages/about.html",
  "./pages/contacts.html",
  "./pages/folder-create.html",
  "./pages/folder-detail.html",
  "./pages/movie-detail.html",
  "./pages/profile.html",
  "./src/scripts/app-runtime.js?v=20260527a",
  "./src/scripts/stores/folders-store.js",
  "./src/scripts/services/media-api.js",
  "./src/scripts/pages/watch-history.js?v=20260524c",
  "./src/scripts/pages/folders.js",
  "./src/scripts/pages/about.js?v=20260527a",
  "./src/scripts/pages/contacts.js?v=20260527a",
  "./src/scripts/pages/folder-create.js",
  "./src/scripts/pages/folder-detail.js",
  "./src/scripts/pages/movie-detail.js",
  "./src/scripts/pages/profile.js?v=20260527a",
  "./src/scripts/pwa/network.js",
  "./src/scripts/pwa/sync-queue.js",
  "./src/scripts/pwa/init.js",
  "./src/styles/base/tokens.css",
  "./src/styles/base/reset.css",
  "./src/styles/base/utilities.css",
  "./src/styles/layouts/app-shell.css?v=20260524b",
  "./src/styles/components/history-ui.css?v=20260524b",
  "./src/styles/components/folder-card.css",
  "./src/styles/components/profile-button.css",
  "./src/styles/components/pwa-shell.css",
  "./src/styles/pages/watch-history.css",
  "./src/styles/pages/folders.css",
  "./src/styles/pages/info-page.css?v=20260527a",
  "./src/styles/pages/folder-create.css",
  "./src/styles/pages/folder-detail.css",
  "./src/styles/pages/movie-detail.css",
  "./src/styles/pages/profile.css",
  "./assets/bg_index.png",
  "./assets/logo-smotrix.png",
  "./assets/branding/logo-smotrix.png",
  "./assets/placeholders/watch-placeholder.png",
  "./assets/pwa/icon-180.png",
  "./assets/pwa/icon-192.png",
  "./assets/pwa/icon-512.png",
  "./assets/pwa/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== HTML_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, HTML_CACHE));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

function isApiRequest(url) {
  return url.pathname.includes("/api/") || url.pathname.endsWith("/health");
}

function isStaticAssetRequest(request) {
  return ["style", "script", "worker", "image", "font"].includes(request.destination);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return caches.match("./index.html");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cachedResponse || networkResponsePromise || fetch(request);
}
