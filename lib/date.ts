// IST-anchored date helpers.
// The whole app is built for an India (Asia/Kolkata) audience and treats a
// "day" as an IST calendar day. Storing/reading dates in UTC caused late-night
// debriefs (00:00–05:30 IST) to land on the previous calendar day and break
// streaks + "done today" detection. Everything date-related goes through here.

const IST_TIMEZONE = 'Asia/Kolkata'

/**
 * Returns the IST calendar date for `d` as a `YYYY-MM-DD` string.
 * en-CA formats as ISO (YYYY-MM-DD).
 */
export function istDateString(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE })
}

/**
 * Shifts a plain `YYYY-MM-DD` date string by `deltaDays` and returns a new
 * `YYYY-MM-DD` string. Parsed/computed in UTC so it never rolls over due to the
 * host machine's local timezone or DST.
 */
export function shiftDateString(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}
