const CACHE_NAME = 'ai-mentor-v1'

const APP_SHELL = ['/', '/offline.html']

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

        if (request.mode === 'navigate') {
          const offline = await caches.match('/offline.html')
          if (offline) return offline
        }

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
