# Adding a blog post

A post is one file: `content/blog/<slug>.mdx`. The file name is the URL, so
`content/blog/emergency-fund-basics.mdx` becomes `/blog/emergency-fund-basics`.
Nothing else needs editing. On the next build the post gets its own page, and
it's added to the `/blog` index, the sitemap and the RSS feed (`/blog/rss.xml`).

## The file

Start with a `meta` export, then write the post in Markdown:

```mdx
export const meta = {
  title: 'How Much Emergency Fund Do You Need in India?',
  description: 'One or two sentences, 70 to 160 characters. This is what Google shows under the title.',
  published: '2026-11-02',
  updated: '2026-11-02',
  related: ['/blog/first-salary-budget', '/tools/emergency-fund-calculator'],
}

Your opening paragraph. It's shown a little larger, so make it count.

## A section heading

Body text. Link to [the salary planner](/tools/salary-budget-planner) or
[another post](/blog/envelope-budgeting-upi) with normal Markdown links.
```

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | The page `<title>`, the h1 and the RSS title. Put the search phrase in it. Keep it under 80 characters. |
| `description` | yes | Meta description, social card text and the blurb on `/blog`. 70 to 160 characters. |
| `published` | yes | `YYYY-MM-DD`. Sorts the index and fills the byline, Article JSON-LD and RSS. A future date schedules the post (see below). |
| `updated` | yes | `YYYY-MM-DD`. Same as `published` at first. Change it when you edit the post, and the byline shows "Updated". |
| `related` | yes | Two or three links shown at the end: other posts (`/blog/<slug>`) or site pages from `lib/seo.ts` (tools, compare, features). The build fails on a link that doesn't exist. |
| `author` | no | Defaults to Sukrit. |

Reading time is worked out from the word count. You don't set it.

## Scheduling a post

Set `published` to a future date and merge it like any other post. Until
midnight IST on that date, the post 404s and stays out of `/blog`, the sitemap
and the RSS feed. Those pages revalidate hourly, so the post appears within an
hour of midnight with no deploy needed.

A post can only link to posts published on or before its own date, so nothing
points at a post that isn't live yet. `lib/blog.test.ts` checks this.

## Writing

- Don't add an `# h1`. The page renders the title as the only h1, so start your sections at `##`.
- Follow the copy rules in `CLAUDE.md`: no em dashes, use contractions, second person, short sentences.
- Write for Indian readers with real rupee amounts, and check that every sum adds up.
- Aim for 1,200 to 2,000 words. `lib/blog.test.ts` checks the length, the frontmatter, the related links and the em dashes.
- Tables work (GitHub-flavoured Markdown), and so do `> quotes`, lists and **bold**.
- Internal links (`/…`) use `next/link`. External links open in a new tab.

## Images

Put images in `public/blog/<slug>/` and use the Markdown image syntax with
real alt text:

```mdx
![Aviary's Eating out category with ₹1,650 left of ₹5,000](/blog/emergency-fund-basics/eating-out.png)
```

Keep them under about 200 KB, and use PNG or JPEG. Phone screenshots read best at 576 px wide.

## Checking it

```bash
npm run dev                  # then open /blog/<slug>
npx vitest run lib/blog.test.ts
```

Once it's merged and deployed, submit the new URL in Google Search Console if
you want it crawled sooner. The sitemap has it either way.
