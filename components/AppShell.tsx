'use client'

/**
 * Simple content wrapper for non-chat pages.
 * Adds bottom padding so content clears the fixed BottomNav.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0A0A0A] text-[#F5F5F5]">
      <div
        className="pb-24"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
    </div>
  )
}
