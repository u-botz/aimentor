'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import {
  Sparkles,
  Brain,
  CheckSquare,
  TrendingDown,
  Flag,
  Sun,
  BarChart2,
  X,
  Check,
} from 'lucide-react'

// ─── Intersection-observer fade-in ────────────────────────────────────────────

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('opacity-100', 'translate-y-0')
          el.classList.remove('opacity-0', 'translate-y-6')
          observer.disconnect()
        }
      },
      { threshold: 0.12 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

// ─── Section wrapper with fade ────────────────────────────────────────────────

function FadeSection({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useFadeIn()
  return (
    <div
      ref={ref}
      className={`opacity-0 translate-y-6 transition-all duration-700 ease-out ${className}`}
    >
      {children}
    </div>
  )
}

// ─── Comparison rows ──────────────────────────────────────────────────────────

const COMPARISON_ROWS = [
  {
    other: 'Forgets you after every chat',
    ours: 'Remembers everything, compounds daily',
  },
  {
    other: 'Answers whatever you ask',
    ours: 'Asks the questions you need',
  },
  {
    other: 'Validates you by default',
    ours: 'Holds you to your own word',
  },
  {
    other: 'Resets every session',
    ours: 'Builds context over months',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { isLoaded, isSignedIn } = useUser()

  return (
    <div
      className="min-h-screen bg-[#0a0a0f] text-white font-sans antialiased"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* ── Global styles injected inline so we stay in one file ── */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50%       { opacity: 0.55; transform: scale(1.06); }
        }
        .glow-pulse { animation: pulse-glow 6s ease-in-out infinite; }
        .btn-glow:hover { box-shadow: 0 0 20px rgba(46,91,255,0.5); }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════
          1. NAVBAR
      ══════════════════════════════════════════════════════════════ */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 md:px-12">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#2E5BFF]" />
          <span className="text-sm font-semibold tracking-tight">
            AI Mentor
          </span>
        </Link>
        <div className="flex items-center gap-4">
          {isLoaded && isSignedIn ? (
            <Link
              href="/chat"
              className="btn-glow rounded-lg bg-[#2E5BFF] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2548d4]"
            >
              Go to app
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm text-[#6b7280] hover:text-white transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="btn-glow rounded-lg bg-[#2E5BFF] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2548d4]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════════
          2. HERO
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
        {/* Radial glow */}
        <div
          className="glow-pulse pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                      h-[600px] w-[600px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(46,91,255,0.22) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl">
          {/* Pill */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1f2937] bg-[#111118] px-3 py-1 text-xs font-medium text-[#6b7280]">
            <Sparkles className="h-3 w-3 text-[#2E5BFF]" />
            AI-powered accountability
          </span>

          {/* H1 */}
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            The only AI that&nbsp;remembers&nbsp;
            <br className="hidden md:block" />
            who you said you&apos;d&nbsp;be.
          </h1>

          {/* Subtext */}
          <p className="max-w-xl text-base leading-relaxed text-[#6b7280] md:text-lg">
            Most people know what they should do. They just don&apos;t do it
            consistently. Your AI mentor holds you to your own word — every
            single day.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {isLoaded && isSignedIn ? (
              <Link
                href="/chat"
                className="btn-glow rounded-lg bg-[#2E5BFF] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#2548d4]"
              >
                Go to your dashboard →
              </Link>
            ) : (
              <Link
                href="/sign-up"
                className="btn-glow rounded-lg bg-[#2E5BFF] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#2548d4]"
              >
                Get Started Free
              </Link>
            )}
            <a
              href="#how-it-works"
              className="rounded-lg border border-[#1f2937] px-6 py-3 text-sm font-medium text-[#6b7280] transition-colors hover:border-[#374151] hover:text-white"
            >
              See how it works
            </a>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[#374151]">
          <div className="h-8 w-px bg-gradient-to-b from-transparent to-[#374151]" />
          <span className="text-[10px] uppercase tracking-widest">scroll</span>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          3. PROBLEM
      ══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 md:px-12">
        <FadeSection className="mx-auto max-w-5xl">
          <p className="mb-12 text-center text-xs font-semibold uppercase tracking-widest text-[#2E5BFF]">
            Sound familiar?
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <Brain className="h-5 w-5" />,
                title: 'You already know what to do',
                body: "You've read the books, watched the videos, made the plans. The knowledge is there.",
              },
              {
                icon: <CheckSquare className="h-5 w-5" />,
                title: "You've tried apps and trackers",
                body: "Habit apps, journals, calendars. They worked for a week. Then life happened.",
              },
              {
                icon: <TrendingDown className="h-5 w-5" />,
                title: "You're still not consistent",
                body: "Not because you're lazy. Because nothing held you accountable to your own word.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="group rounded-2xl border border-[#1f2937] bg-[#111118] p-6 transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="mb-4 inline-flex rounded-lg bg-[#1a1a2e] p-2.5 text-[#2E5BFF]">
                  {card.icon}
                </div>
                <h3 className="mb-2 font-semibold text-white">{card.title}</h3>
                <p className="text-sm leading-relaxed text-[#6b7280]">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-14 text-center text-xl font-semibold leading-snug text-white md:text-2xl">
            The problem was never information.
            <br />
            <span className="text-[#2E5BFF]">It was accountability.</span>
          </p>
        </FadeSection>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          4. HOW IT WORKS
      ══════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="px-6 py-24 md:px-12">
        <FadeSection className="mx-auto max-w-5xl">
          <p className="mb-14 text-center text-xs font-semibold uppercase tracking-widest text-[#2E5BFF]">
            How it works
          </p>
          <div className="relative grid gap-8 md:grid-cols-3">
            {/* Connecting line (desktop only) */}
            <div className="absolute top-7 left-1/6 right-1/6 hidden h-px bg-[#1f2937] md:block" />

            {[
              {
                num: '01',
                icon: <Flag className="h-5 w-5" />,
                title: 'Set your rules',
                body: 'Tell it your goals, your non-negotiables, and how strict you want it to be.',
              },
              {
                num: '02',
                icon: <Sun className="h-5 w-5" />,
                title: 'Show up daily',
                body: 'Debrief every night in 10 minutes. Your mentor asks the right questions.',
              },
              {
                num: '03',
                icon: <BarChart2 className="h-5 w-5" />,
                title: 'Watch yourself change',
                body: "See patterns, streaks, and proof that you're becoming who you said you would.",
              },
            ].map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 mb-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2E5BFF] bg-[#0a0a0f] text-[#2E5BFF]">
                  {step.icon}
                </div>
                <span className="mb-1 text-xs font-bold tracking-widest text-[#2E5BFF]">
                  {step.num}
                </span>
                <h3 className="mb-2 font-semibold text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-[#6b7280]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </FadeSection>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          5. COMPARISON TABLE
      ══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 md:px-12">
        <FadeSection className="mx-auto max-w-3xl">
          <p className="mb-12 text-center text-xs font-semibold uppercase tracking-widest text-[#2E5BFF]">
            Not another AI chatbot
          </p>
          <div className="overflow-hidden rounded-2xl border border-[#1f2937]">
            {/* Header row */}
            <div className="grid grid-cols-2 border-b border-[#1f2937] bg-[#111118]">
              <div className="flex items-center gap-2 px-6 py-4 text-sm font-semibold text-[#6b7280]">
                <X className="h-4 w-4 text-red-500" />
                Other AI tools
              </div>
              <div className="flex items-center gap-2 border-l border-[#1f2937] px-6 py-4 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-[#2E5BFF]" />
                AI Mentor
              </div>
            </div>

            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-2 border-b border-[#1f2937] last:border-b-0 bg-[#0a0a0f] hover:bg-[#111118] transition-colors"
              >
                <div className="flex items-start gap-2.5 px-6 py-4 text-sm text-[#6b7280]">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500/70" />
                  {row.other}
                </div>
                <div className="flex items-start gap-2.5 border-l border-[#1f2937] px-6 py-4 text-sm text-white">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2E5BFF]" />
                  {row.ours}
                </div>
              </div>
            ))}
          </div>
        </FadeSection>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          6. QUOTE
      ══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 md:px-12">
        <FadeSection className="mx-auto max-w-2xl">
          <blockquote className="border-l-4 border-[#2E5BFF] pl-8">
            <p className="text-xl italic leading-relaxed text-white md:text-2xl">
              &ldquo;I already knew what I should do. I just needed something
              that wouldn&apos;t let me forget.&rdquo;
            </p>
            <footer className="mt-4 text-sm text-[#6b7280]">— Early user</footer>
          </blockquote>
        </FadeSection>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          7. FINAL CTA
      ══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-32 md:px-12">
        <FadeSection className="mx-auto max-w-xl text-center">
          <div className="relative overflow-hidden rounded-3xl border border-[#1f2937] bg-[#111118] px-8 py-16">
            {/* Inner glow */}
            <div
              className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 0%, rgba(46,91,255,0.12) 0%, transparent 70%)',
              }}
            />
            <div className="relative z-10 flex flex-col items-center gap-5">
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                Start your first session tonight.
              </h2>
              <p className="text-sm text-[#6b7280]">
                No credit card. No setup. Just show up.
              </p>
              {isLoaded && isSignedIn ? (
                <Link
                  href="/chat"
                  className="btn-glow mt-2 rounded-xl bg-[#2E5BFF] px-8 py-4 text-base font-semibold text-white transition-all hover:bg-[#2548d4]"
                >
                  Go to your dashboard →
                </Link>
              ) : (
                <>
                  <Link
                    href="/sign-up"
                    className="btn-glow mt-2 rounded-xl bg-[#2E5BFF] px-8 py-4 text-base font-semibold text-white transition-all hover:bg-[#2548d4]"
                  >
                    Create your free account →
                  </Link>
                  <p className="text-xs text-[#6b7280]">
                    Already have an account?{' '}
                    <Link
                      href="/sign-in"
                      className="text-white underline underline-offset-2 hover:text-[#2E5BFF] transition-colors"
                    >
                      Sign in
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </FadeSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1f2937] px-6 py-8 text-center text-xs text-[#374151] md:px-12">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-3 w-3 text-[#2E5BFF]" />
          <span>AI Mentor · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
