'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The payoff screen. Full-screen, near-black, no chrome. Reveals in beats:
 *   1. the mentor's line fades up out of the dark
 *   2. a short pause
 *   3. the quiet line of evidence appears
 *   4. a single understated button fades in
 * Pure CSS transitions driven by a staged timeline — no animation library.
 */
export function CardReveal({
  title,
  body,
  evidenceLine,
}: {
  title: string
  body: string
  evidenceLine: string
}) {
  const router = useRouter()
  // 0 black · 1 body · 2 evidence · 3 button
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),
      setTimeout(() => setStage(2), 2600),
      setTimeout(() => setStage(3), 3800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const fade = (visible: boolean, translate = false) =>
    [
      'transition-all duration-[1400ms] ease-out',
      visible
        ? 'opacity-100 translate-y-0'
        : `opacity-0 ${translate ? 'translate-y-2' : ''}`,
    ].join(' ')

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#050507] px-6 text-center text-zinc-100">
      {/* faint warm glow that breathes in with the reveal */}
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]',
          'bg-[#2E5BFF]/10 transition-opacity duration-[2200ms] ease-out',
          stage >= 1 ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      <div className="relative flex w-full max-w-md flex-col items-center gap-8">
        <p
          className={[
            'text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500',
            fade(stage >= 1),
          ].join(' ')}
        >
          {title}
        </p>

        <p
          className={[
            'text-balance text-xl font-medium leading-relaxed text-zinc-100 sm:text-2xl',
            fade(stage >= 1, true),
          ].join(' ')}
        >
          {body}
        </p>

        <p
          className={[
            'text-sm text-zinc-500',
            fade(stage >= 2, true),
          ].join(' ')}
        >
          {evidenceLine}
        </p>

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className={[
            'mt-2 rounded-full border border-zinc-700/70 px-6 py-2 text-sm font-medium text-zinc-300',
            'transition-colors hover:border-zinc-500 hover:text-zinc-100',
            fade(stage >= 3),
          ].join(' ')}
          tabIndex={stage >= 3 ? 0 : -1}
        >
          I see it
        </button>
      </div>
    </main>
  )
}
