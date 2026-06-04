import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { CardReveal } from './CardReveal'

type Evidence = {
  commitment?: string
  made_on?: string | null
  resolved_on?: string | null
  days_held?: number
}

// "Committed 12 days ago. Kept." — a single quiet line of proof.
function evidenceLine(evidence: Evidence | null): string {
  const days = evidence?.days_held ?? 0
  if (days > 0) {
    return `Committed ${days} ${days === 1 ? 'day' : 'days'} ago. Kept.`
  }
  return 'You said you would. You did.'
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Invalid uuid → PostgREST errors; treat any miss as not found.
  const { data: card, error } = await supabaseAdmin
    .from('milestone_cards')
    .select('id, user_id, title, body, evidence, seen_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !card || card.user_id !== userId) notFound()

  // Mark seen on open, preserving the first-seen timestamp.
  if (!card.seen_at) {
    await supabaseAdmin
      .from('milestone_cards')
      .update({ seen_at: new Date().toISOString() })
      .eq('id', card.id)
      .eq('user_id', userId)
  }

  return (
    <CardReveal
      title={card.title}
      body={card.body}
      evidenceLine={evidenceLine(card.evidence as Evidence | null)}
    />
  )
}
