# Contributing to Aviary (Web + API)

Thanks for helping out. Issues labelled `good first issue` are a good place to start.

## Setup

```bash
cp .env.example .env.local   # MONGODB_URI + WORKOS_* at minimum
npm install
npm run dev
```

A local MongoDB works fine. See the README for what each environment variable does.

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm test
```

- Open PRs against `staging`. `main` deploys to production.
- Keep PRs focused on one change.
- Budget math, rollover, categorization, CSV/bank import, and bug fixes need a test. Bug fixes should include a failing test that reproduces the bug.
- Every database read or write must be scoped to the signed-in `user_id` (`npm run check:scoping`).
- Never commit real financial data, `.env*` files, or keys.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened. For security issues, email sukritsaha27@gmail.com instead of opening a public issue.
