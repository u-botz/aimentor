import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AppShell } from '@/components/AppShell'

type CardRow = {
  id: string
  title: string
  body: string
  seen_at: string | null
  created_at: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function CardsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { data } = await supabaseAdmin
    .from('milestone_cards')
    .select('id, title, body, seen_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const cards = (data ?? []) as CardRow[]

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 p-5">
        <header className="pl-8 md:pl-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Milestones
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            The moments you earned. Quiet proof of who you said you&apos;d be.
          </p>
        </header>

        {cards.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-8 text-center">
            <p className="text-sm text-zinc-400">No milestones yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Keep your word, and they&apos;ll start showing up here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cards.map((card) => {
              const unseen = card.seen_at === null
              return (
                <li key={card.id}>
                  <Link
                    href={`/card/${card.id}`}
                    className="group block rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {unseen && (
                          <span
                            aria-label="New"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2E5BFF]"
                          />
                        )}
                        {card.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-600">
                        {formatDate(card.created_at)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-200">
                      {card.body}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
