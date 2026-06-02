'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type DashboardData = {
  streaks: {
    debrief: number
    hydration: number
    clean: number
  }
  recentScores: { date: string; score: number }[]
  weeklyAverage: number
  todaysPriority: string | null
  openCommitments: { commitment: string; date: string }[]
  totalDebriefs: number
  longestStreak: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading || !data) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#0a0a0f] text-zinc-100">
        <div className="mx-auto w-full max-w-[480px] flex-1 p-5 animate-pulse">
          <div className="h-8 w-1/3 bg-zinc-800 rounded mb-6 mt-2"></div>
          
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="h-28 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
            <div className="h-28 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
            <div className="h-28 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
          </div>
          
          <div className="h-48 bg-zinc-900/50 rounded-xl border border-zinc-800 mb-8 p-4"></div>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="h-40 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
            <div className="h-40 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
          </div>
        </div>
      </div>
    )
  }

  const { streaks, recentScores, weeklyAverage, todaysPriority, openCommitments } = data

  const getDayLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] text-zinc-100">
      <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col p-5">
        
        <h1 className="text-2xl font-semibold tracking-tight mb-6 mt-2">Dashboard</h1>
        
        {/* Top row - Streaks */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center shadow-sm">
            <span className="text-2xl mb-1.5">🔥</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Debrief</span>
            <span className="text-sm font-medium mt-0.5">{streaks.debrief} {streaks.debrief === 1 ? 'day' : 'days'}</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center shadow-sm">
            <span className="text-2xl mb-1.5">💧</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Hydration</span>
            <span className="text-sm font-medium mt-0.5">{streaks.hydration} {streaks.hydration === 1 ? 'day' : 'days'}</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center shadow-sm">
            <span className="text-2xl mb-1.5">✅</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Clean</span>
            <span className="text-sm font-medium mt-0.5">{streaks.clean} {streaks.clean === 1 ? 'day' : 'days'}</span>
          </div>
        </div>

        {/* Middle row - Score Graph */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-8 shadow-sm">
          <div className="flex justify-between items-baseline mb-6">
            <h2 className="text-sm font-medium text-zinc-300">Weekly Score</h2>
            <div className="text-right">
              <span className="text-2xl font-semibold">{weeklyAverage}</span>
              <span className="text-xs text-zinc-500 ml-1">avg</span>
            </div>
          </div>
          
          <div className="h-32 flex items-end justify-between gap-2.5">
            {recentScores.length > 0 ? recentScores.map((item, i) => (
              <div key={i} className="flex flex-col items-center w-full h-full justify-end gap-2.5">
                <div className="w-full bg-[#1a1a2e] rounded-t-md h-full flex items-end relative group shadow-inner">
                  <div 
                    className="w-full bg-[#2E5BFF] rounded-t-md transition-all relative"
                    style={{ height: `${(item.score / 10) * 100}%`, minHeight: '4px' }}
                  >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.score}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-500 font-medium">{getDayLabel(item.date)}</span>
              </div>
            )) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-zinc-500">
                No recent scores
              </div>
            )}
          </div>
        </div>

        {/* Below that - Two columns */}
        <div className="grid grid-cols-2 gap-4 mb-8 flex-1">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col shadow-sm">
            <h2 className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-3">Today's Priority</h2>
            <p className="text-sm text-zinc-200 leading-relaxed font-medium">
              {todaysPriority ? todaysPriority : "Complete tonight's debrief to set one."}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col shadow-sm max-h-[240px] overflow-y-auto custom-scrollbar">
            <h2 className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-3">Open Commitments</h2>
            {openCommitments.length > 0 ? (
              <ul className="space-y-4">
                {openCommitments.map((c, i) => (
                  <li key={i} className="text-sm flex flex-col gap-1.5">
                    <span className="text-zinc-200 leading-snug">{c.commitment}</span>
                    <span className="text-[10px] text-zinc-500">{new Date(c.date).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 mt-2">No open commitments.</p>
            )}
          </div>
        </div>

        {/* Bottom CTA */}
        <button
          onClick={() => router.push('/chat')}
          className={cn(
            'w-full rounded-xl py-3.5 text-sm font-medium text-white transition-all mt-auto',
            'bg-[#2E5BFF] hover:bg-[#2548d4] shadow-md hover:shadow-lg focus:ring-2 focus:ring-[#2E5BFF]/50 outline-none'
          )}
        >
          Start Tonight's Debrief
        </button>
      </div>
    </div>
  )
}
