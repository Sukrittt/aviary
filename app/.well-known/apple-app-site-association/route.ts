import { appleAppSiteAssociation } from '@/lib/appLinks'

export const dynamic = 'force-dynamic'

// Served without an extension, as application/json, which is what iOS asks for.
export function GET() {
  return Response.json(appleAppSiteAssociation(), { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
