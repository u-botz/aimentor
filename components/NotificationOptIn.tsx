'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { enableNotifications } from './ServiceWorkerRegister'

const DISMISS_KEY = 'notif-optin-dismissed'

// iOS only delivers web push from an installed (standalone) PWA. Detect it so we
// can guide iPhone users to "Add to Home Screen" instead of prompting in-tab,
// where requestPermission() would throw.
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function NotificationOptIn() {
  const [show, setShow] = useState(false)
  const [needsInstall, setNeedsInstall] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    setNeedsInstall(isIOS() && !isStandalone())
    setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  const handleEnable = async () => {
    if (needsInstall) return
    setBusy(true)
    const result = await enableNotifications()
    setBusy(false)
    if (result !== 'default') setShow(false)
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#2E5BFF]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">Stay on track</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {needsInstall
            ? 'Add this app to your Home Screen first (Share → Add to Home Screen), then open it to enable reminders.'
            : 'Get a nudge for your morning intention and nightly debrief.'}
        </p>
        {!needsInstall && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="mt-2 rounded-lg bg-[#2E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2548d4] disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-zinc-600 hover:text-zinc-400"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
