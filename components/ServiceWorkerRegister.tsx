'use client'

import { useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function subscribeAndSave(registration: ServiceWorkerRegistration) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
}

/**
 * Call this from a user gesture (a tap/click). iOS Safari only prompts for
 * notification permission inside a gesture handler, and only when the app is
 * installed to the home screen — so this MUST NOT run on page load.
 * Returns the resulting permission so callers can update their UI.
 */
export async function enableNotifications(): Promise<NotificationPermission> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return 'denied'
  }
  try {
    const registration = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      await subscribeAndSave(registration)
    }
    return permission
  } catch (err) {
    console.error('enableNotifications failed:', err)
    return Notification.permission
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')

        // Only RE-subscribe silently when the user has already granted
        // permission on a previous visit. Never call requestPermission() on
        // mount — iOS ignores non-gesture requests, and it's hostile on Android.
        if (
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          await subscribeAndSave(registration)
        }
      } catch (err) {
        console.error('Service worker registration failed:', err)
      }
    }

    register()
  }, [])

  return null
}
