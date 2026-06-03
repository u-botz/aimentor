'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { AppSidebar } from './AppSidebar'

/**
 * Page shell for non-chat pages (dashboard, profile). Renders the persistent
 * sidebar (in navigation mode) plus a scrollable content area with a mobile
 * hamburger. On md+ the sidebar is always visible.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex h-dvh overflow-hidden bg-[#0a0a0f] text-zinc-100">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle sidebar"
          className="absolute left-4 top-5 z-10 text-zinc-400 transition-colors hover:text-zinc-200 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  )
}
