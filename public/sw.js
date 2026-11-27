// Lightweight service worker for PWA installability and cache-first immutable static assets (F-7.2).
// Never caches authenticated HTML, API responses, or RSC payloads so shared devices never leak data.
const CACHE = "qrfeed-static-v3"
const STATIC_URLS = ["/favicon.ico", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_URLS).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

function isImmutableStatic(url) {
  return url.pathname.startsWith("/_next/static/")
}

function isCacheableStatic(url) {
  return (
    isImmutableStatic(url) ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/manifest.webmanifest"
  )
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !isCacheableStatic(url)) return

  // Content-hashed /_next/static/* bundles are immutable: serve cache-first for instant loads.
  if (isImmutableStatic(url)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request)
            .then((res) => {
              if (res && res.status === 200) {
                const clone = res.clone()
                caches.open(CACHE).then((c) => c.put(event.request, clone)).catch(() => {})
              }
              return res
            })
            .catch(
              () =>
                new Response("Offline", {
                  status: 503,
                  headers: { "Content-Type": "text/plain" },
                }),
            ),
      ),
    )
    return
  }

  // Manifest and icons use network-first with cache fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(event.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        return (
          cached ??
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
        )
      }),
  )
})
