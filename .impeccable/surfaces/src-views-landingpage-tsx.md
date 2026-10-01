---
version: 1
slug: "src-views-landingpage-tsx"
primary_target: "src/views/LandingPage.tsx"
related_targets: ["src/landing.css","src/components/landing/Nudges.tsx","src/components/landing/Playground.tsx"]
---

# Aviary home

- Scope: public `/`, `src/views/LandingPage.tsx`, `src/components/landing/Nudges.tsx`, `Playground.tsx`, `src/landing.css`. Mode: Persuade.
- Audience: Indian-rupee budgeters on Android or web who've tried spreadsheets or bank-sync apps. Job: believe logging by hand is worth it because Aviary makes it one tap, then install.
- Message: "Aviary learns your spending." Habit nudges (same item, same weekday, around the same time, 3x in 8 weeks; nudge 15 minutes after the usual time, prefilled, "Log ₹X" action; max two a day; backs off after ignores). Positioning: noticing is the point, bank sync files spending away unseen.
- Proof: hero stage loop (noticed logs, lock-screen nudge answered, envelope ticking down), form vs nudge split, learn diagram, bank feed vs Aviary log, the real success tick, the live Playground. All demo numbers are labeled sample data.
- Direction: user-pinned moonjar.ai structure on a light page, Aviary identity kept (Fredoka/Nunito, orange #f4501a, pastel envelope tones). Founder card uses Sukrit's own story.
- Constraints: no invented capabilities; habit nudges ship in the Mobile `feat/habit-nudges` PR. No em dashes, contractions throughout.
- Unresolved: the money lesson (MoneyLesson.tsx) is commented out pending a decision to restore it or move it to its own page. A recorded demo video could replace the HTML hero loop later.
