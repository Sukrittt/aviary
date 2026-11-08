/**
 * What a budget category usually holds, so Jev knows that "kirana" means
 * Groceries and "Rapido" means Cabs & Auto.
 *
 * Categories are user-named, so a hint is given only when every word of the
 * name is one we know: "Groceries" or "Bills & Utilities" get a hint, while
 * "Furniture Rent", "Office Party" or "Mummy cloths" get none and Jev reads the
 * name as written.
 *
 * A hint describes only what the name itself means, never more. `core` words
 * each name the whole of an entry's meaning ("Groceries", "Rashan"); a word
 * for one part of it ("Coffee", "Gaming", "LIC", "Uber") is never core there,
 * since "Gaming" with the entertainment hint pulls movie tickets into it. Such
 * a word gets its own narrow entry or no hint at all.
 *
 * An entry matches when the name has every `all` word and at least one `core`
 * word (an entry may leave either out) and no word outside `all`, `core` and
 * `extra`. The first matching entry wins.
 */
export interface Hint {
  core?: string[]
  all?: string[]
  extra?: string[]
  hint: string
}

export const HINTS: Hint[] = [
  // Food
  { core: ['food', 'foods', 'khana', 'khaana'], extra: ['drink', 'drinks', 'beverages', 'groceries', 'grocery', 'dining', 'eating', 'peena', 'pina'],
    hint: 'Anything to eat or drink: groceries and kitchen staples, milk, meals out, food delivery (Swiggy, Zomato), chai, coffee and snacks.' },
  { all: ['food'], core: ['delivery', 'deliveries', 'order', 'orders'], extra: ['online'],
    hint: 'Restaurant food ordered for delivery: Swiggy, Zomato, EatSure, Domino\'s or KFC delivery.' },
  { core: ['snack', 'snacks', 'nashta', 'refreshments'], extra: ['bites', 'bakery'],
    hint: 'Snacks: samosa, vada pav, kachori, namkeen, chips, biscuits, ice cream, bakery items.' },
  { core: ['snack', 'snacks', 'nashta', 'refreshments'], extra: ['coffee', 'tea', 'chai', 'cafe', 'cafes', 'beverage', 'beverages', 'drinks', 'juice', 'bites', 'bakery'],
    hint: 'Small bites and drinks: chai, coffee (Starbucks, Third Wave, Blue Tokai, Chaayos, CCD), samosa, vada pav, kachori, biscuits, juice, nimbu pani, cold drinks, ice cream, bakery items.' },
  { core: ['eating', 'eat', 'dining', 'dine', 'restaurant', 'restaurants', 'outside', 'bahar', 'baahar'], extra: ['out', 'food', 'khana', 'khaana', 'meals'],
    hint: 'Meals out: restaurants, dhabas, cafes, canteens, thalis, biryani, dosa, street food (pani puri, chaat, momos, pav bhaji), fast food (McDonald\'s, KFC, Burger King, Domino\'s).' },
  { core: ['milk', 'dairy', 'doodh', 'dudh'],
    hint: 'Milk and dairy: milk packets, milkman, curd/dahi, paneer, butter, ghee, cheese (Amul, Mother Dairy, Nandini).' },
  { core: ['vegetable', 'vegetables', 'veggies', 'sabzi', 'sabji'],
    hint: 'Vegetables: sabzi, onion, tomato, potato, greens, from the sabzi wala, thela or market.' },
  { core: ['fruit', 'fruits', 'phal', 'fal'],
    hint: 'Fruit: seasonal fruit from stalls, the fruit wala or the market.' },
  { core: ['vegetable', 'vegetables', 'veggies', 'sabzi', 'sabji', 'fruit', 'fruits', 'phal', 'fal'],
    hint: 'Vegetables and fruit: sabzi, onion, tomato, potato, greens, seasonal fruit.' },
  { core: ['grocery', 'groceries', 'kirana', 'ration', 'provision', 'provisions', 'supermarket', 'rashan', 'raashan', 'rasoi'],
    extra: ['daily', 'essentials', 'home', 'ghar', 'saman', 'samaan', 'vegetables', 'veggies', 'sabzi', 'fruits'],
    hint: 'Groceries and kitchen staples (kirana, rashan): sabzi, fruits, milk, eggs, bread, atta, rice, dal, oil, masala, meat and fish, snacks for home; kirana stores, DMart, Reliance Fresh, More, Blinkit, Zepto, Instamart, BigBasket, JioMart.' },

  // Bills and home
  { core: ['electricity', 'electric', 'power', 'bijli', 'light'], extra: ['bill', 'bills'],
    hint: 'Electricity bill: BESCOM, MSEB/Mahavitaran, Tata Power, Adani Electricity, BSES, TNEB, prepaid meter recharge.' },
  { core: ['water', 'paani', 'pani'], extra: ['bill', 'bills', 'can', 'cans'],
    hint: 'Water bill, water cans or tanker.' },
  { core: ['lpg', 'cylinder'], extra: ['gas', 'cooking', 'bill'],
    hint: 'Cooking gas: LPG cylinder (Indane, HP Gas, Bharat Gas) or piped gas bill.' },
  { all: ['cooking', 'gas'], extra: ['bill'],
    hint: 'Cooking gas: LPG cylinder (Indane, HP Gas, Bharat Gas) or piped gas bill.' },
  { core: ['bills', 'bill'], extra: ['monthly', 'recurring', 'utilities', 'utility'],
    hint: 'Recurring bills: electricity, water, LPG or piped gas, society maintenance, mobile and internet bills or recharges, DTH.' },
  { core: ['utilities', 'utility'], extra: ['monthly'],
    hint: 'Household utility bills: electricity (BESCOM, MSEB, Tata Power, BSES), water, LPG cylinder or piped gas, society maintenance.' },
  { all: ['bijli'], core: ['paani', 'pani', 'gas'], extra: ['bill', 'bills'],
    hint: 'Household utility bills: electricity, water, LPG cylinder or piped gas.' },
  { core: ['mobile', 'phone', 'phones', 'cellphone'], extra: ['recharge', 'recharges', 'bill', 'bills', 'postpaid', 'prepaid'],
    hint: 'Mobile phone recharge or postpaid bill: Jio, Airtel, Vi, BSNL.' },
  { core: ['internet', 'wifi', 'broadband', 'fiber', 'fibre'], extra: ['bill', 'bills', 'home'],
    hint: 'Internet: Wi-Fi and broadband bills (ACT, JioFiber, Airtel Xstream, Hathway) and mobile data recharges.' },
  { core: ['dth', 'tv', 'cable'], extra: ['recharge', 'bill', 'bills'],
    hint: 'TV connection: DTH or cable recharge (Tata Play, Dish TV, Airtel DTH, Sun Direct).' },
  { core: ['mobile', 'phone', 'internet', 'wifi', 'broadband', 'telecom', 'dth'], extra: ['bill', 'bills', 'recharge', 'recharges', 'tv', 'data'],
    hint: 'Phone, internet and TV connections: prepaid recharge or postpaid bill (Jio, Airtel, Vi, BSNL), Wi-Fi and broadband (ACT, JioFiber, Airtel Xstream), DTH (Tata Play, Dish TV, Airtel DTH).' },
  { core: ['rent', 'housing', 'pg', 'hostel', 'accommodation', 'lease', 'kiraya', 'kiraaya'], extra: ['house', 'home', 'flat', 'room', 'apartment', 'monthly'],
    hint: 'Rent for where you live: house, flat, room, PG or hostel rent.' },
  { core: ['household', 'homeware'], extra: ['items', 'supplies', 'essentials', 'needs', 'things', 'goods', 'home', 'house'],
    hint: 'Household supplies and items: detergent, cleaning supplies (broom, mop, toilet cleaner), kitchenware, utensils, bedsheets, bulbs, small appliances.' },
  { core: ['repair', 'repairs', 'upkeep'], extra: ['home', 'house', 'maintenance'],
    hint: 'Home repairs and upkeep: plumber, electrician, carpenter, painter, AC/RO/appliance service, pest control, Urban Company services.' },
  { core: ['maintenance'], extra: ['home', 'house'],
    hint: 'Maintenance: society maintenance charges and home upkeep (plumber, electrician, carpenter, AC/RO service, pest control).' },
  { core: ['cook', 'maharaj', 'chef'], extra: ['salary', 'khana'],
    hint: 'Pay for the cook: cook salary, khana wali, cook wala or maharaj.' },
  { core: ['maid', 'maids', 'bai', 'kaamwali', 'kamwali'], extra: ['salary', 'payment'],
    hint: 'Pay for the maid (bai, kaamwali) and the household work she does: cleaning, cooking, washing and ironing clothes; salary, advance, festival bonus.' },
  { core: ['help', 'helper', 'domestic', 'househelp', 'servant', 'naukar'], extra: ['house', 'home', 'salary', 'salaries', 'maid', 'maids', 'bai', 'kaamwali', 'cook', 'driver', 'nanny'],
    hint: 'Pay for domestic help: maid or bai, cook, driver, nanny, cleaner, and their festival bonus.' },
  { core: ['laundry', 'dhobi', 'ironing', 'istri'], extra: ['dry', 'clean', 'cleaning'],
    hint: 'Laundry, dry cleaning and ironing (dhobi, istri wala).' },

  // Getting around
  { core: ['cab', 'cabs', 'taxi', 'taxis', 'auto', 'autos', 'rickshaw', 'ride', 'rides'],
    hint: 'Cab, auto and bike-taxi rides: Ola, Uber, Rapido, Namma Yatri, BluSmart, auto rickshaw fares.' },
  { core: ['fuel', 'petrol', 'diesel', 'cng'], extra: ['gas', 'ev', 'charging'],
    hint: 'Vehicle fuel: petrol, diesel, CNG at pumps (Indian Oil, HP, Bharat Petroleum, Shell, Nayara), EV charging.' },
  { core: ['car', 'cars', 'bike', 'bikes', 'vehicle', 'vehicles', 'scooter', 'motorcycle', 'wheeler', 'gaadi', 'gadi'], extra: ['two'],
    hint: 'Owning a vehicle: servicing, repairs, puncture, car wash, parking, FASTag, tolls, vehicle insurance, accessories.' },
  { core: ['commute', 'transport', 'transportation', 'conveyance', 'transit'], extra: ['local', 'daily', 'public', 'office'],
    hint: 'Getting around: cabs and autos (Ola, Uber, Rapido), metro card, local train pass, city bus, fuel, parking and tolls.' },
  { core: ['travel', 'travels', 'travelling', 'traveling', 'trip', 'trips', 'vacation', 'vacations', 'holiday', 'holidays', 'tour', 'tours', 'safar', 'yatra'],
    hint: 'Trips away from home: flights (IndiGo, Air India, Akasa), trains (IRCTC, tatkal), intercity buses (redBus), hotels and stays (OYO, MakeMyTrip, Goibibo, Airbnb), sightseeing, cabs on the trip.' },

  // Things and occasions
  { core: ['clothes', 'clothing', 'cloth', 'cloths', 'apparel', 'fashion', 'kapde', 'kapda', 'kapday'], extra: ['footwear', 'shoes', 'wear', 'dress', 'dresses'],
    hint: 'Clothes and footwear: shirts, jeans, kurtas, sarees, ethnic wear, shoes; Myntra, Ajio, Meesho, Zudio, Westside, Max.' },
  { core: ['festival', 'festivals', 'festive', 'festivities', 'celebration', 'celebrations', 'tyohar', 'tyohaar', 'tehwar'],
    hint: 'Festival spending: crackers, diyas, rangoli, decorations, puja samagri, sweets, festive clothes and gifts.' },
  { core: ['donation', 'donations', 'charity', 'daan'], extra: ['religious', 'puja', 'pooja', 'mandir', 'temple'],
    hint: 'Donations and charity: temple, gurudwara, church or mosque donations, dakshina, NGOs.' },
  { core: ['religious', 'religion', 'puja', 'pooja', 'mandir', 'temple', 'church', 'mosque', 'gurudwara', 'dakshina'], extra: ['path', 'paath', 'offerings', 'samagri'],
    hint: 'Religious spending: puja and puja samagri, prasad, offerings, dakshina, donations at the place of worship.' },
  { core: ['birthday', 'birthdays', 'bday'], extra: ['party', 'parties'],
    hint: 'Birthday spending: cakes, birthday parties, birthday presents, return gifts.' },
  { core: ['gift', 'gifts', 'present', 'presents', 'shagun'],
    hint: 'Gifts for other people: birthday, wedding and anniversary presents, shagun envelopes, rakhi, return gifts, festival gifts and sweet boxes.' },
  { core: ['party', 'parties', 'partying', 'alcohol', 'booze', 'liquor', 'bar', 'bars', 'pub', 'pubs'],
    hint: 'Partying: alcohol (beer, whisky, wine, daru, theka), pubs and bars, hookah, house-party supplies.' },
  { core: ['subscription', 'subscriptions', 'ott', 'streaming'], extra: ['apps', 'digital'],
    hint: 'Recurring digital subscriptions: Netflix, Prime Video, JioHotstar, Spotify, YouTube Premium, iCloud or Google One storage, ChatGPT and other apps.' },
  { core: ['entertainment', 'fun', 'leisure', 'recreation'], extra: ['money'],
    hint: 'Fun and leisure: movies (PVR, INOX, BookMyShow), concerts, events, IPL or match tickets, gaming, amusement parks (Wonderla, Imagica), bowling.' },
  { core: ['movie', 'movies', 'cinema'],
    hint: 'Movies: cinema tickets (PVR, INOX, BookMyShow) and snacks at the cinema.' },
  { core: ['gaming', 'games'],
    hint: 'Gaming: video games, consoles, in-game purchases, gaming cafes.' },
  { core: ['shopping', 'shop', 'purchase', 'purchases'], extra: ['online'],
    hint: 'Things bought for yourself or the home: Amazon, Flipkart, Myntra, Ajio, Meesho, Croma, electronics, gadgets, accessories, home items, and festival purchases (Diwali crackers, diyas, rangoli, lights, decorations).' },

  // Health and self
  { core: ['medicine', 'medicines', 'meds', 'pharmacy', 'chemist', 'dawai', 'dawa', 'dava'],
    hint: 'Medicines: chemist and pharmacy bills (Apollo Pharmacy, Tata 1mg, PharmEasy, Netmeds), dawai.' },
  { core: ['doctor', 'doctors', 'hospital', 'clinic', 'consultation', 'dentist'], extra: ['visits', 'fees'],
    hint: 'Doctor and hospital visits: consultation fees, dentist, Practo, lab tests and scans, hospital bills.' },
  { core: ['health', 'healthcare', 'medical', 'wellness'], extra: ['care'],
    hint: 'Health care: medicines (dawai, chemist, Apollo Pharmacy, Tata 1mg, PharmEasy, Netmeds), doctor and dentist fees, Practo, lab tests and scans, hospital bills.' },
  { core: ['fitness', 'workout', 'exercise'],
    hint: 'Fitness: gym or Cult.fit membership, yoga or dance classes, sports court bookings (badminton, turf), protein and supplements, sports gear.' },
  { core: ['gym'], extra: ['membership', 'fees'],
    hint: 'Gym membership and personal training (Cult.fit, local gym).' },
  { all: ['care'], core: ['personal', 'self'],
    hint: 'Personal care and grooming: haircut, barber, salon, parlour, facial, spa, skincare, cosmetics (Nykaa, Purplle), toiletries.' },
  { core: ['grooming', 'selfcare'], extra: ['care'],
    hint: 'Personal care and grooming: haircut, barber, salon, parlour, facial, spa, skincare, cosmetics (Nykaa, Purplle), toiletries.' },
  { core: ['education', 'study', 'studies', 'learning', 'padhai', 'padhaai'], extra: ['fees', 'fee', 'bachchon', 'bacchon', 'kids'],
    hint: 'Learning: school or college fees, tuition, coaching, online courses (Udemy, Coursera, Unacademy), books, stationery, exam fees.' },
  { core: ['pet', 'pets'], extra: ['care', 'food'],
    hint: 'Pets: pet food, vet visits, grooming, pet supplies.' },
  { core: ['kids', 'kid', 'child', 'children', 'baby', 'babies'], extra: ['care'],
    hint: 'Children: diapers, baby food, toys, kids\' clothes, school supplies.' },
  { core: ['family', 'parents', 'relatives'], extra: ['money', 'support', 'home'],
    hint: 'Spending on or for family: money sent to parents (maa, papa), relatives, family needs.' },
  { core: ['office', 'work', 'business'],
    hint: 'Work expenses: office supplies, work travel, team meals, client meetings.' },

  // Money
  { core: ['gold', 'jewellery', 'jewelry'],
    hint: 'Gold and jewellery: digital gold, gold coins, jewellery purchases.' },
  { core: ['investment', 'investments', 'invest'], extra: ['fund', 'funds', 'sip', 'sips', 'mutual'],
    hint: 'Investments: SIP, mutual funds, stocks (Zerodha, Groww, Upstox, Kite), digital gold, PPF, NPS, fixed and recurring deposits (FD, RD).' },
  { core: ['saving', 'savings', 'bachat'], extra: ['fund', 'funds', 'emergency'],
    hint: 'Money set aside: savings transfers, emergency fund, fixed deposit (FD), recurring deposit (RD).' },
  { all: ['emergency', 'fund'],
    hint: 'Money set aside: savings transfers, emergency fund, fixed deposit (FD), recurring deposit (RD).' },
  { core: ['emi', 'emis', 'loan', 'loans', 'debt'], extra: ['repayment', 'repayments'],
    hint: 'Loan repayments: EMIs for home, car, bike, personal or consumer-durable loans (Bajaj Finserv).' },
  { core: ['insurance'], extra: ['premium', 'premiums', 'policy', 'policies'],
    hint: 'Insurance premiums: life (LIC, term plans), health and vehicle insurance.' },
  { core: ['lend', 'lent', 'lending', 'udhaar', 'udhar'], extra: ['money'],
    hint: 'Money lent to someone (udhaar) that should come back.' },
  { core: ['transfer', 'transfers'], extra: ['self', 'own', 'fund', 'account', 'money'],
    hint: 'Moving money between your own accounts or wallets.' },
]

// Words that never change what a category is for.
const NEUTRAL = new Set(['and', 'n', 'the', 'my', 'of', 'for', 'to', 'expense', 'expenses', 'spend', 'spends', 'spending', 'cost', 'costs', 'ka', 'ki', 'ke', 'ko', 'aur', 'kharcha', 'kharche'])

/** The usual contents of a category, from its name, or null when the name has a word we don't know. */
export function categoryHint(name: string): string | null {
  const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !/^\d+$/.test(w) && !NEUTRAL.has(w))
  if (!words.length) return null
  const has = (list: string[] | undefined, w: string) => !!list && list.includes(w)
  for (const { core, all, extra, hint } of HINTS) {
    const named = (!all || all.every((w) => words.includes(w))) && (!core || words.some((w) => has(core, w)))
    if (named && words.every((w) => has(all, w) || has(core, w) || has(extra, w))) return hint
  }
  return null
}
