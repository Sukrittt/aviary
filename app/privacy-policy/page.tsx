import { pageMetadata } from '@/lib/seo'
import { permanentRedirect } from 'next/navigation'

/** Backwards-compatible public URL used by the published privacy-policy link. */
export default function PrivacyPolicyAliasPage() {
  permanentRedirect('/legal/privacy')
}

export const metadata = pageMetadata('/legal/privacy')
