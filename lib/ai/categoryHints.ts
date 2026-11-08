/**
 * What a budget category usually holds, so Jev knows that "kirana" means
 * Groceries and "Rapido" means Cabs & Auto.
 *
 * Categories are user-named, so a hint is given only when every word of the
 * name is one we know: "Groceries" or "Bills & Utilities" get a hint, while
 * "Furniture Rent", "Office Party" or "Mummy cloths" get none and Jev reads the
 * name as written. A hint for a word the name merely contains would mislead.
 *
 * An entry matches when the name has every `all` word and at least one `core`
 * word (an entry may leave either out) and no word outside `all`, `core` and
 * `extra`. The first matching entry wins, so broader ones come later. A hint
 * describes only what the name itself means, never more: a narrower name
 * ("Health Insurance", "Online orders") gets no hint rather than a broad one.
 */
interface Hint {
  core?: string[]
  all?: string[]
  extra?: string[]
  hint: string
}

const HINTS: Hint[] = [
  { core: ['misc', 'miscellaneous', 'other', 'others', 'uncategorized', 'uncategorised', 'general', 'random', 'sundry'],
    hint: 'Catch-all for spending that fits no other category.' },
  { core: ['food', 'foods'], extra: ['drink', 'drinks', 'beverages', 'groceries', 'grocery', 'dining', 'eating'],
    hint: 'Anything to eat or drink: groceries and kitchen staples, milk, meals out, food delivery (Swiggy, Zomato), chai, coffee and snacks.' },
  { all: ['food'], core: ['delivery', 'deliveries', 'order', 'orders'], extra: ['online'],
    hint: 'Restaurant food ordered for delivery: Swiggy, Zomato, EatSure, Domino\'s or KFC delivery.' },
  { core: ['swiggy', 'zomato', 'takeaway', 'takeout'], extra: ['food', 'delivery', 'order', 'orders'],
    hint: 'Restaurant food ordered for delivery: Swiggy, Zomato, EatSure, Domino\'s or KFC delivery.' },
  { core: ['coffee', 'snack', 'snacks', 'chai', 'tea', 'cafe', 'cafes', 'beverage', 'beverages', 'juice', 'bakery', 'treats'], extra: ['drinks', 'bites'],
    hint: 'Small bites and drinks: chai, coffee (Starbucks, Third Wave, Blue Tokai, Chaayos, CCD), samosa, vada pav, kachori, biscuits, juice, nimbu pani, cold drinks, ice cream, bakery items.' },
  { core: ['eating', 'eat', 'dining', 'dine', 'restaurant', 'restaurants', 'outside', 'meal', 'meals', 'lunch', 'lunches', 'dinner', 'dinners'], extra: ['out', 'food'],
    hint: 'Meals out: restaurants, dhabas, cafes, canteens, thalis, biryani, dosa, street food (pani puri, chaat, momos, pav bhaji), fast food (McDonald\'s, KFC, Burger King, Domino\'s); also food delivery (Swiggy, Zomato) and chai or snacks when the list has no category for them.' },
  { core: ['milk', 'dairy', 'doodh'],
    hint: 'Milk and dairy: milk packets, milkman, curd/dahi, paneer, butter, ghee, cheese (Amul, Mother Dairy, Nandini).' },
  { core: ['grocery', 'groceries', 'kirana', 'ration', 'provision', 'provisions', 'supermarket', 'vegetable', 'vegetables', 'veggies', 'sabzi', 'sabji', 'fruit', 'fruits', 'mart'], extra: ['daily', 'essentials', 'home'],
    hint: 'Groceries and kitchen staples: sabzi, fruits, milk, eggs, bread, atta, rice, dal, oil, masala, meat and fish, snacks for home; kirana stores, DMart, Reliance Fresh, More, Blinkit, Zepto, Swiggy Instamart, BigBasket, JioMart.' },
  { core: ['electricity', 'electric', 'power', 'bijli', 'light'], extra: ['bill', 'bills'],
    hint: 'Electricity bill: BESCOM, MSEB/Mahavitaran, Tata Power, Adani Electricity, BSES, TNEB, prepaid meter recharge.' },
  { core: ['water'], extra: ['bill', 'bills', 'can', 'cans'],
    hint: 'Water bill, water cans or tanker.' },
  { core: ['lpg', 'cylinder'], extra: ['gas', 'cooking', 'bill'],
    hint: 'Cooking gas: LPG cylinder (Indane, HP Gas, Bharat Gas) or piped gas bill.' },
  { all: ['cooking', 'gas'], extra: ['bill'],
    hint: 'Cooking gas: LPG cylinder (Indane, HP Gas, Bharat Gas) or piped gas bill.' },
  { core: ['utilities', 'utility', 'bills', 'bill'], extra: ['household', 'home', 'house', 'monthly', 'recurring'],
    hint: 'Household bills: electricity (BESCOM, MSEB, Tata Power, BSES), water, LPG cylinder or piped gas, society maintenance; also phone, internet and DTH bills or recharges when the list has no category for them.' },
  { core: ['mobile', 'phone', 'phones', 'internet', 'wifi', 'broadband', 'recharge', 'recharges', 'telecom', 'dth', 'data'], extra: ['bill', 'bills', 'tv'],
    hint: 'Phone, internet and TV connections: prepaid recharge or postpaid bill (Jio, Airtel, Vi, BSNL), Wi-Fi and broadband (ACT, JioFiber, Airtel Xstream), DTH (Tata Play, Dish TV, Airtel DTH).' },
  { core: ['rent', 'housing', 'pg', 'hostel', 'accommodation', 'lease'], extra: ['house', 'home', 'flat', 'room', 'apartment', 'monthly'],
    hint: 'Rent for where you live: house, flat, room, PG or hostel rent.' },
  { core: ['cab', 'cabs', 'auto', 'autos', 'taxi', 'taxis', 'uber', 'ola', 'rapido', 'ride', 'rides', 'rickshaw'],
    hint: 'Cab, auto and bike-taxi rides: Ola, Uber, Rapido, Namma Yatri, BluSmart, auto rickshaw fares; also metro, bus and local train when the list has no other transport category.' },
  { core: ['fuel', 'petrol', 'diesel', 'cng'], extra: ['gas', 'ev', 'charging', 'car', 'bike'],
    hint: 'Vehicle fuel: petrol, diesel, CNG at pumps (Indian Oil, HP, Bharat Petroleum, Shell, Nayara), EV charging; also FASTag and tolls when the list has no vehicle category.' },
  { core: ['car', 'cars', 'bike', 'bikes', 'vehicle', 'vehicles', 'scooty', 'scooter', 'motorcycle', 'wheeler', 'activa'], extra: ['two', 'maintenance', 'service', 'repair', 'repairs', 'care', 'upkeep'],
    hint: 'Owning a vehicle: servicing, repairs, puncture, car wash, parking, FASTag, tolls, vehicle insurance, accessories; fuel when the list has no fuel category.' },
  { core: ['commute', 'transport', 'transportation', 'metro', 'bus', 'train', 'trains', 'conveyance', 'transit'], extra: ['local', 'daily', 'public', 'office'],
    hint: 'Getting around: cabs and autos (Ola, Uber, Rapido), metro card, local train pass, city bus, fuel, parking and tolls; also flight, train and bus tickets for trips when the list has no travel category.' },
  { core: ['travel', 'travels', 'travelling', 'traveling', 'trip', 'trips', 'vacation', 'vacations', 'holiday', 'holidays', 'tour', 'tours'],
    hint: 'Trips away from home: flights (IndiGo, Air India, Akasa), trains (IRCTC, tatkal), intercity buses (redBus), hotels and stays (OYO, MakeMyTrip, Goibibo, Airbnb), sightseeing, cabs on the trip.' },
  { core: ['clothes', 'clothing', 'cloth', 'cloths', 'apparel', 'fashion', 'dress', 'dresses', 'footwear', 'shoes', 'wear'],
    hint: 'Clothes and footwear: shirts, jeans, kurtas, sarees, ethnic wear, shoes; Myntra, Ajio, Meesho, Zudio, Westside, Max.' },
  { core: ['household', 'homeware'], extra: ['items', 'supplies', 'essentials', 'needs', 'things', 'goods', 'home', 'house'],
    hint: 'Household supplies and items: detergent, cleaning supplies (broom, mop, toilet cleaner), kitchenware, utensils, bedsheets, bulbs, small appliances, puja items, festival decorations.' },
  { core: ['cook', 'maharaj', 'khana', 'chef'], extra: ['salary'],
    hint: 'Pay for the cook: cook salary, khana wali, cook wala or maharaj.' },
  { core: ['help', 'helper', 'maid', 'maids', 'domestic', 'servant', 'staff', 'bai', 'nanny', 'househelp', 'cleaner'], extra: ['house', 'home', 'salary', 'salaries'],
    hint: 'Pay for domestic help: maid/bai, cook, driver, cleaner, nanny, car cleaner, dhobi/istri wala, watchman, and their festival bonus.' },
  { core: ['maintenance', 'repair', 'repairs', 'upkeep'], extra: ['home', 'house', 'society'],
    hint: 'Home repairs and upkeep: plumber, electrician, carpenter, painter, AC/RO/appliance service, pest control, Urban Company services, society maintenance.' },
  { core: ['laundry', 'dhobi', 'ironing', 'istri'], extra: ['dry', 'clean', 'cleaning'],
    hint: 'Laundry, dry cleaning and ironing (dhobi, istri wala).' },
  { core: ['festival', 'festivals', 'festive', 'festivities', 'celebration', 'celebrations'],
    hint: 'Festival spending: crackers, diyas, rangoli, decorations, puja samagri, sweets, festive clothes and gifts.' },
  { core: ['donation', 'donations', 'charity', 'temple', 'church', 'mosque', 'gurudwara', 'religious', 'puja', 'pooja', 'dakshina', 'offerings'],
    hint: 'Religious and charitable giving: temple, gurudwara, church or mosque donations, dakshina, puja offerings, charity.' },
  { core: ['birthday', 'birthdays', 'bday'], extra: ['party', 'parties', 'gifts'],
    hint: 'Birthday spending: cakes, birthday parties, birthday presents, return gifts.' },
  { core: ['gift', 'gifts', 'present', 'presents', 'shagun'], extra: ['donations', 'charity'],
    hint: 'Gifts for other people: birthday, wedding and anniversary presents, shagun envelopes, rakhi, return gifts, festival gifts and sweet boxes; donations when the list has no donation category.' },
  { core: ['party', 'parties', 'partying', 'drinks', 'alcohol', 'booze', 'liquor', 'bar', 'bars', 'pub', 'pubs'],
    hint: 'Partying: alcohol (beer, whisky, wine, daru, theka), pubs and bars, hookah, house-party supplies.' },
  { core: ['subscription', 'subscriptions', 'ott', 'streaming'], extra: ['apps', 'digital'],
    hint: 'Recurring digital subscriptions: Netflix, Prime Video, JioHotstar, Spotify, YouTube Premium, iCloud or Google One storage, ChatGPT and other apps.' },
  { core: ['entertainment', 'fun', 'leisure', 'movie', 'movies', 'hobby', 'hobbies', 'games', 'gaming'], extra: ['money'],
    hint: 'Fun and leisure: movies (PVR, INOX, BookMyShow), concerts, events, IPL or match tickets, gaming, amusement parks (Wonderla, Imagica), bowling; also streaming and parties when the list has no category for them.' },
  { core: ['medicine', 'medicines', 'meds', 'pharmacy', 'chemist', 'dawai'],
    hint: 'Medicines: chemist and pharmacy bills (Apollo Pharmacy, Tata 1mg, PharmEasy, Netmeds), dawai.' },
  { core: ['doctor', 'doctors', 'hospital', 'clinic', 'consultation', 'dentist'], extra: ['visits', 'fees'],
    hint: 'Doctor and hospital visits: consultation fees, dentist, Practo, lab tests and scans, hospital bills.' },
  { core: ['health', 'healthcare', 'medical', 'wellness'], extra: ['care'],
    hint: 'Health care: medicines (dawai, chemist, Apollo Pharmacy, Tata 1mg, PharmEasy, Netmeds), doctor and dentist fees, Practo, lab tests and scans, hospital bills, health insurance.' },
  { core: ['fitness', 'gym', 'sport', 'sports', 'yoga', 'workout', 'exercise'],
    hint: 'Fitness: gym or Cult.fit membership, yoga or dance classes, sports court bookings (badminton, turf), protein and supplements, sports gear.' },
  { all: ['care'], core: ['personal', 'self'],
    hint: 'Personal care and grooming: haircut, barber, salon, parlour, facial, spa, skincare, cosmetics (Nykaa, Purplle), toiletries.' },
  { core: ['grooming', 'salon', 'beauty', 'selfcare', 'hair', 'haircut', 'cosmetics', 'spa'], extra: ['care'],
    hint: 'Personal care and grooming: haircut, barber, salon, parlour, facial, spa, skincare, cosmetics (Nykaa, Purplle), toiletries.' },
  { core: ['education', 'study', 'studies', 'school', 'college', 'course', 'courses', 'tuition', 'learning', 'books', 'coaching'], extra: ['fees', 'fee'],
    hint: 'Learning: school or college fees, tuition, coaching, online courses (Udemy, Coursera, Unacademy), books, stationery, exam fees.' },
  { core: ['gold', 'jewellery', 'jewelry'],
    hint: 'Gold and jewellery: digital gold, gold coins, jewellery purchases.' },
  { core: ['investment', 'investments', 'invest', 'sip', 'sips', 'mutual', 'stocks', 'stock', 'shares', 'equity', 'demat', 'nps', 'ppf'], extra: ['fund', 'funds'],
    hint: 'Investments: SIP, mutual funds, stocks (Zerodha, Groww, Upstox, Kite), digital gold, PPF, NPS, fixed and recurring deposits (FD, RD).' },
  { core: ['saving', 'savings', 'emergency', 'deposit', 'deposits', 'fd', 'rd'], extra: ['fund', 'funds'],
    hint: 'Money set aside: savings transfers, emergency fund, fixed deposit (FD), recurring deposit (RD).' },
  { core: ['emi', 'emis', 'loan', 'loans', 'debt', 'repayment', 'repayments'], extra: ['home', 'car', 'bike', 'personal', 'education'],
    hint: 'Loan repayments: EMIs for home, car, bike, personal or consumer-durable loans (Bajaj Finserv).' },
  { core: ['insurance', 'lic', 'premium', 'premiums', 'policy', 'policies'],
    hint: 'Insurance premiums: LIC, term, health, vehicle insurance.' },
  { core: ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'vet'], extra: ['care', 'food'],
    hint: 'Pets: pet food, vet visits, grooming, pet supplies.' },
  { core: ['kids', 'kid', 'child', 'children', 'baby', 'babies'], extra: ['care'],
    hint: 'Children: diapers, baby food, toys, kids\' clothes, school supplies.' },
  { core: ['office', 'work', 'business'],
    hint: 'Work expenses: office supplies, work travel, team meals, client meetings.' },
  { core: ['family', 'parents', 'relatives'], extra: ['money', 'support', 'home'],
    hint: 'Spending on or for family: money sent to parents (maa, papa), relatives, family needs.' },
  { core: ['lend', 'lent', 'lending', 'udhaar', 'udhar'], extra: ['money'],
    hint: 'Money lent to someone (udhaar) that should come back.' },
  { core: ['transfer', 'transfers'], extra: ['self', 'own', 'fund', 'account', 'money'],
    hint: 'Moving money between your own accounts or wallets.' },
  { core: ['shopping', 'shop', 'purchase', 'purchases', 'amazon', 'flipkart'], extra: ['online'],
    hint: 'Things bought for yourself or the home: Amazon, Flipkart, Myntra, Ajio, Meesho, Croma, electronics, gadgets, accessories, home items, and festival purchases (Diwali crackers, diyas, rangoli, lights, decorations).' },
]

// Words that never change what a category is for.
const NEUTRAL = new Set(['and', 'n', 'the', 'my', 'of', 'for', 'to', 'expense', 'expenses', 'spend', 'spends', 'spending', 'cost', 'costs'])

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
