import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString, shiftDateString } from '@/lib/date'
import { generateMilestoneCard, type MilestoneEvidence } from '@/lib/milestone-voice'

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('x-cron-secret') === secret) return true
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

type CandidateUser = {
  id: string
  name: string | null
}

// Whole IST days between two YYYY-MM-DD strings. Parsed in UTC so it never rolls
// over due to the host timezone.
function daysBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// Mentor-voice notification copy that withholds what the card actually says.
// Picked at random so repeat days never read identically.
const REVEAL_TEASERS = [
  "Open the app. There's something I want to show you.",
  'Come in when you can. I noticed something today.',
  "There's something worth seeing in here. Open the app.",
  'Stop by the app. I have something for you.',
  "Something landed today. It's waiting for you in the app.",
]

function revealTeaser(): string {
  return REVEAL_TEASERS[Math.floor(Math.random() * REVEAL_TEASERS.length)]
}

// ── Route ─────────────────────────────────────────────────────────────────────
// Called once daily by cron-job.org. Detects the single most recent kept
// commitment per user, generates a milestone card in the mentor's voice, stores
// it, and sends a content-withholding push. Idempotent: at most one card per
// user per day, never stacks on an unseen card, never re-cards a commitment.

export async function GET(req: Request) {
  try {
    if (!isValidCronRequest(req)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const todayIST = istDateString()
    // Daily cron — look back two IST days so a late resolution isn't missed if a
    // run lands before it. Per-commitment dedup below prevents double-carding.
    const sinceIST = shiftDateString(todayIST, -1)

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    // 1. Fetch all users that have a push subscription.
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select(`
        subscription,
        users (
          id,
          name
        )
      `)

    if (rowsError) {
      console.error('push_subscriptions query error:', rowsError)
      return new Response('DB error', { status: 500 })
    }

    // Dedupe to one subscription per user so multiple devices don't double-fire.
    const candidates = new Map<
      string,
      { user: CandidateUser; subscription: webpush.PushSubscription }
    >()

    for (const row of rows ?? []) {
      const rawUser = row.users
      const user = (Array.isArray(rawUser) ? rawUser[0] : rawUser) as
        | CandidateUser
        | null
      if (!user?.id || !row.subscription) continue
      if (!candidates.has(user.id)) {
        candidates.set(user.id, {
          user,
          subscription: row.subscription as webpush.PushSubscription,
        })
      }
    }

    let fired = 0

    for (const { user, subscription } of candidates.values()) {
      const userId = user.id
      try {
        // ── Guard A: already fired a card today → skip before generating ──────
        const { data: cardToday } = await supabaseAdmin
          .from('milestone_cards')
          .select('id')
          .eq('user_id', userId)
          .eq('kind', 'commitment_kept')
          .eq('fired_date', todayIST)
          .limit(1)
          .maybeSingle()
        if (cardToday) continue

        // ── Guard B: don't stack gifts — an unseen card already waits ─────────
        const { data: unseen } = await supabaseAdmin
          .from('milestone_cards')
          .select('id')
          .eq('user_id', userId)
          .is('seen_at', null)
          .limit(1)
          .maybeSingle()
        if (unseen) continue

        // ── Detect: most recently kept commitment within the window ──────────
        const { data: kept } = await supabaseAdmin
          .from('open_commitments')
          .select('id, commitment, made_on, resolved_on')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .not('resolved_on', 'is', null)
          .gte('resolved_on', sinceIST)
          .order('resolved_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!kept || !kept.commitment?.trim()) continue

        // ── Guard C: this exact commitment was already carded ────────────────
        const { data: alreadyCarded } = await supabaseAdmin
          .from('milestone_cards')
          .select('id')
          .eq('user_id', userId)
          .eq('kind', 'commitment_kept')
          .eq('evidence->>commitment_id', kept.id)
          .limit(1)
          .maybeSingle()
        if (alreadyCarded) continue

        const evidence: MilestoneEvidence & { commitment_id: string } = {
          commitment: kept.commitment.trim(),
          made_on: kept.made_on ?? null,
          resolved_on: kept.resolved_on ?? null,
          days_held: daysBetween(kept.made_on, kept.resolved_on),
          commitment_id: kept.id,
        }

        // ── Generate. If generation AND its fallback fail, do NOT fire ───────
        let card
        try {
          card = await generateMilestoneCard({
            name: user.name ?? '',
            kind: 'commitment_kept',
            evidence,
          })
        } catch (genErr) {
          console.error(`Milestone generation failed — user ${userId}:`, genErr)
          continue
        }
        if (!card?.body?.trim()) continue

        // ── Insert. Upsert-ignoreDuplicates on (user_id, kind, fired_date) so a
        //    racing run can't double-fire; only the run that actually inserts
        //    the row (returns it) proceeds to push.
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('milestone_cards')
          .upsert(
            {
              user_id: userId,
              kind: 'commitment_kept',
              title: card.title,
              body: card.body.trim(),
              evidence,
              fired_date: todayIST,
            },
            { onConflict: 'user_id,kind,fired_date', ignoreDuplicates: true }
          )
          .select('id')
          .maybeSingle()

        if (insertErr) {
          console.error(`milestone_cards insert failed — user ${userId}:`, insertErr)
          continue
        }
        if (!inserted) continue // another run already created today's card

        // ── Push (content withheld) ──────────────────────────────────────────
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: 'AI Mentor',
              body: revealTeaser(),
              url: `/card/${inserted.id}`,
              cardId: inserted.id,
            })
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('user_id', userId)
            console.warn(`Removed expired subscription for user ${userId}`)
            // Card still exists; it'll surface in the library and dashboard.
          } else {
            console.error(`Milestone push failed — user ${userId}:`, err)
          }
        }

        // ── Log the push for kind/date idempotency across racing cron runs ───
        await supabaseAdmin.from('notification_log').upsert(
          { user_id: userId, kind: 'milestone', sent_date: todayIST },
          { onConflict: 'user_id,kind,sent_date', ignoreDuplicates: true }
        )

        fired += 1
      } catch (err) {
        console.error(`Milestone run failed — user ${userId}:`, err)
      }
    }

    return Response.json({ success: true, fired, checked: candidates.size })
  } catch (error) {
    console.error('Cron milestones error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
