export type UserFact = {
  id: string
  user_id: string
  fact: string
  category: 'formative' | 'pattern' | 'strength' | 'red_flag'
  weight: 'high' | 'medium' | 'low'
  source?: string
  created_at: string
}

export type UserEvent = {
  id: string
  user_id: string
  event_date: string | null
  what_happened: string
  arc?: string | null
  avoidable?: boolean | null
  domain?: 'work' | 'health' | 'finance' | 'personal' | null
  weight: 'high' | 'medium' | 'low'
  session_id?: string | null
  created_at: string
}

export type UserProfileRow = {
  user_id: string
  profile_prose: string
  how_well_known: number
  last_swept_at: string
  last_rendered: string | null
  created_at: string
}

// The JSON the builder model returns for each sweep.
export type BuilderExtract = {
  facts: Array<{
    fact: string
    category: 'formative' | 'pattern' | 'strength' | 'red_flag'
    weight: 'high' | 'medium' | 'low'
  }>
  events: Array<{
    what_happened: string
    arc: string | null
    event_date: string | null
    avoidable: boolean | null
    domain: 'work' | 'health' | 'finance' | 'personal' | null
    weight: 'high' | 'medium' | 'low'
  }>
  commitments_made: string[]
  commitments_resolved: string[]
}
