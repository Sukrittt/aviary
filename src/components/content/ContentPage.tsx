import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { DeviceMobileIcon, MonitorIcon } from '@/src/components/icons'
import { CONTENT_SECTIONS, contentLabel, type ContentSection } from '@/lib/content'
import { pages, SITE_URL, type PagePath } from '@/lib/seo'
import { PLAY_STORE_URL } from '@/src/components/billing/copy'
import { TrackedLink } from '@/src/components/TrackedLink'
import { jsonLd } from '@/src/components/JsonLd'
import { serifFont } from './serifFont'

const KICKERS: Record<ContentSection, string> = { compare: 'Compare', tools: 'Free tool', features: 'Feature', blog: 'Blog' }

/**
 * Shell for a public content page (compare, tools, features, blog): breadcrumbs
 * with BreadcrumbList JSON-LD, an article header (kicker, serif title, lede),
 * the page in one readable column, then related pages. Blog posts pass no
 * title and render their own header with the author. Lives inside
 * app/(site)/layout.tsx's header and footer.
 */
export function ContentPage({ section, path, label, title, kicker, lede, related = [], children }: { section: ContentSection; path: string; label?: string; title?: string; kicker?: string; lede?: ReactNode; related?: Related[]; children: ReactNode }) {
  const hub = CONTENT_SECTIONS[section]
  const crumbs: [string, string][] = [['/', 'Home'], [hub.path, hub.label], ...(path === hub.path ? [] : [[path, label ?? contentLabel(path as PagePath)] as [string, string]])]
  return <>
    {jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: new URL(href, SITE_URL).href })),
    })}
    <nav className="lp-crumbs" aria-label="Breadcrumb"><ol>
      {crumbs.map(([href, name], i) => <li key={href}>{i === crumbs.length - 1 ? <span aria-current="page">{name}</span> : <Link href={href}>{name}</Link>}</li>)}
    </ol></nav>
    <article className={`legal-doc article-doc ${serifFont.variable}`}>
      {title ? <>
        <header className="article-head">
          <p className="article-kicker">{kicker ?? (path === hub.path ? hub.label : KICKERS[section])}</p>
          <h1>{title}</h1>
          {lede && <p className="article-dek">{lede}</p>}
        </header>
        <div className="article-body">{children}</div>
      </> : children}
    </article>
    {related.length > 0 && <RelatedPages paths={related} />}
  </>
}

/** A related link: a page from lib/seo.ts by path, or anything else spelled out (blog posts). */
export type Related = PagePath | { href: string; label: string; description: string }

export function RelatedPages({ paths, title = 'Keep reading' }: { paths: Related[]; title?: string }) {
  const items = paths.map((p) => (typeof p === 'string' ? { href: p, label: contentLabel(p), description: pages[p].description } : p))
  return <section className="lp-related" aria-labelledby="related-title">
    <h2 id="related-title">{title}</h2>
    <ul>{items.map((p) => <li key={p.href}><Link href={p.href}><strong>{p.label}</strong><span>{p.description}</span></Link></li>)}</ul>
  </section>
}

/** The soft close every content page ends on. */
export function SoftCta({ title, children, placement }: { title: string; children: ReactNode; placement: string }) {
  return <aside className="lp-softcta" aria-label="Try Aviary">
    <h2>{title}</h2>
    <p>{children}</p>
    <div className="lp-hero-actions">
      <TrackedLink className="lp-button lp-button--dark" href={PLAY_STORE_URL} event="store_cta_clicked" properties={{ placement }}><DeviceMobileIcon size={18} aria-hidden="true" />Get it on Android</TrackedLink>
      <Link href="/expense" className="lp-button lp-button--ghost"><MonitorIcon size={18} aria-hidden="true" />Use it on the web</Link>
    </div>
    <span className="lp-hero-note">Free for 30 days · No card needed · No bank link</span>
  </aside>
}

/** A hub page's list of every page in its section. */
export function SectionIndex({ section }: { section: ContentSection }) {
  return <ul className="article-cards">{CONTENT_SECTIONS[section].pages.map(([p, label]) => <li key={p} className="article-card"><Link href={p}><strong>{label}</strong><span>{pages[p].description}</span></Link></li>)}</ul>
}

/** Side-by-side facts: [row label, Aviary, them]. */
export function CompareTable({ them, rows }: { them: string; rows: [string, ReactNode, ReactNode][] }) {
  return <div className="table-scroll"><table>
    <thead><tr><th scope="col"><span className="lp-sr-only">Feature</span></th><th scope="col">Aviary</th><th scope="col">{them}</th></tr></thead>
    <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{a}</td><td>{b}</td></tr>)}</tbody>
  </table></div>
}

/** Where every competitor fact came from, and when it was checked. */
export function Sources({ checked, links }: { checked: string; links: [string, string][] }) {
  return <>
    <h2>Sources</h2>
    <p className="checked">Checked {checked} against each app’s own website and store listing. Prices and features change, so check before you buy.</p>
    <ul>{links.map(([href, label]) => <li key={href}><a href={href} rel="noreferrer" target="_blank">{label}</a></li>)}</ul>
  </>
}

/** A phone screenshot from public/landing, with a caption. */
export function Screen({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return <figure><Image src={src} alt={alt} width={576} height={1280} sizes="300px" /><figcaption>{caption}</figcaption></figure>
}
