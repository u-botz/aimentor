/**
 * POST /api/tasks/detect
 *
 * Thin HTTP wrapper around detectAndCreateTask — useful for manual testing
 * and for external tooling.  The chat route calls the function directly
 * (no HTTP hop) for the real-time path.
 *
 * Body: { message: string, sessionId: string, sessionMode?: string }
 * Returns: { task: CreatedTask | null }
 */

import { auth } from '@clerk/nextjs/server'
import { detectAndCreateTask } from '@/lib/tasks/detect-task'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as {
      message: string
      sessionId: string
      sessionMode?: string
    }

    if (!body.message || !body.sessionId) {
      return Response.json({ error: 'message and sessionId are required' }, { status: 400 })
    }

    const task = await detectAndCreateTask(
      body.message,
      body.sessionId,
      userId,
      body.sessionMode ?? 'open_chat'
    )

    return Response.json({ task })
  } catch (err) {
    console.error('[/api/tasks/detect]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
