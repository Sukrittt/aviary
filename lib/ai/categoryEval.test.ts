// @vitest-environment node
/**
 * Opt-in live eval of the log-expense category predictor: the real Jev
 * question (categoryAnswer) and the real bars (clearsCategoryBars) over ~240
 * everyday Indian expense descriptions and bank-statement payees, each asked
 * against four real category lists from prod. Skipped unless CATEGORY_EVAL=1
 * (it makes ~950 Jev calls, about $0.10).
 *
 *   CATEGORY_EVAL=1 npx vitest run lib/ai/categoryEval.test.ts
 *
 * Each item lists the concepts it can honestly be filed under; each category
 * list maps concepts to its own names. A pick is right when it lands on one of
 * those names. When nothing on the list fits, no pick (or Miscellaneous) is right.
 * Every result goes to CATEGORY_EVAL_OUT (default /tmp/category-eval.md).
 */
import { describe, it, vi } from 'vitest'
import fs from 'node:fs'

vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('../systemSettings', () => ({ getSystemSettings: async () => ({ aiDisabled: false }), AI_DISABLED_MESSAGE: 'off' }))
vi.mock('./usage', () => ({ logAiUsage: async () => {} }))

const { categoryAnswer, clearsCategoryBars, MIN_CATEGORY_CONFIDENCE, MIN_CATEGORY_FIT } = await import('./jev')

type Concept = string
const ITEMS: Array<[string, Concept[]]> = [
  // Festivals and religion
  ['Diwali crackers', ['festival', 'shopping', '~entertainment']],
  ['diwali shopping', ['festival', 'shopping']],
  ['diyas and rangoli colours', ['festival', 'shopping', 'household']],
  ['puja samagri', ['festival', 'household', 'shopping', '~groceries']],
  ['Holi colours and pichkari', ['festival', 'shopping', '~entertainment']],
  ['rakhi for sister', ['gifts', '~festival']],
  ['Ganpati decoration', ['festival', 'shopping', 'household']],
  ['Christmas tree and lights', ['festival', 'shopping', 'household']],
  ['Navratri garba pass', ['entertainment', '~festival']],
  ['Eid shopping', ['festival', 'shopping', '~clothing']],
  ['kaju katli box for diwali', ['gifts', 'festival', '~coffee_snacks', '~groceries']],
  ['temple donation', ['donation']],
  ['pandit dakshina', ['donation', '~festival']],
  ['Diwali bonus for maid', ['house_help', '~gifts', '~festival']],
  ['lohri bonfire wood', ['festival', 'household']],
  // Groceries
  ['sabzi', ['groceries']],
  ['sabzi mandi', ['groceries']],
  ['doodh', ['milk', 'groceries']],
  ['milk packet', ['milk', 'groceries']],
  ['atta 10kg', ['groceries']],
  ['kirana store', ['groceries']],
  ['Blinkit order', ['groceries']],
  ['Zepto', ['groceries']],
  ['BigBasket', ['groceries']],
  ['dal chawal ration', ['groceries']],
  ['eggs and bread', ['groceries']],
  ['fruits', ['groceries']],
  ['DMart', ['groceries', 'household']],
  ['onion tomato', ['groceries']],
  ['paneer', ['groceries', 'milk']],
  ['Swiggy Instamart', ['groceries']],
  ['Amul butter', ['groceries', 'milk']],
  ['cooking oil', ['groceries']],
  ['JioMart', ['groceries']],
  ['curd and dahi', ['milk', 'groceries']],
  // Eating out
  ["lunch at Haldiram's", ['eating_out']],
  ['dinner with friends', ['eating_out', '~party']],
  ['biryani at Paradise', ['eating_out']],
  ['pani puri', ['eating_out', 'coffee_snacks']],
  ['street food', ['eating_out', 'coffee_snacks']],
  ['dhaba', ['eating_out']],
  ['thali', ['eating_out']],
  ['momos', ['eating_out', 'coffee_snacks']],
  ["McDonald's", ['eating_out', 'coffee_snacks']],
  ["Domino's pizza", ['eating_out', 'food_delivery']],
  ['office canteen', ['eating_out', 'coffee_snacks', '~office']],
  ['dosa at Udupi hotel', ['eating_out']],
  // Food delivery
  ['Swiggy', ['food_delivery']],
  ['Zomato order', ['food_delivery']],
  ['swiggy biryani', ['food_delivery']],
  ['zomato dinner', ['food_delivery']],
  // Coffee and snacks
  ['chai', ['coffee_snacks']],
  ['chai sutta', ['coffee_snacks']],
  ['samosa', ['coffee_snacks', 'eating_out']],
  ['Starbucks', ['coffee_snacks']],
  ['Third Wave coffee', ['coffee_snacks']],
  ['cutting chai', ['coffee_snacks']],
  ['vada pav', ['coffee_snacks', 'eating_out']],
  ['Chaayos', ['coffee_snacks']],
  ['nimbu pani', ['coffee_snacks']],
  ['ice cream', ['coffee_snacks', 'eating_out', '~groceries']],
  // Cabs and autos
  ['Ola', ['cab']],
  ['Uber to office', ['cab', '~office']],
  ['Rapido', ['cab']],
  ['auto rickshaw', ['cab']],
  ['auto fare', ['cab']],
  ['Namma Yatri', ['cab']],
  ['cab to airport', ['cab', '~travel']],
  // Public transport
  ['metro card recharge', ['transit']],
  ['BEST bus', ['transit']],
  ['local train pass', ['transit']],
  ['bus fare', ['transit']],
  // Fuel and vehicle
  ['petrol', ['fuel']],
  ['diesel', ['fuel']],
  ['CNG refill', ['fuel']],
  ['HP petrol pump', ['fuel']],
  ['Indian Oil', ['fuel']],
  ['FASTag recharge', ['vehicle', 'car', '~fuel', '~transit']],
  ['toll tax', ['vehicle', 'car', '~fuel', '~transit', '~travel']],
  ['parking fee', ['vehicle', 'car', 'bike', '~transit']],
  ['bike service', ['vehicle', 'bike', '~maintenance']],
  ['car wash', ['vehicle', 'car', '~maintenance']],
  ['puncture repair', ['vehicle', 'bike', 'car', '~maintenance']],
  // Travel
  ['IRCTC tickets', ['travel']],
  ['Goa trip', ['travel']],
  ['flight to Delhi', ['travel']],
  ['MakeMyTrip hotel', ['travel']],
  ['OYO', ['travel']],
  ['bus ticket to Pune', ['travel', '~transit']],
  ['tatkal ticket', ['travel']],
  ['Indigo flight', ['travel']],
  ['Manali trip', ['travel']],
  // Utilities
  ['electricity bill', ['electricity', 'utilities']],
  ['BESCOM', ['electricity', 'utilities']],
  ['MSEB bill', ['electricity', 'utilities']],
  ['water bill', ['utilities']],
  ['gas cylinder', ['utilities', '~household']],
  ['Indane gas', ['utilities', '~household']],
  ['piped gas bill', ['utilities']],
  ['Tata Power', ['electricity', 'utilities']],
  ['inverter battery', ['household', '~utilities', '~maintenance']],
  // Mobile and internet
  ['Jio recharge', ['mobile_internet']],
  ['Airtel postpaid', ['mobile_internet']],
  ['wifi bill', ['mobile_internet', '~utilities']],
  ['ACT Fibernet', ['mobile_internet', '~utilities']],
  ['Vi recharge', ['mobile_internet']],
  ['DTH recharge', ['mobile_internet', '~subscriptions', '~entertainment', '~utilities']],
  ['Tata Play', ['mobile_internet', '~subscriptions', '~entertainment', '~utilities']],
  // Rent and home
  ['house rent', ['rent']],
  ['PG rent', ['rent']],
  ['flat rent', ['rent']],
  ['society maintenance', ['maintenance', '~rent', '~utilities']],
  // House help
  ['maid salary', ['house_help']],
  ['bai payment', ['house_help']],
  ['cook salary', ['house_help', 'cook']],
  ['dhobi', ['house_help', 'laundry', '~personal_care']],
  ['istri wala', ['house_help', 'laundry', '~personal_care']],
  ['car cleaner monthly', ['house_help', '~vehicle', '~car', '~maintenance']],
  // Repairs
  ['plumber', ['maintenance', '~household']],
  ['electrician', ['maintenance', '~household']],
  ['carpenter', ['maintenance', '~household']],
  ['AC service', ['maintenance', '~utilities', '~household']],
  ['RO service', ['maintenance', '~utilities', '~household']],
  ['pest control', ['maintenance', '~household']],
  ['Urban Company cleaning', ['maintenance', '~house_help', '~household']],
  // Household supplies
  ['broom and mop', ['household', '~groceries', '~shopping']],
  ['detergent', ['household', '~groceries']],
  ['toilet cleaner', ['household', '~groceries']],
  ['bedsheet', ['household', 'shopping']],
  ['pressure cooker', ['household', 'shopping']],
  // Shopping and clothes
  ['Myntra', ['shopping', 'clothing']],
  ['Ajio order', ['shopping', 'clothing']],
  ['kurta', ['shopping', 'clothing']],
  ['saree', ['shopping', 'clothing']],
  ['new shoes', ['shopping', 'clothing']],
  ['Flipkart order', ['shopping']],
  ['Amazon order', ['shopping']],
  ['jeans', ['shopping', 'clothing']],
  ['Meesho', ['shopping', 'clothing']],
  ['headphones', ['shopping']],
  ['phone cover', ['shopping']],
  ['Croma', ['shopping']],
  // Gifts
  ['birthday gift for mom', ['gifts', 'birthday']],
  ['wedding shagun', ['gifts']],
  ['gift for friend', ['gifts']],
  ['anniversary gift', ['gifts']],
  ['return gifts', ['gifts', 'birthday']],
  // Entertainment
  ['BookMyShow', ['entertainment']],
  ['movie tickets', ['entertainment']],
  ['PVR', ['entertainment']],
  ['IPL tickets', ['entertainment']],
  ['bowling', ['entertainment']],
  ['concert tickets', ['entertainment']],
  ['Wonderla', ['entertainment', '~travel']],
  ['PS5 game', ['entertainment', '~shopping']],
  // Subscriptions
  ['Netflix', ['subscriptions', 'entertainment']],
  ['Hotstar', ['subscriptions', 'entertainment']],
  ['Spotify', ['subscriptions', 'entertainment']],
  ['YouTube Premium', ['subscriptions', 'entertainment']],
  ['Amazon Prime', ['subscriptions', '~entertainment', '~shopping']],
  ['ChatGPT Plus', ['subscriptions', '~education']],
  ['iCloud storage', ['subscriptions', '~mobile_internet']],
  // Health
  ['Apollo pharmacy', ['health']],
  ['medicines', ['health']],
  ['doctor consultation', ['health']],
  ['1mg', ['health']],
  ['PharmEasy', ['health']],
  ['blood test', ['health']],
  ['dentist', ['health']],
  ['Practo', ['health']],
  ['chemist', ['health']],
  ['dawai', ['health']],
  // Fitness
  ['gym membership', ['fitness', '~health']],
  ['Cult.fit', ['fitness', '~health']],
  ['yoga class', ['fitness', '~health']],
  ['protein powder', ['fitness', '~health', '~groceries']],
  ['badminton court booking', ['fitness', '~entertainment']],
  // Personal care
  ['haircut', ['personal_care']],
  ['salon', ['personal_care']],
  ['barber', ['personal_care']],
  ['facial at parlour', ['personal_care']],
  ['Nykaa', ['personal_care', 'shopping']],
  ['shampoo', ['personal_care', 'household', '~groceries']],
  // Education
  ['school fees', ['education']],
  ['tuition fees', ['education']],
  ['Udemy course', ['education']],
  ['books', ['education', '~shopping']],
  ['coaching class', ['education']],
  ['exam fees', ['education']],
  ['stationery', ['education', '~shopping', '~office']],
  // Money
  ['SIP', ['investments', 'sip']],
  ['Zerodha', ['investments', 'sip']],
  ['mutual fund', ['investments', 'sip']],
  ['Groww', ['investments', 'sip']],
  ['PPF', ['investments', 'savings']],
  ['digital gold', ['investments', 'gold']],
  ['FD', ['investments', 'savings']],
  ['RD deposit', ['savings', 'investments']],
  ['home loan EMI', ['emi', '~rent']],
  ['car EMI', ['emi', '~car']],
  ['Bajaj EMI', ['emi']],
  // Party
  ['beer', ['party', '~entertainment']],
  ['daru', ['party', '~entertainment']],
  ['party with friends', ['party', 'entertainment', '~eating_out']],
  ['hookah', ['party', '~entertainment']],
  // Bank-statement payees (statement import sends these through the same question)
  ['Chai Point', ['coffee_snacks']],
  ['BHARTI AIRTEL LTD', ['mobile_internet']],
  ['Reliance Retail', ['~groceries', '~shopping']],
  ['Rahul Sharma', []],
  ['ZOMATO LTD', ['food_delivery']],
  ['IRCTC', ['travel']],
  ['Uber India Systems', ['cab']],
  ['Bundl Technologies', ['~food_delivery', '~groceries']],
  ['Zerodha Broking', ['investments', 'sip']],
  ['Netflix.com', ['subscriptions', 'entertainment']],
  ['Google Play', ['~subscriptions', '~entertainment']],
  ['Amazon Pay', ['~shopping']],
  ['Jubilant Foodworks', ['~eating_out', '~food_delivery']],
  ['Avenue Supermarts', ['groceries', '~household']],
  ['Cult Fit', ['fitness', '~health']],
  ['LIC of India', ['~investments', '~savings']],
  ['Priya Verma', []],
  ['NEFT to self', []],
  ['ATM withdrawal', []],
  ['BESCOM Bangalore', ['electricity', 'utilities']],
  ['Bharat Petroleum', ['fuel']],
  ['Lenskart', ['~health', '~shopping']],
  ['Decathlon Sports', ['shopping', '~fitness']],
  ['Nykaa E-Retail', ['personal_care', 'shopping']],
  ['PVR INOX', ['entertainment']],
  ['Urban Company', ['maintenance', '~house_help', '~household', '~personal_care']],
  ['Rapido Bike Taxi', ['cab']],
  // Vague: nothing should be guessed unless a catch-all exists
  ['misc', []],
  ['transfer to Rahul', []],
  ['cash withdrawal', []],
  ['zxqv 42', []],
  ['stuff', []],
  ['paid', []],
]

// Real lists from prod: the user's two spaces, the plain onboarding five, and a custom one.
const LISTS: Array<{ name: string; map: Record<Concept, string[]> }> = [
  {
    name: 'space-1',
    map: {
      house_help: ['🧑‍🍳 House help'], cook: ['🧑‍🍳 House help'], laundry: ['🧑‍🍳 House help'],
      utilities: ['💡 Utilities'], electricity: ['💡 Utilities'], maintenance: ['~💡 Utilities', '~🧑‍🍳 House help'],
      food_delivery: ['🍕 Food delivery'], eating_out: ['🍜 Eating out'], party: ['~🍜 Eating out', '~🎬 Entertainment'],
      travel: ['✈️ Travel'], entertainment: ['🎬 Entertainment'],
      cab: ['🚕 Cabs & Auto'], transit: ['~🚕 Cabs & Auto'],
      shopping: ['🛍️ Shopping'], clothing: ['🛍️ Shopping'], festival: ['🛍️ Shopping'], household: ['🛍️ Shopping'],
      savings: ['🛟 Emergency fund', '📈 Investments'], coffee_snacks: ['☕ Coffee & snacks'], gifts: ['🎁 Gifts'], birthday: ['🎁 Gifts'], donation: ['~🎁 Gifts'],
      mobile_internet: ['📱 Mobile & Internet'], health: ['💊 Health'], fitness: ['~💊 Health'],
      fuel: ['⛽ Fuel'], vehicle: ['~⛽ Fuel', '~🚕 Cabs & Auto'], car: ['~⛽ Fuel', '~🚕 Cabs & Auto'], bike: ['~⛽ Fuel', '~🚕 Cabs & Auto'],
      subscriptions: ['📺 Subscriptions'], investments: ['📈 Investments'], sip: ['📈 Investments'], gold: ['📈 Investments'],
      rent: ['🏠 Rent'], groceries: ['🛒 Groceries'], milk: ['🛒 Groceries'],
    },
  },
  {
    name: 'space-2',
    map: {
      coffee_snacks: ['☕ Coffee & Snacks'], mobile_internet: ['📱 Mobile & Internet'], food_delivery: ['🍕 Food Delivery'],
      cab: ['🚌 Commute'], transit: ['🚌 Commute'], fuel: ['🚌 Commute'], vehicle: ['~🚌 Commute', '~🔧 Maintenance'],
      car: ['~🚌 Commute', '~🔧 Maintenance'], bike: ['~🚌 Commute', '~🔧 Maintenance'], travel: ['~🚌 Commute', '~🎮 Entertainment'],
      shopping: ['🛍️ Shopping'], clothing: ['🛍️ Shopping'], festival: ['🛍️ Shopping'], household: ['🛍️ Shopping'],
      health: ['💊 Health & Medical'], education: ['📚 Education'],
      entertainment: ['🎮 Entertainment'], subscriptions: ['🎮 Entertainment'], party: ['~🎮 Entertainment', '~🍜 Eating out'],
      eating_out: ['🍜 Eating out'], savings: ['💰 Savings'], investments: ['~💰 Savings'], sip: ['~💰 Savings'], gold: ['~💰 Savings'],
      fitness: ['🏋️ Fitness'], rent: ['🏠 Rent'], utilities: ['💡 Utilities'], electricity: ['💡 Utilities'],
      maintenance: ['🔧 Maintenance'], groceries: ['🛒 Groceries'], milk: ['🛒 Groceries'], gifts: ['🎁 Gifts'], birthday: ['🎁 Gifts'], donation: ['~🎁 Gifts'],
    },
  },
  {
    name: 'plain-five',
    map: {
      rent: ['Rent'], utilities: ['Utilities'], electricity: ['Utilities'], mobile_internet: ['~Utilities'],
      groceries: ['Groceries'], milk: ['Groceries'],
      eating_out: ['Eating out'], food_delivery: ['Eating out'], coffee_snacks: ['~Eating out'],
      entertainment: ['Entertainment'], subscriptions: ['Entertainment'], party: ['~Entertainment'],
    },
  },
  {
    // Hindi names, as many Indian users set them up.
    name: 'hindi',
    map: {
      groceries: ['Rashan'], milk: ['Doodh', '~Rashan'], rent: ['Kiraya'],
      electricity: ['Bijli-Paani'], utilities: ['Bijli-Paani'], health: ['Dawai-Doctor'], fitness: ['~Dawai-Doctor'],
      clothing: ['Kapde'], shopping: ['~Kapde'], education: ['Bachchon ki Padhai'], travel: ['Safar'], transit: ['~Safar'], cab: ['~Safar'],
      festival: ['Tyohar'], donation: ['~Tyohar'], house_help: ['Kaamwali Bai'], cook: ['Kaamwali Bai'], laundry: ['~Kaamwali Bai'],
      fuel: ['Gaadi Petrol'], vehicle: ['~Gaadi Petrol'], car: ['~Gaadi Petrol'], bike: ['~Gaadi Petrol'],
      mobile_internet: ['Mobile Recharge'], eating_out: ['Bahar ka Khana'], food_delivery: ['Bahar ka Khana'], coffee_snacks: ['~Bahar ka Khana'],
      gifts: ['Lena-Dena'], birthday: ['~Lena-Dena'],
    },
  },
  {
    name: 'custom',
    map: {
      fuel: ['Petrol'], milk: ['Milk', 'Kirana'], groceries: ['Kirana'], emi: ['EMI', 'Loan'],
      personal_care: ['Personal Care'], health: ['~Personal Care'], clothing: ['Clothing'], household: ['Household Items'],
      maintenance: ['~Household Items'], festival: ['~Household Items', '~Party'], office: ['~Office expenses'],
      cab: ['~Travel'], transit: ['~Travel'],
      party: ['Party'], birthday: ['Birthday'], car: ['Car'], bike: ['Bike'],
      travel: ['Travel'], mobile_internet: ['Internet'], electricity: ['Electricity'], cook: ['Cook'],
      gold: ['Gold'], sip: ['SIP Investment'], investments: ['SIP Investment'], rent: ['Rent'],
    },
  },
]
const CUSTOM_EXTRA = ['Office expenses', 'Miscellaneous']

function categoriesOf(list: (typeof LISTS)[number]): string[] {
  const names = [...new Set(Object.values(list.map).flat().map((n) => n.replace(/^~/, '')))]
  return list.name === 'custom' ? [...names, ...CUSTOM_EXTRA] : names
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

describe.skipIf(!process.env.CATEGORY_EVAL)('category predictor (live Jev)', () => {
  it('scores every item against every list', async () => {
    // CATEGORY_EVAL_SET points at a JSON set written apart from the prompt, to check it isn't overfit:
    // { lists: [{ name, categories, cases: [{ item, strict, loose }] }] }
    const heldOut = process.env.CATEGORY_EVAL_SET
      ? (JSON.parse(fs.readFileSync(process.env.CATEGORY_EVAL_SET, 'utf8')) as {
          lists: Array<{ name: string; categories: string[]; cases: Array<{ item: string; strict: string[]; loose: string[] }> }>
        }).lists.flatMap((l) => l.cases.map((c) => ({
          list: l.name, categories: l.categories, item: c.item, strict: c.strict, ok: [...new Set([...c.strict, ...c.loose])],
        })))
      : null
    const cases = heldOut ?? LISTS.flatMap((list) => {
      const categories = categoriesOf(list)
      return ITEMS.map(([item, concepts]) => {
        // A category is strict when some strict concept maps to it with a strict name;
        // loose otherwise: picking it is fine, and so is picking nothing.
        const strict = new Set<string>()
        const loose = new Set<string>()
        for (const raw of concepts) {
          const looseConcept = raw.startsWith('~')
          for (const name of list.map[raw.replace(/^~/, '')] ?? []) {
            const plain = name.replace(/^~/, '')
            if (looseConcept || name.startsWith('~')) loose.add(plain)
            else strict.add(plain)
          }
        }
        return { list: list.name, categories, item, strict: [...strict], ok: [...new Set([...strict, ...loose])] }
      })
    })
    const raw = await pool(cases, 16, async (c) => {
      try {
        const started = Date.now()
        const a = await categoryAnswer(c.item, c.categories, { userId: 'eval', feature: 'suggest' })
        return { ...c, top: a.choice, answer: a, ms: Date.now() - started }
      } catch (err) {
        return { ...c, top: `ERROR ${(err as Error).message}`, answer: { probability: null, fit: null }, ms: 0 }
      }
    })
    const judge = (threshold: number, fitBar = MIN_CATEGORY_FIT) => raw.map((c) => {
      // A failed call shows no pick in the app; the header counts these errors separately.
      const failed = c.top.startsWith('ERROR')
      const pick = !failed && clearsCategoryBars(c.answer, threshold, fitBar) ? c.top : ''
      const p = c.answer.probability ?? 1
      const fit = c.answer.fit ?? 1
      // A catch-all pick is fine only when nothing else fits: the client shows it as a pick, with its badge.
      const catchAll = /misc/i.test(pick)
      const verdict = c.ok.includes(pick) ? 'right'
        : pick === '' ? (c.strict.length ? 'miss' : 'right')
        : catchAll && !c.strict.length ? 'right' : 'wrong'
      return { ...c, pick, p, fit, verdict }
    })
    const sweep = [0.2, 0.35, 0.5, 0.65].flatMap((f) => [0.5, 0.6, 0.7, 0.8, 0.9].map((t) => {
      const rs = judge(t, f)
      return `- fit ${f}, p ${t}: right ${rs.filter((r) => r.verdict === 'right').length}, wrong ${rs.filter((r) => r.verdict === 'wrong').length}, miss ${rs.filter((r) => r.verdict === 'miss').length}`
    }))
    const results = judge(MIN_CATEGORY_CONFIDENCE)
    const count = (v: string) => results.filter((r) => r.verdict === v).length
    const right = count('right'), wrong = count('wrong'), miss = count('miss')
    // Every shown pick, catch-alls included, so `wrong` (which counts wrong catch-all picks) shares its denominator.
    const picked = results.filter((r) => r.pick).length
    const errors = results.filter((r) => r.top.startsWith('ERROR')).length
    const ms = raw.map((r) => r.ms).filter(Boolean).sort((x, y) => x - y)
    const lines = [
      `# Category eval — ${results.length} cases, p ≥ ${MIN_CATEGORY_CONFIDENCE}, fit ≥ ${MIN_CATEGORY_FIT}, errors ${errors}`,
      `right ${right} (${((right / results.length) * 100).toFixed(1)}%), wrong ${wrong}, miss ${miss}`,
      `precision when it picks: ${(((picked - wrong) / Math.max(picked, 1)) * 100).toFixed(1)}%`,
      // "right" above also counts a no-pick on an item with no clear home; these count picks alone.
      `picks: ${picked - wrong} correct (${results.filter((r) => r.pick && r.strict.includes(r.pick)).length} on a clearly right category), ${wrong} wrong; no pick: ${results.length - picked}`,
      '',
      `Jev call ms (16 in flight): median ${ms[Math.floor(ms.length / 2)]}, p95 ${ms[Math.floor(ms.length * 0.95)]}`,
      '',
      ...[...new Set(results.map((r) => r.list))].map((name) => {
        const rs = results.filter((r) => r.list === name)
        return `- ${name}: right ${rs.filter((r) => r.verdict === 'right').length}/${rs.length}, wrong ${rs.filter((r) => r.verdict === 'wrong').length}`
      }),
      '',
      '## Threshold sweep',
      ...sweep,
      '',
      '## Wrong picks',
      ...results.filter((r) => r.verdict === 'wrong').map((r) => `- [${r.list}] "${r.item}" → ${r.pick || '(none)'} p=${r.p?.toFixed(2)} fit=${r.fit.toFixed(2)} (want ${r.ok.join(' / ') || 'none'})`),
      '',
      '## Wrong at fit 0.5, p 0.7',
      ...judge(0.7, 0.5).filter((r) => r.verdict === 'wrong').map((r) => `- [${r.list}] "${r.item}" → ${r.pick} p=${r.p.toFixed(2)} (want ${r.ok.join(' / ') || 'none'})`),
      '',
      '## Misses',
      ...results.filter((r) => r.verdict === 'miss').map((r) => `- [${r.list}] "${r.item}" → ${r.pick || '(none)'} p=${r.p?.toFixed(2)} fit=${r.fit.toFixed(2)} (want ${r.ok.join(' / ')}) top=${r.top}`),
    ]
    const out = process.env.CATEGORY_EVAL_OUT ?? '/tmp/category-eval.md'
    fs.writeFileSync(out, lines.join('\n'))
    // Raw answers, so other bar settings can be scored without new Jev calls.
    fs.writeFileSync(`${out}.json`, JSON.stringify(raw.map(({ list, item, strict, ok, top, answer }) => ({ list, item, strict, ok, top, ...answer }))))
    console.log(lines.slice(0, 20).join('\n'))
  }, 600_000)
})
