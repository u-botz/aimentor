import { auth } from '@clerk/nextjs/server'
import { generateOpener } from '@/lib/opener-voice'
import type { SessionMode } from '@/lib/prompts/assemble'

// Safe per-mode fallback returned if something throws before generateOpener runs
// (e.g. auth failure propagated, malformed body). generateOpener has its own
// internal fallback map so this only fires for truly unexpected pre-call errors.
const ROUTE_FALLBACKS: Record<SessionMode, string> = {
  open_chat: "What's on your mind?",
  morning:   "What's the one thing today's about?",
  debrief:   "Let's get into it. How did today actually go?",
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { mode = 'open_chat' } = (await req.json()) as { mode?: SessionMode }

    // generateOpener handles its own errors internally and always returns a
    // string (falling back to per-mode templates). No try/catch needed around it.
    const opener = await generateOpener({ userId, mode })

    return Response.json({ opener })
  } catch (error) {
    console.error('Opener route error:', error)
    // Return a safe generic line — do not expose error details to the client.
    // Mode is unknown at this point so use the open_chat fallback.
    return Response.json({ opener: ROUTE_FALLBACKS.open_chat }, { status: 500 })
  }
}
