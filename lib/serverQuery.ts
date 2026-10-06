import 'server-only'

type GetHandler = (req: Request) => Promise<Response>

/**
 * Runs an API route's GET handler in-process, for a server component that
 * wants the same data the client would fetch from that route. Same auth (the
 * handler's getAuth reads the incoming request's session), same access checks,
 * same response shape, with no HTTP hop. Throws on a non-ok status so a
 * prefetch simply leaves that query for the client to fetch as before.
 */
export async function callGet<T>(handler: GetHandler, path: string): Promise<T> {
  const res = await handler(new Request(new URL(path, 'http://server.internal')))
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}
