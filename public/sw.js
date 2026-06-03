// Bump this version whenever the caching strategy changes — the activate
// handler deletes every cache that doesn't match, purging stale entries
// (including the old precached "/" landing page).
const CACHE_NAME = 'ai-mentor-v2'

// Only the offline fallback is precached. The app shell ("/", "/dashboard", …)
// is intentionally NOT cached so auth redirects and fresh HTML always win.
const APP_SHELL = ['/offline.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  // HTML page loads (navigations) are NEVER cached and always go to the network.
  // This guarantees auth redirects (e.g. "/" → "/dashboard") and fresh app HTML
  // are honored, and the stale marketing page can never be replayed from cache.
  // Only when the network is truly unavailable do we fall back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match('/offline.html')
        return offline ?? Response.error()
      })
    )
    return
  }

  // Static assets (JS/CSS/images/fonts/etc.): network-first, cache on success,
  // fall back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        throw new Error('Network unavailable and no cache match')
      })
  )
})

self.addEventListener('push', function (event) {
  const data = event.data?.json() ?? {}
  const title = data.title || 'AI Mentor'
  const options = {
    body: data.body || "Your mentor is waiting.",
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'debrief-reminder',
    renotify: true,
    data: { url: data.url || '/chat?mode=debrief' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = event.notification.data?.url || '/chat?mode=debrief'
  event.waitUntil(
    clients.openWindow(new URL(url, self.location.origin).href)
  )
})
