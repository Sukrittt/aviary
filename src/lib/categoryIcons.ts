// Category and group icons are Phosphor icon names (e.g. "House"), stored in a
// category's optional `icon` field. Names from before icons still embed an emoji
// ("🏠 Rent"); those resolve through EMOJI_ICON, so nothing needed migrating.
// Pure data, no React: the API validates against this list too.
// The picker searches the space-separated words after each name.
export const CATEGORY_ICONS = {
  House: 'home rent housing apartment flat',
  Buildings: 'city office building maintenance society',
  Key: 'key deposit lease',
  Armchair: 'furniture rent sofa decor',
  Couch: 'furniture sofa living room',
  Bed: 'bed sleep hotel stay',
  Lamp: 'lamp decor home',
  Lightbulb: 'utilities electricity bills ideas',
  Lightning: 'electricity power energy',
  Plug: 'electricity power utilities',
  Drop: 'water utilities',
  Fire: 'gas cylinder lpg heating',
  WifiHigh: 'internet wifi broadband',
  DeviceMobile: 'phone mobile recharge',
  Phone: 'phone landline call',
  Television: 'tv television cable dth',
  Broom: 'cleaning maid housekeeping chores',
  Toilet: 'bathroom toilet cleaning',
  Shower: 'bathroom shower water',
  Bathtub: 'bath bathroom',
  Wrench: 'repairs maintenance service',
  Hammer: 'repairs tools diy',
  Toolbox: 'tools repairs hardware',
  PaintRoller: 'paint renovation home',
  TShirt: 'clothes clothing laundry apparel',
  Pants: 'clothes clothing',
  Hoodie: 'clothes clothing',
  Dress: 'clothes dress fashion',
  Sneaker: 'shoes sneakers footwear',
  Handbag: 'bag accessories',
  Sunglasses: 'accessories sunglasses',
  Watch: 'watch accessories',
  Diamond: 'jewellery jewelry luxury',
  ShoppingCart: 'groceries grocery supermarket',
  Basket: 'groceries basket market vegetables',
  Carrot: 'vegetables groceries produce',
  Orange: 'fruit groceries',
  Egg: 'eggs breakfast groceries',
  Bread: 'bakery bread breakfast',
  Cheese: 'dairy cheese',
  ForkKnife: 'eating out restaurant dining food meals',
  BowlFood: 'food order delivery meals',
  BowlSteam: 'noodles soup food',
  CookingPot: 'cook cooking kitchen meals',
  Hamburger: 'fast food burger snacks',
  Pizza: 'pizza takeout',
  Coffee: 'coffee cafe tea',
  Cookie: 'snacks sweets treats',
  IceCream: 'dessert ice cream treats',
  Cake: 'cake birthday dessert',
  Wine: 'wine drinks alcohol',
  BeerStein: 'beer drinks bar pub',
  Martini: 'cocktails drinks party',
  Champagne: 'celebration party drinks',
  Car: 'car transport travel commute',
  CarProfile: 'car vehicle emi',
  Taxi: 'cab taxi uber ola auto',
  Bus: 'bus transport commute',
  Train: 'train metro commute',
  Motorcycle: 'bike motorcycle',
  Moped: 'scooter moped travel',
  Scooter: 'scooter',
  Bicycle: 'bicycle cycle',
  GasPump: 'fuel petrol diesel gas',
  Gauge: 'vehicle service',
  Airplane: 'flights travel vacation trip',
  Suitcase: 'travel trip vacation luggage',
  Tent: 'camping outdoors trip',
  Island: 'vacation holiday beach',
  Mountains: 'trek hiking outdoors',
  MapTrifold: 'travel outings trips',
  Ticket: 'tickets events movies outings miscellaneous',
  FilmSlate: 'movies entertainment cinema',
  Popcorn: 'movies cinema entertainment',
  MusicNotes: 'music concerts spotify',
  Headphones: 'music audio podcasts',
  GameController: 'games gaming',
  PuzzlePiece: 'hobbies games',
  Palette: 'art hobbies craft',
  PaintBrush: 'art painting',
  Camera: 'photography camera',
  Guitar: 'music instruments',
  Microphone: 'music karaoke',
  Confetti: 'party celebration outings',
  Balloon: 'party birthday kids',
  Gift: 'gifts presents shopping',
  ShoppingBag: 'shopping retail',
  Storefront: 'shop store market',
  Package: 'online orders delivery amazon',
  Tag: 'sale deals',
  Laptop: 'software laptop computer work',
  Desktop: 'computer electronics',
  Code: 'software dev tools',
  Cloud: 'cloud storage software',
  Repeat: 'subscriptions recurring',
  Books: 'books reading',
  BookOpen: 'reading education',
  GraduationCap: 'education school college tuition fees',
  Student: 'student school kids',
  Pencil: 'stationery school',
  Newspaper: 'news newspaper magazines',
  Heart: 'love dating partner',
  Heartbeat: 'health medical',
  FirstAid: 'health medical emergency',
  Pill: 'medicine pharmacy health',
  Stethoscope: 'doctor health checkup',
  Hospital: 'hospital health',
  Tooth: 'dentist dental',
  Eyeglasses: 'glasses optician eyes',
  Brain: 'therapy mental health',
  Barbell: 'gym fitness workout',
  PersonSimpleRun: 'running fitness sports',
  SoccerBall: 'football soccer sports',
  Basketball: 'basketball sports',
  TennisBall: 'tennis sports',
  Baseball: 'cricket baseball sports',
  Volleyball: 'volleyball sports',
  Scissors: 'haircut salon grooming',
  HairDryer: 'salon grooming beauty',
  Sparkle: 'beauty self care personal',
  Smiley: 'personal fun',
  Baby: 'baby kids childcare',
  BabyCarriage: 'baby kids',
  Users: 'family friends',
  UsersThree: 'family group shared',
  User: 'personal self',
  HandHeart: 'charity donations giving',
  Handshake: 'loans lending friends',
  Church: 'religion temple donations',
  Dog: 'pets dog',
  Cat: 'pets cat',
  PawPrint: 'pets vet',
  Bird: 'pets bird',
  Fish: 'pets fish seafood',
  Plant: 'plants garden',
  Flower: 'flowers garden',
  Tree: 'garden outdoors',
  Leaf: 'nature organic',
  Sun: 'summer',
  Umbrella: 'insurance rainy day',
  CloudRain: 'rainy day emergency',
  Lifebuoy: 'emergency fund safety',
  ShieldCheck: 'insurance protection',
  PiggyBank: 'savings',
  Vault: 'savings safe deposit',
  Coins: 'savings cash change',
  Money: 'cash money',
  HandCoins: 'lending payback',
  Wallet: 'wallet spending money',
  Cardholder: 'cards wallet',
  CreditCard: 'credit card bills payments',
  Bank: 'bank loan emi',
  Receipt: 'bills receipts',
  Invoice: 'bills invoices',
  Calculator: 'taxes accounting',
  Percent: 'interest taxes',
  Scales: 'legal lawyer',
  Briefcase: 'work business office',
  ChartLineUp: 'investments stocks mutual funds',
  TrendUp: 'investments growth',
  ChartPie: 'portfolio investments',
  Crown: 'luxury treat',
  Trophy: 'goals rewards',
  Star: 'wishlist favourites',
  Rocket: 'goals side project',
  Globe: 'international travel',
  Hourglass: 'later someday',
  CalendarCheck: 'yearly annual plans',
  Truck: 'moving shifting delivery',
  Recycle: 'recycling',
  Cigarette: 'smoking',
  Infinity: 'misc everything',
  DotsThree: 'miscellaneous other misc',
  FolderSimple: 'group folder',
} as const satisfies Record<string, string>

export type CategoryIconKey = keyof typeof CATEGORY_ICONS

export const DEFAULT_CATEGORY_ICON: CategoryIconKey = 'Wallet'
export const DEFAULT_GROUP_ICON: CategoryIconKey = 'FolderSimple'

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === 'string' && Object.hasOwn(CATEGORY_ICONS, value)
}

/** Catalog keys matching every word of `query` against the key or its tags. */
export function searchCategoryIcons(query: string): CategoryIconKey[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const keys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[]
  if (!words.length) return keys
  return keys.filter((key) => {
    const haystack = `${key.toLowerCase()} ${CATEGORY_ICONS[key]}`
    return words.every((w) => haystack.includes(w))
  })
}

// Emojis the app's defaults, onboarding and legacy seed used, plus common
// picks. Keys are stored without the U+FE0F variation selector.
const EMOJI_ICON: Record<string, CategoryIconKey> = {
  '🏠': 'House', '🏡': 'House', '🏘': 'Buildings', '🏢': 'Buildings', '🏙': 'Buildings', '🔑': 'Key',
  '🪑': 'Armchair', '🛋': 'Couch', '🛏': 'Bed', '💡': 'Lightbulb', '⚡': 'Lightning', '🔌': 'Plug',
  '🚰': 'Drop', '💧': 'Drop', '🚿': 'Shower', '🛁': 'Bathtub', '🔥': 'Fire', '📶': 'WifiHigh',
  '🌐': 'WifiHigh', '📱': 'DeviceMobile', '☎': 'Phone', '📞': 'Phone', '📺': 'Television', '🧹': 'Broom',
  '🧽': 'Broom', '🚾': 'Toilet', '🚻': 'Toilet', '🧻': 'Toilet', '🔧': 'Wrench', '🛠': 'Toolbox',
  '🔨': 'Hammer', '🧰': 'Toolbox', '🎨': 'Palette', '🧺': 'Basket', '👕': 'TShirt', '👔': 'TShirt',
  '👖': 'Pants', '👗': 'Dress', '👟': 'Sneaker', '👠': 'Sneaker', '👜': 'Handbag', '👛': 'Handbag',
  '🕶': 'Sunglasses', '⌚': 'Watch', '💍': 'Diamond', '💎': 'Diamond', '🛒': 'ShoppingCart', '🍎': 'Basket',
  '🍅': 'Basket', '🥦': 'Carrot', '🥕': 'Carrot', '🥬': 'Carrot', '🍊': 'Orange', '🍌': 'Orange',
  '🥚': 'Egg', '🍞': 'Bread', '🥐': 'Bread', '🧀': 'Cheese', '🥛': 'Cheese', '🥫': 'BowlFood',
  '🍽': 'ForkKnife', '🍴': 'ForkKnife', '🍲': 'BowlFood', '🍛': 'BowlFood', '🍱': 'BowlFood',
  '🍜': 'BowlSteam', '🍝': 'BowlSteam', '🧑‍🍳': 'CookingPot', '👨‍🍳': 'CookingPot', '👩‍🍳': 'CookingPot',
  '🍳': 'CookingPot', '🍔': 'Hamburger', '🍟': 'Hamburger', '🌮': 'Hamburger', '🍕': 'Pizza', '☕': 'Coffee',
  '🍵': 'Coffee', '🧋': 'Coffee', '🍪': 'Cookie', '🍫': 'Cookie', '🍬': 'Cookie', '🍦': 'IceCream',
  '🍨': 'IceCream', '🍰': 'Cake', '🎂': 'Cake', '🧁': 'Cake', '🍷': 'Wine', '🍺': 'BeerStein',
  '🍻': 'BeerStein', '🍸': 'Martini', '🍹': 'Martini', '🥂': 'Champagne', '🍾': 'Champagne',
  '🚗': 'Car', '🚙': 'Car', '🚘': 'Car', '🚕': 'Taxi', '🚖': 'Taxi', '🛺': 'Taxi', '🚌': 'Bus',
  '🚍': 'Bus', '🚆': 'Train', '🚇': 'Train', '🚉': 'Train', '🚊': 'Train', '🏍': 'Motorcycle',
  '🛵': 'Moped', '🛴': 'Scooter', '🚲': 'Bicycle', '⛽': 'GasPump', '✈': 'Airplane', '🛫': 'Airplane',
  '🧳': 'Suitcase', '⛺': 'Tent', '🏕': 'Tent', '🏖': 'Island', '🏝': 'Island', '⛰': 'Mountains',
  '🏔': 'Mountains', '🗺': 'MapTrifold', '🎟': 'Ticket', '🎫': 'Ticket', '🎬': 'FilmSlate', '🎥': 'FilmSlate',
  '🍿': 'Popcorn', '🎵': 'MusicNotes', '🎶': 'MusicNotes', '🎧': 'Headphones', '🎮': 'GameController',
  '🕹': 'GameController', '🧩': 'PuzzlePiece', '🖌': 'PaintBrush', '📷': 'Camera', '📸': 'Camera',
  '🎸': 'Guitar', '🎤': 'Microphone', '🎉': 'Confetti', '🎊': 'Confetti', '🥳': 'Confetti', '🎈': 'Balloon',
  '🎁': 'Gift', '🛍': 'ShoppingBag', '🏪': 'Storefront', '📦': 'Package', '🏷': 'Tag', '💻': 'Laptop',
  '🖥': 'Desktop', '⌨': 'Desktop', '☁': 'Cloud', '🔁': 'Repeat', '🔄': 'Repeat', '📚': 'Books',
  '📖': 'BookOpen', '🎓': 'GraduationCap', '🏫': 'Student', '✏': 'Pencil', '📝': 'Pencil', '📰': 'Newspaper',
  '❤': 'Heart', '💕': 'Heart', '💖': 'Heart', '💊': 'Pill', '💉': 'FirstAid', '🩺': 'Stethoscope',
  '🏥': 'Hospital', '🦷': 'Tooth', '👓': 'Eyeglasses', '🧠': 'Brain', '🏋': 'Barbell', '💪': 'Barbell',
  '🏃': 'PersonSimpleRun', '⚽': 'SoccerBall', '🏀': 'Basketball', '🎾': 'TennisBall', '🏏': 'Baseball',
  '⚾': 'Baseball', '🏐': 'Volleyball', '💇': 'Scissors', '💇‍♂': 'Scissors', '💇‍♀': 'Scissors',
  '✂': 'Scissors', '💈': 'Scissors', '💅': 'Sparkle', '💄': 'Sparkle', '🧴': 'Sparkle', '✨': 'Sparkle',
  '🍀': 'Smiley', '😊': 'Smiley', '🙂': 'Smiley', '👶': 'Baby', '🍼': 'Baby', '🧸': 'Baby',
  '👨‍👩‍👧': 'UsersThree', '👪': 'UsersThree', '👫': 'Users', '🧍': 'User', '🙏': 'HandHeart', '🤝': 'Handshake',
  '🛕': 'Church', '⛪': 'Church', '🕌': 'Church', '🐶': 'Dog', '🐕': 'Dog', '🐱': 'Cat', '🐈': 'Cat',
  '🐾': 'PawPrint', '🐦': 'Bird', '🐟': 'Fish', '🐠': 'Fish', '🌱': 'Plant', '🪴': 'Plant', '🌿': 'Plant',
  '🎋': 'Plant', '🌸': 'Flower', '🌷': 'Flower', '💐': 'Flower', '🌳': 'Tree', '🌲': 'Tree', '🍃': 'Leaf',
  '☀': 'Sun', '☂': 'Umbrella', '☔': 'Umbrella', '🌧': 'CloudRain', '🛟': 'Lifebuoy', '🛡': 'ShieldCheck',
  '🐷': 'PiggyBank', '🐖': 'PiggyBank', '🏦': 'Bank', '🪙': 'Coins', '💰': 'Coins', '💵': 'Money',
  '💴': 'Money', '💶': 'Money', '💷': 'Money', '💸': 'Money', '🤑': 'Money', '👝': 'Wallet',
  '💳': 'CreditCard', '🧾': 'Receipt', '📋': 'Invoice', '📄': 'Invoice', '🧮': 'Calculator',
  '⚖': 'Scales', '💼': 'Briefcase', '📈': 'ChartLineUp', '💹': 'ChartLineUp', '📊': 'ChartPie',
  '👑': 'Crown', '🏆': 'Trophy', '⭐': 'Star', '🌟': 'Star', '🚀': 'Rocket', '🌍': 'Globe', '🌎': 'Globe',
  '🌏': 'Globe', '⏳': 'Hourglass', '📅': 'CalendarCheck', '🗓': 'CalendarCheck', '🚚': 'Truck',
  '♻': 'Recycle', '🚬': 'Cigarette', '📁': 'FolderSimple', '📂': 'FolderSimple', '🗂': 'FolderSimple',
}

// Names that predate embedded emojis, lowercased. Anything not here falls back
// to matching the name's words against the catalog's tags.
const NAME_ICON: Record<string, CategoryIconKey> = {
  home: 'House',
  essentials: 'Basket',
  lifestyle: 'ShoppingBag',
  food: 'ForkKnife',
  travel: 'Moped',
  savings: 'PiggyBank',
  investments: 'ChartLineUp',
  entertainment: 'FilmSlate',
  'wish farm': 'Plant',
  personal: 'Smiley',
  miscellaneous: 'Ticket',
  bills: 'Invoice',
  water: 'Drop',
}

const TAG_WORDS: Map<string, CategoryIconKey> = (() => {
  const map = new Map<string, CategoryIconKey>()
  for (const key of Object.keys(CATEGORY_ICONS) as CategoryIconKey[]) {
    for (const word of CATEGORY_ICONS[key].split(' ')) if (!map.has(word)) map.set(word, key)
  }
  return map
})()

const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}(?:\u{FE0F}|[\u{1F3FB}-\u{1F3FF}]|\u{200D}[\p{Extended_Pictographic}\u{2640}\u{2642}])*\u{FE0F}?)\s*/u

function emojiIcon(name: string): CategoryIconKey | undefined {
  const match = name.trim().match(LEADING_EMOJI_RE)
  if (!match) return undefined
  const emoji = match[1].replace(/\u{FE0F}/gu, '').replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
  return EMOJI_ICON[emoji] ?? EMOJI_ICON[[...emoji][0]]
}

function nameIcon(text: string): CategoryIconKey | undefined {
  const lower = text.trim().toLowerCase()
  if (NAME_ICON[lower]) return NAME_ICON[lower]
  for (const word of lower.split(/[^a-z]+/)) {
    const hit = word && (TAG_WORDS.get(word) ?? TAG_WORDS.get(word.replace(/s$/, '')))
    if (hit) return hit
  }
  return undefined
}

function textOf(name: string): string {
  return name.trim().replace(LEADING_EMOJI_RE, '')
}

/** A group's icon: its emoji's match, then its name's, then the folder. */
export function groupIconKey(name: string): CategoryIconKey {
  return emojiIcon(name) ?? nameIcon(textOf(name)) ?? DEFAULT_GROUP_ICON
}

/**
 * A category's icon: the one the user picked, then its emoji's match, then its
 * name's, then its group's, then the wallet.
 */
export function categoryIconKey(name: string, icon?: string, group?: string): CategoryIconKey {
  if (isCategoryIconKey(icon)) return icon
  return (
    emojiIcon(name) ??
    nameIcon(textOf(name)) ??
    (group ? emojiIcon(group) ?? nameIcon(textOf(group)) : undefined) ??
    DEFAULT_CATEGORY_ICON
  )
}
