let rateLimitedUntil = 0

export function markRateLimited(retryAfterSec = 60): void {
  const until = Date.now() + retryAfterSec * 1000
  if (until > rateLimitedUntil) rateLimitedUntil = until
}

export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil
}

export function rateLimitWaitSec(): number {
  return Math.ceil((rateLimitedUntil - Date.now()) / 1000)
}
