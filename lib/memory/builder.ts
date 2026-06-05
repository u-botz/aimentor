import Anthropic from '@anthropic-ai/sdk'
import { resolveModel } from '@/lib/model-router'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString } from '@/lib/date'
import type { BuilderExtract } from './builder-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BUILDER_SYSTEM_PROMPT =
  'You are a silent observer building a deep model of a person from their conversation with their mentor.\n' +
  'Your job is to extract what is genuinely worth remembering — not everything, but not nothing.\n\n' +
  'WHAT TO CAPTURE:\n' +
  'Facts (user_facts) — timeless things that are simply true about this person:\n' +
  '  formative: childhood, loss, family, identity-shaping experiences. No event_date — these are bedrock.\n' +
  '  pattern:   recurring behaviors, tendencies, how they respond under pressure, what they avoid.\n' +
  '  strength:  demonstrated capabilities, what they are good at, what they push through.\n' +
  '  red_flag:  concerning tendencies — avoidance, self-sabotage, repeated failures, unhealthy patterns.\n\n' +
  'Events (user_events) — things that happened on the timeline, with an arc:\n' +
  '  Capture: conflicts, setbacks, wins, decisions, significant conversations, milestones.\n' +
  '  event_date: use today\'s date (YYYY-MM-DD) for things happening now. Null only for undated past events.\n' +
  '  avoidable: true if better preparation or behavior could have prevented it. false for external events.\n' +
  '  domain: work | health | finance | personal — pick the primary one.\n' +
  '  arc: how it unfolded, what they did, how they are carrying it. Not a label — a case study.\n\n' +
  'WEIGHT RULES — be discriminating:\n' +
  '  high: life-changing, identity-level, or highly recurring. Use sparingly.\n' +
  '  medium: notable and worth remembering. Default for most captures.\n' +
  '  low: minor pattern or small event. Use when it is worth noting but not significant.\n\n' +
  'WHAT NOT TO CAPTURE:\n' +
  '  - Small talk, greetings, procedural exchanges ("hey", "thanks", "got it")\n' +
  '  - Things the user already told the mentor explicitly (onboarding data)\n' +
  '  - Anything that would feel invasive or clinical if the person read it back\n\n' +
  'Today\'s date for event_date reference: ' + new Date().toISOString().split('T')[0] + '\n\n' +
  'Return ONLY valid JSON. No preamble. No markdown. No explanation.\n' +
  '{\n' +
  '  "facts": [ { "fact": string, "category": "formative"|"pattern"|"strength"|"red_flag", "weight": "high"|"medium"|"low" } ],\n' +
  '  "events": [ { "what_happened": string, "arc": string|null, "event_date": "YYYY-MM-DD"|null, "avoidable": boolean|null, "domain": "work"|"health"|"finance"|"personal"|null, "weight": "high"|"medium"|"low" } ],\n' +
  '  "commitments_made": [ string ],\n' +
  '  "commitments_resolved": [ string ]\n' +
  '}'

export type BuilderSweepResult =
  | { skipped: true; reason: string }
  | { success: true; facts: number; events: number; commitments: number }

export async function runBuilderSweep(
  userId: string,
  sessionId: string,
  messages: { role: string; content: string }[],
  opts?: { live?: boolean }
): Promise<BuilderSweepResult> {
  try {
    if (messages.length === 0) {
      return { skipped: true, reason: 'No messages' }
    }

    // ── Model call ─────────────────────────────────────────────────────────────
    const conversationText = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: resolveModel('fast'),
      max_tokens: 1024,
      system: BUILDER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    })

    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Strip markdown fences the model occasionally emits despite instructions.
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    const jsonText = jsonMatch ? jsonMatch[0] : cleaned

    let extracted: BuilderExtract
    try {
      extracted = JSON.parse(jsonText) as BuilderExtract
    } catch {
      console.error('[builder] JSON parse failed for session', sessionId, '— raw:', rawText)
      return { skipped: true, reason: 'JSON parse failed' }
    }

    const today = istDateString()
    const facts = extracted.facts ?? []
    const events = extracted.events ?? []
    const commitmentsMade = (extracted.commitments_made ?? []).filter(
      (c): c is string => typeof c === 'string' && c.trim().length > 0
    )
    const commitmentsResolved = (extracted.commitments_resolved ?? []).filter(
      (c): c is string => typeof c === 'string' && c.trim().length > 0
    )

    // ── Write 1: facts → user_facts ────────────────────────────────────────────
    if (facts.length > 0) {
      try {
        const { error } = await supabaseAdmin.from('user_facts').insert(
          facts.map((f) => ({
            user_id: userId,
            fact: f.fact,
            category: f.category,
            weight: f.weight,
            source: sessionId,
          }))
        )
        if (error) {
          console.error('[builder] user_facts insert failed for session', sessionId, ':', error)
        }
      } catch (err) {
        console.error('[builder] user_facts insert threw for session', sessionId, ':', err)
      }
    }

    // ── Write 2: events → user_events ──────────────────────────────────────────
    if (events.length > 0) {
      try {
        const { error } = await supabaseAdmin.from('user_events').insert(
          events.map((e) => ({
            user_id: userId,
            event_date: e.event_date ?? null,
            what_happened: e.what_happened,
            arc: e.arc ?? null,
            avoidable: e.avoidable ?? null,
            domain: e.domain ?? null,
            weight: e.weight,
            session_id: sessionId,
          }))
        )
        if (error) {
          console.error('[builder] user_events insert failed for session', sessionId, ':', error)
        }
      } catch (err) {
        console.error('[builder] user_events insert threw for session', sessionId, ':', err)
      }
    }

    // ── Write 3: commitments_made → open_commitments ───────────────────────────
    if (commitmentsMade.length > 0) {
      try {
        const { error } = await supabaseAdmin.from('open_commitments').insert(
          commitmentsMade.map((text) => ({
            user_id: userId,
            session_id: sessionId,
            commitment: text.trim(),
            made_on: today,
            status: 'open',
          }))
        )
        if (error) {
          console.error('[builder] open_commitments insert failed for session', sessionId, ':', error)
        }
      } catch (err) {
        console.error('[builder] open_commitments insert threw for session', sessionId, ':', err)
      }
    }

    // ── Write 4: commitments_resolved → fuzzy-match update ────────────────────
    // Each resolve is its own try/catch — one bad fuzzy match must not block the rest.
    for (const item of commitmentsResolved) {
      try {
        const { error } = await supabaseAdmin
          .from('open_commitments')
          .update({ status: 'resolved', resolved_on: today })
          .eq('user_id', userId)
          .eq('status', 'open')
          .ilike('commitment', `%${item}%`)
        if (error) {
          console.error('[builder] resolve commitment failed for session', sessionId, ':', error)
        }
      } catch (err) {
        console.error('[builder] resolve commitment threw for session', sessionId, ':', err)
      }
    }

    // ── Race guard ─────────────────────────────────────────────────────────────
    // When opts.live is true (per-turn hook) this sweep is append-only.
    // Concurrent live turns must never clobber each other on user_profile.
    // The deep sweep (live not set) is where profile prose rendering and
    // how_well_known updates will be added in the next task.
    if (!opts?.live) {
      // Profile rendering work goes here — added in next task.
    }

    return {
      success: true,
      facts: facts.length,
      events: events.length,
      commitments: commitmentsMade.length,
    }
  } catch (err) {
    // Top-level guard: never throw to caller (safe for fire-and-forget).
    console.error('[builder] sweep failed for session', sessionId, ':', err)
    return { skipped: true, reason: 'Unexpected error' }
  }
}
