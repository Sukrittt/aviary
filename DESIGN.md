---
name: Aviary public landing
description: The public `/` page inside `.lp`. A warm near-white page where Aviary learns your spending and one orange moment marks it.
colors:
  accent: "#f4501a"
  accent-ink: "#b93c0c"
  on-accent: "#1f120a"
  tint: "#fff0e6"
  tint-line: "#ffd7c0"
  ink: "#1e1d1a"
  ink-hover: "#3a3732"
  on-ink: "#ffffff"
  rent: "#e7b7fd"
  food: "#b7e7a2"
  savings: "#a5d8ee"
  fun: "#f8cb7b"
  success: "#008435"
  success-ink: "#0f7a3d"
  envelope-fill: "#6dbb4f"
  envelope-track: "#ece9e1"
  paper: "#fafaf7"
  surface: "#f2f0e9"
  card: "#ffffff"
  muted: "#625f58"
  line: "#e6e3da"
  line-strong: "#cfcabe"
  focus: "#2563eb"
typography:
  display:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "clamp(46px, 6.4vw, 80px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-.035em"
  headline:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "clamp(36px, 4.6vw, 60px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-.03em"
  title:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    letterSpacing: "-.015em"
  statement:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "clamp(22px, 2.4vw, 28px)"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "-.01em"
  amount:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    fontFeature: "tnum"
  lede:
    fontFamily: "Nunito, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Nunito, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Nunito, sans-serif"
    fontSize: "14px"
    fontWeight: 800
  button:
    fontFamily: "Nunito, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.2
rounded:
  field: "12px"
  tile: "18px"
  inset: "20px"
  card: "24px"
  panel: "28px"
  frame: "36px"
  pill: "999px"
spacing:
  section-top: "150px"
  section-top-mobile: "100px"
  gutter: "32px"
  gutter-mobile: "20px"
  demo-gap: "56px"
  demo-gap-mobile: "40px"
  container: "1240px"
  demo-max: "1100px"
  lede-max: "620px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "54px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "54px"
  header-cta:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  tick-button:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.tile}"
    padding: "0 28px"
    height: "60px"
  tick-button-done:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-ink}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
  tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "26px"
  way-icon:
    rounded: "{rounded.card}"
    size: "76px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.pill}"
    padding: "14px 22px"
---

# Design System: Aviary public landing

## Overview

**Creative North Star: "The Learned Moment"**

Scope: only the public `/` page inside `.lp` (`src/views/LandingPage.tsx`, `src/landing.css`, `src/components/landing/Nudges.tsx`, `Playground.tsx`, `LandingClient.tsx`). It does not govern the signed-in dashboard, the mobile app, or the legal pages. The money lesson (`MoneyLesson.tsx` and its `.money-*` CSS) is parked: commented out of the page, its styles still in the stylesheet, and none of its rules are part of this system.

The page is warm near-white paper with ink pill buttons and soft, rounded type. It reads like a calm product page that keeps showing you the app doing one thing: noticing a habit, sending a nudge, and logging it in one tap. Every section is a centered statement over one framed demo, and almost everything in those demos is neutral (white cards, warm grey surfaces, hairline borders) so that the single orange moment, the thing Aviary learned or did, stands out. The pastel envelope tones carry over from the app and appear only where the page talks about ways to log.

Density is low and the rhythm is generous: 150px between sections, one idea per section, nothing competing with the headline. Motion is purposeful and small. A looping hero stage, a drawn-on underline, a rotating habit word, and a success tick you can press. It always pauses off screen and holds its finished state under reduced motion.

**Key Characteristics:**
- Warm paper page, white cards, hairline warm-grey borders.
- Ink pills for every install or navigation action. Orange is never a CTA fill.
- Orange marks the learned or answered moment, and nothing else.
- Fredoka for headlines and every number. Nunito for words, at weight 800 when they need weight.
- Centered statement, then one framed demo, repeated.
- Every demo amount is labeled sample data.

## Colors

A warm neutral page with one hot accent and four borrowed pastels, each with a fixed job.

### Primary
- **Aviary Orange** (`accent`): the learned moment. Fills the "Habit learned" node, the success tick button, the Aviary tile in the founder's road, the notification app icon, and colors the bird mark and the wordmark's dot. Text on it is `on-accent`, never white.
- **Burnt Orange Ink** (`accent-ink`): orange as text. The hero's "learns", FAQ plus icons, in-answer links, the founder's initial and the "Log ₹20" notification action. Use it wherever orange must be read, because Aviary Orange is too light for text on paper.
- **Orange Wash** (`tint`) with its **Peach Line** border (`tint-line`): the soft half of the accent. The rotating habit word's highlight, the "nudges next" rows, the tick card, the newly logged row, and the habit pill once the hero loop has fired.

### Secondary
- **Envelope Pastels** (`rent` lilac, `food` green, `savings` blue, `fun` amber): Mobile's envelope tones. On this page they only fill the "Log from anywhere" icon tiles, with dark ink icons on top.

### Tertiary
- **Logged Green** (`success`): the done state of the tick button, matching the app's shared success animation.
- **Money-Left Green** (`success-ink`): positive balances and the check in the "Logged ₹20" notification.
- **Envelope Bar** (`envelope-fill` on `envelope-track`): the "left of ₹600" progress bars.

### Neutral
- **Paper** (`paper`): the page and the frosted sticky header (at 86% with a blur).
- **Warm Surface** (`surface`): framed demo grounds (hero stage, playground panel), the "without Aviary" and bank-feed sides, chips, and inset sample panels.
- **Card White** (`card`): cards, the Aviary side of every comparison, ghost buttons.
- **Ink** (`ink`) and **Ink Hover** (`ink-hover`): all body text and headlines, plus the fill of every primary pill, the versus pill, the active tab and the toast. Ink is also the ground of the page's one dark band, "Noticing is the point", where headline text is `#f6f3ea` and the lede is `#b8b3a7`.
- **Muted** (`muted`): ledes, captions, meta lines, nav links at rest.
- **Hairline** (`line`) and **Hairline Strong** (`line-strong`): 1px borders on every card and frame; the strong one is the hover border for ghost controls.
- **Focus Blue** (`focus`): the 3px focus ring. It is deliberately off-palette so it never reads as decoration.

### Named Rules
**The One Orange Moment Rule.** Orange fills appear only on the thing Aviary learned or the action that logs a spend. If a section has no learned or logged moment, it has no orange fill.

**The Ink CTA Rule.** "Get it on Android", "Get the app", "Open web app" and every other way off the page are ink or ghost pills. Never move a CTA to orange; the orange tick is the product's success moment, not a call to action.

**The Pastels Are Envelopes Rule.** The four pastels mean "envelope" or "a way to log." Don't use them for section backgrounds, borders or text.

## Typography

**Display Font:** Fredoka (`--font-fredoka`, sans-serif fallback)
**Body Font:** Nunito (`--font-nunito`, sans-serif fallback)
**Data Font:** ui-monospace, only for raw bank strings (`UPI/DR/…`, `POS`, `NACH`) to make them feel cold next to Aviary's logs.

**Character:** Fredoka's rounded, tightly tracked headlines are friendly without being childish. Nunito keeps body copy soft, and its heavy 800 weight does the work small caps or bold sans would elsewhere.

### Hierarchy
- **Display** (`display`): the hero `h1` only. Drops to `clamp(42px, 12vw, 56px)` under 640px. The word "learns" sits in Burnt Orange Ink with a hand-drawn Aviary Orange underline that draws on once.
- **Headline** (`headline`): every section `h2`, centered, `text-wrap: balance`. 38px under 640px. The closing headline goes up to `clamp(40px, 5.4vw, 72px)`; the playground headline steps down to `clamp(32px, 3.8vw, 48px)` because it sits beside its tabs.
- **Title** (`title`): card headings in the "little win" cards. The playground's copy column uses a 28px, weight 600 variant.
- **Statement** (`statement`): one Fredoka sentence that closes an argument ("Aviary keeps the one second where you notice a spend…").
- **Amount** (`amount`): every rupee figure, time and count in a demo. Scales up to 22 to 24px in envelope lines and 64px for the streak number.
- **Lede** (`lede`): the paragraph under each headline, Muted, max 620px, `text-wrap: pretty`. 17px under 640px. Founder paragraphs use 18px at 1.65.
- **Body** (`body`): card copy, rule definitions, FAQ answers (16px at 1.75).
- **Label** (`label`): demo card labels, feed headings, row titles. Nunito 800; meta lines under it use 13px at 700 in Muted.

### Named Rules
**The Fredoka Numbers Rule.** Amounts, times and counts are Fredoka 500 (tabular where they change), the words around them are Nunito. A Nunito ₹ figure looks like a typo here.

**The Weight-Not-Case Rule.** Emphasis is Nunito 800, never uppercase or letter-spaced labels.

## Layout

A single centered column. The header, hero stage, sections and footer cap at 1240px with 32px gutters (20px under 640px; the hero stage wrap uses 12px). The header is a three-column grid: logo, centered nav, CTA right.

Each section opens 150px below the last (100px on mobile) and follows one pattern: centered headline, lede below it, then one framed demo 56px further down (40px on mobile), capped at 1000 to 1100px. Four sections break the pattern on purpose: "Noticing is the point" is a full-bleed Ink band (120px of its own padding, the split card sitting on it); the playground has no frame at all, with left-aligned copy and starter chips beside a live phone; the founder card is a two-column `1.1fr .9fr` split; FAQ narrows to 860px and left-aligns.

Grids inside demos: six "ways to log" across (3 at 1080px, 2 at 640px); the learn diagram as `1fr 80px auto 80px 1fr` with dashed connector lines (stacked and lineless under 900px); six rules, three across (2, then 1); wins as two equal cards (stacked at 900px); comparisons as two equal halves (stacked at 640px). Under 900px the three "log from anywhere" phones become one swipeable snap row instead of a stack, and under 640px the hero's chapter tabs sit above the stage so they're reachable before the demo.

Breakpoints are 1080px, 900px (nav hides), 640px (everything stacks, buttons go full width) and 440px (playground phone zooms to 0.84). Anchored sections keep 90px scroll clearance (72px on mobile) for the sticky header.

### Named Rules
**The Centered Statement Rule.** One section, one headline, one framed demo. If a section needs two demos, it's two sections.

## Elevation & Depth

Flat by default, lifted on purpose. Most structure is tonal: Card White on Warm Surface on Paper, with 1px hairlines. Shadows are warm (brown-tinted, never grey-black), diffuse and mostly negative-spread, so they read as soft lift rather than outlines.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgb(40 30 20 / 5%), 0 18px 40px -24px rgb(60 40 20 / 30%)`): the default lift for demo cards and the Aviary side of a comparison.
- **Lifted** (`0 1px 2px rgb(40 30 20 / 5%), 0 28px 50px -24px rgb(60 40 20 / 38%)`, with a 6px rise): the hero card that is active in the current loop step.
- **Device** (`0 50px 80px -40px rgb(40 25 15 / 55%), 0 0 0 1px #2a2a2f`): the lock-screen phone and the playground phone only.
- **Orange Glow** (`0 24px 40px -22px rgb(190 60 10 / 70%)`): under the "Habit learned" node.
- **Ink Float** (`0 14px 30px -14px rgb(30 20 10 / 60%)`): ink pills that float over content (versus pill, toast).

### Named Rules
**The Aviary Side Lifts Rule.** In every comparison, the alternative is flat (Warm Surface, no shadow, desaturated or monospace) and the Aviary side is Card White with Ambient shadow. Depth is the argument.

## Shapes

Everything is round and soft, and radius scales with the size of the object: pill buttons and chips (`pill`), 12px form fields (`field`), 18 to 20px rows and inset panels (`tile`, `inset`), 24px cards and icon tiles (`card`), 28 to 32px feed, win and playground panels (`panel`), and 36px for the big frames (hero stage, form-vs-nudge split, founder card), which step down to 28px under 640px. Devices use their own nested radii (50px bezel over a 40px screen; 54px over 42px for the playground).

Hand-drawn strokes are the only free-form shapes: the hero underline and the dashed learn-diagram connectors, both with rounded caps and `vector-effect: non-scaling-stroke`. Two things rotate: the founder's road tiles (±4 to 9°) and the pair of Wrapped cards, which fan out at -4° and 3° inside the purple win card.

## Components

### Buttons
Confident, chunky pills.
- **Shape:** full pill (`pill`), 54px tall (52px and full width under 640px), icon gap 10px.
- **Primary:** `button-primary`, ink with white text, leading Lucide icon (Smartphone for the store link).
- **Ghost:** `button-ghost`, Card White with a hairline border that darkens to Hairline Strong on hover.
- **Header CTA:** `header-cta`, a 44px ink pill (40px on mobile).
- **Hover / Press:** background or border change over 160ms ease; press scales to 0.96 over 120ms.
- **Focus:** 3px Focus Blue outline, 4px offset, on every link, button and summary.

### Success tick
The Added recording sits in the "See what's left" card at 330px tall so its smallest label reads. Under it a ghost pill, "Hear the chime", replays the clip from the top with the app's chime, plus a short buzz where the browser allows it (Chrome on Android, after a tap; everywhere else it's silently skipped). Sound never plays without a tap.

### Playground
"Go on, log one." is the app's own log screen (web twins of Mobile's log-expense, Added screen and floating nav) live in a phone. Until someone touches it, it plays itself: a white tap ring lands on each target, "Coffee with Sam" types in, the category pill spins its emoji reel and lands with a burst, the keypad enters ₹180, + logs it, and the Added screen plays muted. An ink "Try it yourself" pill sits at the top of the screen and the whole screen is the button. One tap hands the phone over for good: the visitor types, the pill picks, + logs it, and the Added screen chimes and buzzes. Four starter chips beside the phone type a sample item in for anyone who's stuck. "Watch the demo instead" gives it back. With reduced motion there's no self-play and the phone is the visitor's from the start. The self-play only runs while 35% visible.

### Cards / Containers
- **Card:** `card`, Card White, 24px corners, hairline border, 26px padding. Win cards use 30px corners and 32px padding.
- **Framed demo:** Warm Surface, 36px corners, hairline border, `overflow: hidden`. The hero stage adds two faint radial washes (lilac and peach) rising from the bottom corners.
- **Inset sample panel:** Warm Surface inside a card, 20px corners, 18px padding.

### Chips
- **Style:** `chip`, Warm Surface pill, Nunito 800 13px. Used for the prefilled fields in a nudge (item, envelope, amount, payment method).

### Notification card
The nudge, drawn to match Mobile's real habit notification: app line ("Aviary · now") with a 20px orange icon tile, an 800-weight title, a body line, and a hairline-topped action row whose "Log ₹X" action is Burnt Orange Ink. 22px corners. On the lock screen it's 92% white with its own shadow; the flat variant is Card White with a hairline and Ambient shadow.

### Way-to-log tile
`way-icon`: a 76px pastel tile (64px on mobile) with a 26px Lucide icon in dark ink, a faint inset bottom edge and a soft drop. Title in Nunito 800 16px, one-line description in Muted 14px.

### Envelope line
A label with the envelope's emoji and name, a Fredoka amount with a small Muted "left of ₹600", and a 10px Envelope Bar that animates its fill with `scaleX` over 900ms.

### Navigation
Header: sticky, frosted Paper, Fredoka 600 26px wordmark with an orange bird and an orange dot. Nav links are Nunito 800 15px in Muted, Ink on hover, hidden under 900px. Footer: hairline top, smaller wordmark, one Muted tagline and a wrapping row of 44px-tall Muted links.

### FAQ
One item open at a time. Questions are Nunito 800 18px on hairline-divided rows; the Burnt Orange Ink plus rotates 135° to a cross; the answer springs open (height spring, no bounce, 350ms) in Muted 16px at 1.75.

### Hero stage (signature)
A chaptered film under the headline: Learns your habits, Scan a bill, Ask Aviary. Three chapters, about 39s a loop, all about logging; the rest of the app (Insights, Bills & subscriptions, Investments) lives in its own "More in the nest" section after the playground, in the same phone frames as "Log from anywhere". Each chapter is a side card, a phone and a side card on the framed demo; app chapters render the real 360×740 layout scaled into the phone on the app's black. Pill tabs under the stage show which chapter is playing with a 2px orange progress line, and jump on click. A single rAF clock drives chapters and the Learns beats (0 / 1300 / 3900 / 4600ms), only while 25% visible; pausing freezes CSS animations too. Reduced motion holds each scene's finished state. Each scene only shows what the feature really does (bill scan reads lines and splits your share into one envelope; Ask Aviary answers from envelopes).

### Before / after split
Moonjar-style: a Warm Surface bank statement (monospace, fading out to the right) beside a white side where the nudge quote is followed by "Aviary is on it", four steps that spin then check in violet, and today's log rising in. An ink pill in sentence case sits on the seam. A Replay pill restarts it. It runs once when 40% visible.

### Perched bird
Every bird on the page is the perched mark: its head tilts 6° and it blinks on the app's idle timing (3.2s nod, 3.38s blink). Founder tiles rotate the other way and grow 5% on hover.

### Motion
Entrances and state changes use `cubic-bezier(.22, 1, .36, 1)` (a soft ease-out); drawn strokes use `cubic-bezier(.65, 0, .35, 1)`. Text swaps fade in from a 3 to 4px blur. The toast enters with a slight overshoot (`cubic-bezier(.34, 1.56, .64, 1)`, 350ms). `prefers-reduced-motion` removes every CSS animation and transition, and `MotionConfig` zeroes Motion durations; content always lands in its final state. One thing on the page is scroll-triggered: the learn diagram draws itself the first time it's 40% in view (three logs tick in from the left, the dashed lines wipe across with `clip-path`, the habit node lands from a 4px blur, the three nudges fan out), about 2.6s end to end, once. Nothing else gets a scroll entrance; don't add a fade-up to every section.

## Do's and Don'ts

### Do:
- **Do** keep every way off the page an ink or ghost pill (The Ink CTA Rule).
- **Do** spend orange only on the learned or logged moment (The One Orange Moment Rule), and use Burnt Orange Ink whenever orange is text.
- **Do** set every amount, time and count in Fredoka, with `₹` and en-IN grouping.
- **Do** label demo numbers as sample data, in a caption or a corner note.
- **Do** give the Aviary side of a comparison the white card and Ambient shadow, and keep the alternative flat.
- **Do** pause looping demos off screen, offer a pause control, and hold the finished state under reduced motion.
- **Do** use `·` as the separator in meta lines ("Free for 45 days · No card needed").

### Don't:
- **Don't** fill a CTA, section background or headline in Aviary Orange.
- **Don't** use the envelope pastels outside envelope and way-to-log contexts.
- **Don't** use cool grey or pure black shadows; shadows are warm brown and diffuse.
- **Don't** add uppercase, letter-spaced eyebrow labels above headlines.
- **Don't** use em dashes in copy, or expanded forms where a contraction reads naturally.
- **Don't** carry these rules into the dashboard, the mobile app or the legal pages, or revive the parked money lesson's tabletop palette as part of this system.
