/**
 * Real-time task detection for the AI Mentor.
 *
 * detectAndCreateTask  — called fire-and-forget from the chat route after every
 *   assistant message.  Runs a fast Haiku classification call; if the mentor
 *   just assigned a task it is persisted to mentor_tasks immediately so the UI
 *   can show it via Supabase realtime rather than waiting for session extraction.
 *
 * De-duplication:
 *   The extraction pipeline (which runs at End Session) is kept as a safety net.
 *   To stop it creating rows that already exist, run this migration once:
 *
 *   ALTER TABLE mentor_tasks
 *   ADD CONSTRAINT mentor_tasks_session_title_unique
 *   UNIQUE (source_session_id, title);
 *
 *   With that constraint in place, the insert below uses ON CONFLICT DO NOTHING
 *   and the extraction upsert can reference the same conflict target — neither
 *   path will ever create a duplicate.
 *
 * Realtime:
 *   IMPORTANT: Enable realtime for the mentor_tasks table in Supabase Dashboard
 *   → Database → Replication → mentor_tasks → toggle ON.
 *   The client-side subscriptions in Tasks page, Home page, and BottomNav all
 *   depend on this being enabled.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import { streamChat, resolveModel } from '@/lib/model-router'
import { istDateString, shiftDateString } from '@/lib/date'

// ─── Types ────────────────────────────────────────────────────────────────────

type DetectionResult = {
  task_assigned: boolean
  title: string | null
  context: string | null
  due_date: string | null
}

export type CreatedTask = {
  id: string
  title: string
  context: string | null
  due_date: string | null
  source_mode: string | null
  source_date: string
  status: 'open'
}

// ─── Heuristic gate ───────────────────────────────────────────────────────────
// Skip the Haiku call entirely when the message clearly cannot contain a task
// assignment — saves cost on the majority of mentor messages (questions,
// reflections, acknowledgements).

const TASK_SIGNAL = /\btask\b|your task|task set|task assigned|i'?ll check\s+(?:if\s+)?it'?s\s+done|i'?m watching|by tonight|by tomorrow|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|done\.\s+i'?ll/i

function looksLikeTaskAssignment(text: string): boolean {
  return TASK_SIGNAL.test(text)
}

// ─── Detection prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a task detection assistant for an AI accountability mentor app.

Your job: determine whether the mentor's message assigns a concrete task to the user.

A task IS assigned when the message contains:
- Explicit assignment: "Your task:", "Task set:", "Done. Task:", "Task assigned:"
- Commitment language with a named deliverable: "your task for tonight", "I'll check if it's done", "I'm watching for it"
- A directive with a specific action + deadline (implied or explicit)

A task is NOT assigned when:
- The mentor only asks a question
- The mentor reflects, acknowledges, or validates
- The mentor gives general advice without naming a specific action
- The message is motivational but has no concrete deliverable

If a task IS assigned, extract:
- title: the core action in 10 words or fewer, starting with a verb ("Log all expenses from today", "Send the email to your CA")
- context: one short sentence explaining why it was assigned, or null
- due_date: YYYY-MM-DD if a date is mentioned; resolve relative dates using the date provided in the user message; null if no date is mentioned

Return ONLY valid JSON — no preamble, no markdown fences:
{"task_assigned": boolean, "title": string | null, "context": string | null, "due_date": string | null}`

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Checks whether `message` (an assistant turn) contains a task assignment.
 * If yes, inserts a row into mentor_tasks and returns the created task.
 * Returns null if no task was assigned or if detection/insertion fails.
 *
 * This function is designed to be called fire-and-forget — it never throws.
 */
export async function detectAndCreateTask(
  message: string,
  sessionId: string,
  userId: string,
  sessionMode: string = 'open_chat'
): Promise<CreatedTask | null> {
  // Very short messages can't contain task assignments
  if (message.trim().length < 25) return null

  // Cheap heuristic: only pay for a Haiku call when task-like words appear
  if (!looksLikeTaskAssignment(message)) return null

  try {
    const today = istDateString()
    const tomorrow = shiftDateString(today, 1)

    const userMessage =
      `TODAY (IST): ${today}\nTOMORROW (IST): ${tomorrow}\n\nMentor message:\n${message}`

    const stream = await streamChat(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userMessage }],
      resolveModel('fast'),
      // Small token budget — the response is always a tiny JSON object
      128
    )

    // Collect streamed text
    let raw = ''
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        raw += chunk.delta.text
      }
    }

    // Strip any accidental markdown fences and isolate the JSON object
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    const jsonText = jsonMatch ? jsonMatch[0] : cleaned

    let detection: DetectionResult
    try {
      detection = JSON.parse(jsonText) as DetectionResult
    } catch {
      console.warn('[task-detect] JSON parse failed. Raw:', raw)
      return null
    }

    if (!detection.task_assigned || !detection.title?.trim()) {
      return null
    }

    const title = detection.title.trim()

    // Insert into mentor_tasks.
    // If the unique constraint mentor_tasks_session_title_unique exists,
    // a duplicate (same session + same title) is silently ignored.
    const { data: task, error } = await supabaseAdmin
      .from('mentor_tasks')
      .insert({
        user_id: userId,
        title,
        context: detection.context?.trim() ?? null,
        due_date: detection.due_date ?? null,
        source_session_id: sessionId,
        source_mode: sessionMode,
        source_date: today,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      // 23505 = unique_violation — duplicate, not a real error
      if (error.code === '23505') return null
      console.error('[task-detect] DB insert failed:', error.message)
      return null
    }

    console.log(`[task-detect] Task created: "${title}" for session ${sessionId}`)

    return {
      id: task.id,
      title: task.title,
      context: task.context ?? null,
      due_date: task.due_date ?? null,
      source_mode: task.source_mode ?? null,
      source_date: task.source_date ?? today,
      status: 'open',
    }
  } catch (err) {
    console.error('[task-detect] Unexpected error:', err)
    return null
  }
}
