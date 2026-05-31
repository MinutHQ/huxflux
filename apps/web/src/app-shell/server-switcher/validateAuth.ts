/**
 * Probe a server's `/api/config` endpoint to determine whether the URL is
 * reachable and the auth token is accepted. Used by the add-server form and
 * the inline "fix token" flow.
 */
export async function validateAuth(
  url: string,
  token?: string,
): Promise<"ok" | "unauthorized" | "unreachable"> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${url}/api/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) return "unauthorized"
    if (!res.ok) return "unreachable"
    return "ok"
  } catch {
    return "unreachable"
  } finally {
    clearTimeout(timer)
  }
}
