import { auth } from '@clerk/nextjs/server'
import { rewriteMemory } from '@/lib/memory/rewrite'

export async function POST() {
  try {
    // Step 1 — Auth
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const result = await rewriteMemory(userId)
    return Response.json(result)
  } catch (error) {
    console.error('Memory rewrite error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
