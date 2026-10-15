/** A JSON-LD script tag. `<` is escaped so page text can't close the tag early. */
export function jsonLd(data: object) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
