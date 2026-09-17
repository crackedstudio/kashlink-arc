/**
 * Usage analytics: how many people use KashLink and how much value flows through it.
 *
 * SAFETY RULE — this module never reads `location`. A KashLink URL carries the link's private key in
 * its #fragment, so anything that logged the page URL would ship spendable keys to a third party.
 * Every value sent from here is passed in explicitly by the caller, and reviewed below:
 *
 *   type          which lifecycle step happened
 *   value_units   the amount in native USDC wei (18 decimals), for volume
 *   link_address  the link's PUBLIC address — safe to store (spending needs the key, not the address)
 *                 and it lets any number in the dashboard be re-checked on-chain
 *   device_id     a random id generated on this device; not a wallet address, not a person
 *
 * Never add the key, the user's wallet address, or anything derived from the URL.
 */

const URL_BASE = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ENABLED = !!(URL_BASE && ANON_KEY)

const DEVICE_KEY = 'kashlink-device'

function randomId(): string {
  // crypto.randomUUID needs a secure context, which a http:// LAN dev URL is not.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** Stable per-install id. Resets if the user clears site data — fine, this only counts usage. */
function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const created = randomId()
    localStorage.setItem(DEVICE_KEY, created)
    return created
  }
  catch {
    return randomId() // private mode: counts as a new device each time
  }
}

export type EventType = 'link_created' | 'link_claimed' | 'link_refunded'

/**
 * Records one event. Fire-and-forget: never awaited, never throws, and a failure here must never
 * affect a payment, so every error is swallowed — including the 409 a duplicate send gets from the
 * unique index, which is exactly what keeps retries from double-counting.
 */
export function track(type: EventType, valueWei: bigint, linkAddress: string): void {
  if (!ENABLED) return
  try {
    fetch(`${URL_BASE}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        // Don't ask for the row back. Deliberately NOT resolution=ignore-duplicates: PostgREST would
        // turn that into an upsert, which needs an UPDATE policy, and granting one would let anyone
        // rewrite recorded history. A repeat send just gets a harmless 409 from the unique index.
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        type,
        value_units: valueWei.toString(),
        link_address: linkAddress,
        device_id: deviceId(),
      }),
      // Survive the page being navigated away.
      keepalive: true,
    }).catch(() => {})
  }
  catch {
    // analytics must never break the app
  }
}
