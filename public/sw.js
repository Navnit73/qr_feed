// Lightweight service worker for PWA installability and offline shell tolerance (F-7.2).
const CACHE = "qrfeed-shell-v1"
const SHELL_URLS = ["/", "/dashboard", "/my-work", "/audits"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(event.request)),
  )
})
