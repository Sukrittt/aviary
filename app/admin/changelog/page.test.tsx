// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { ObjectId } from 'mongodb'
import { beforeEach, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import type { ChangelogDoc } from '@/lib/changelog'

const release: ChangelogDoc = {
  _id: new ObjectId(), title: 'Web plans and smoother setup', version: 'v1.4.0', highlights: ['Subscribe on the web'], body: 'Release details',
  status: 'published', revision: 2, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date(),
}
const findOne = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => ({
  findOne,
  find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [release] }) }) }),
}) }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
vi.mock('./actions', () => ({ publishChangelogAction: vi.fn(), unpublishChangelogAction: vi.fn() }))
vi.mock('./ChangelogEditor', () => ({ ChangelogEditor: () => <div>Draft editor</div> }))
vi.mock('../ActionForm', () => ({ ActionForm: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, SubmitButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }))

const { default: AdminChangelog } = await import('./page')
beforeEach(() => {
  vi.clearAllMocks()
  findOne.mockImplementation(async (filter) => {
    if (!release._id.equals(filter._id) || (filter.status && filter.status !== release.status)) return null
    return release
  })
})

it('redirects a published release’s stale edit URL instead of reporting an unavailable draft', async () => {
  await expect(AdminChangelog({ searchParams: Promise.resolve({ edit: release._id.toHexString() }) })).rejects.toThrow('NEXT_REDIRECT')
  expect(redirect).toHaveBeenCalledWith(`/admin/changelog?published=${release._id.toHexString()}`)
})

it('shows the published content and confirmation instead of an empty draft preview', async () => {
  const page = await AdminChangelog({ searchParams: Promise.resolve({ published: release._id.toHexString() }) })
  const html = renderToStaticMarkup(page)
  expect(html).toContain('is published')
  expect(html).toContain('What&#x27;s new in Aviary')
  expect(html).toContain(release.title)
  expect(html).not.toContain('This draft is unavailable')
  expect(html).not.toContain('Draft editor')
})
