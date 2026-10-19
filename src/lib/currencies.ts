// Current circulating ISO 4217 currencies, SIX List One (published 2026-01-01).
// Source: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// countries: search keywords only (ISO names like "Won"/"Yen" omit the country).
// Excludes funds, metals, accounting units and testing/no-currency codes.
// Keep this file identical in Mobile and Web. No runtime network/Intl dependency.
export const CURRENCIES = [
  {"code": "AFN", "name": "Afghani", "symbol": "AFN", "countries": "Afghanistan"},
  {"code": "DZD", "name": "Algerian Dinar", "symbol": "DZD", "countries": "Algeria"},
  {"code": "ARS", "name": "Argentine Peso", "symbol": "ARS", "countries": "Argentina"},
  {"code": "AMD", "name": "Armenian Dram", "symbol": "AMD", "countries": "Armenia"},
  {"code": "AWG", "name": "Aruban Florin", "symbol": "AWG", "countries": "Aruba"},
  {"code": "AUD", "name": "Australian Dollar", "symbol": "A$", "countries": "Australia, Christmas Island, Cocos (Keeling) Islands, Heard & McDonald Islands, Kiribati, Nauru, Norfolk Island, Tuvalu"},
  {"code": "AZN", "name": "Azerbaijan Manat", "symbol": "AZN", "countries": "Azerbaijan"},
  {"code": "BSD", "name": "Bahamian Dollar", "symbol": "BSD", "countries": "Bahamas"},
  {"code": "BHD", "name": "Bahraini Dinar", "symbol": "BHD", "countries": "Bahrain"},
  {"code": "THB", "name": "Baht", "symbol": "฿", "countries": "Thailand"},
  {"code": "PAB", "name": "Balboa", "symbol": "PAB", "countries": "Panama"},
  {"code": "BBD", "name": "Barbados Dollar", "symbol": "BBD", "countries": "Barbados"},
  {"code": "BYN", "name": "Belarusian Ruble", "symbol": "BYN", "countries": "Belarus"},
  {"code": "BZD", "name": "Belize Dollar", "symbol": "BZD", "countries": "Belize"},
  {"code": "BMD", "name": "Bermudian Dollar", "symbol": "BMD", "countries": "Bermuda"},
  {"code": "BOB", "name": "Boliviano", "symbol": "BOB", "countries": "Bolivia"},
  {"code": "VES", "name": "Bolívar Soberano", "symbol": "VES", "countries": "Venezuela"},
  {"code": "VED", "name": "Bolívar Soberano", "symbol": "VED", "countries": "Venezuela"},
  {"code": "BRL", "name": "Brazilian Real", "symbol": "R$", "countries": "Brazil"},
  {"code": "BND", "name": "Brunei Dollar", "symbol": "BND", "countries": "Brunei"},
  {"code": "BIF", "name": "Burundi Franc", "symbol": "BIF", "countries": "Burundi"},
  {"code": "XOF", "name": "CFA Franc BCEAO", "symbol": "XOF", "countries": "Benin, Burkina Faso, Côte d’Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo"},
  {"code": "XAF", "name": "CFA Franc BEAC", "symbol": "XAF", "countries": "Cameroon, Central African Republic, Chad, Congo - Brazzaville, Equatorial Guinea, Gabon"},
  {"code": "XPF", "name": "CFP Franc", "symbol": "XPF", "countries": "French Polynesia, New Caledonia, Wallis & Futuna"},
  {"code": "CVE", "name": "Cabo Verde Escudo", "symbol": "CVE", "countries": "Cape Verde"},
  {"code": "CAD", "name": "Canadian Dollar", "symbol": "C$", "countries": "Canada"},
  {"code": "XCG", "name": "Caribbean Guilder", "symbol": "XCG", "countries": "Curaçao, Sint Maarten"},
  {"code": "KYD", "name": "Cayman Islands Dollar", "symbol": "KYD", "countries": "Cayman Islands"},
  {"code": "CLP", "name": "Chilean Peso", "symbol": "CLP", "countries": "Chile"},
  {"code": "COP", "name": "Colombian Peso", "symbol": "COP", "countries": "Colombia"},
  {"code": "KMF", "name": "Comorian Franc", "symbol": "KMF", "countries": "Comoros"},
  {"code": "CDF", "name": "Congolese Franc", "symbol": "CDF", "countries": "Congo - Kinshasa"},
  {"code": "BAM", "name": "Convertible Mark", "symbol": "BAM", "countries": "Bosnia & Herzegovina"},
  {"code": "NIO", "name": "Cordoba Oro", "symbol": "NIO", "countries": "Nicaragua"},
  {"code": "CRC", "name": "Costa Rican Colon", "symbol": "CRC", "countries": "Costa Rica"},
  {"code": "CUP", "name": "Cuban Peso", "symbol": "CUP", "countries": "Cuba"},
  {"code": "CZK", "name": "Czech Koruna", "symbol": "CZK", "countries": "Czechia, Czech Republic"},
  {"code": "GMD", "name": "Dalasi", "symbol": "GMD", "countries": "Gambia"},
  {"code": "DKK", "name": "Danish Krone", "symbol": "DKK", "countries": "Denmark, Faroe Islands, Greenland"},
  {"code": "MKD", "name": "Denar", "symbol": "MKD", "countries": "North Macedonia"},
  {"code": "DJF", "name": "Djibouti Franc", "symbol": "DJF", "countries": "Djibouti"},
  {"code": "STN", "name": "Dobra", "symbol": "STN", "countries": "São Tomé & Príncipe"},
  {"code": "DOP", "name": "Dominican Peso", "symbol": "DOP", "countries": "Dominican Republic"},
  {"code": "VND", "name": "Dong", "symbol": "₫", "countries": "Vietnam"},
  {"code": "XCD", "name": "East Caribbean Dollar", "symbol": "XCD", "countries": "Anguilla, Antigua & Barbuda, Dominica, Grenada, Montserrat, St. Kitts & Nevis, St. Lucia, St. Vincent & Grenadines"},
  {"code": "EGP", "name": "Egyptian Pound", "symbol": "EGP", "countries": "Egypt"},
  {"code": "SVC", "name": "El Salvador Colon", "symbol": "SVC", "countries": "El Salvador"},
  {"code": "ETB", "name": "Ethiopian Birr", "symbol": "ETB", "countries": "Ethiopia"},
  {"code": "EUR", "name": "Euro", "symbol": "€", "countries": "Andorra, Austria, Belgium, Croatia, Cyprus, Estonia, Finland, France, Germany, Greece, Ireland, Italy, Kosovo, Latvia, Lithuania, Luxembourg, Malta, Monaco, Montenegro, Netherlands, Portugal, San Marino, Slovakia, Slovenia, Spain, Vatican City, Bulgaria"},
  {"code": "FKP", "name": "Falkland Islands Pound", "symbol": "FKP", "countries": "Falkland Islands"},
  {"code": "FJD", "name": "Fiji Dollar", "symbol": "FJD", "countries": "Fiji"},
  {"code": "HUF", "name": "Forint", "symbol": "HUF", "countries": "Hungary"},
  {"code": "GHS", "name": "Ghana Cedi", "symbol": "GHS", "countries": "Ghana"},
  {"code": "GIP", "name": "Gibraltar Pound", "symbol": "GIP", "countries": "Gibraltar"},
  {"code": "HTG", "name": "Gourde", "symbol": "HTG", "countries": "Haiti"},
  {"code": "PYG", "name": "Guarani", "symbol": "PYG", "countries": "Paraguay"},
  {"code": "GNF", "name": "Guinean Franc", "symbol": "GNF", "countries": "Guinea"},
  {"code": "GYD", "name": "Guyana Dollar", "symbol": "GYD", "countries": "Guyana"},
  {"code": "HKD", "name": "Hong Kong Dollar", "symbol": "HK$", "countries": "Hong Kong SAR China"},
  {"code": "UAH", "name": "Hryvnia", "symbol": "₴", "countries": "Ukraine"},
  {"code": "ISK", "name": "Iceland Krona", "symbol": "ISK", "countries": "Iceland"},
  {"code": "INR", "name": "Indian Rupee", "symbol": "₹", "countries": "India"},
  {"code": "IRR", "name": "Iranian Rial", "symbol": "IRR", "countries": "Iran"},
  {"code": "IQD", "name": "Iraqi Dinar", "symbol": "IQD", "countries": "Iraq"},
  {"code": "JMD", "name": "Jamaican Dollar", "symbol": "JMD", "countries": "Jamaica"},
  {"code": "JOD", "name": "Jordanian Dinar", "symbol": "JOD", "countries": "Jordan"},
  {"code": "KES", "name": "Kenyan Shilling", "symbol": "KES", "countries": "Kenya"},
  {"code": "PGK", "name": "Kina", "symbol": "PGK", "countries": "Papua New Guinea"},
  {"code": "KWD", "name": "Kuwaiti Dinar", "symbol": "KWD", "countries": "Kuwait"},
  {"code": "AOA", "name": "Kwanza", "symbol": "AOA", "countries": "Angola"},
  {"code": "MMK", "name": "Kyat", "symbol": "MMK", "countries": "Myanmar (Burma)"},
  {"code": "LAK", "name": "Lao Kip", "symbol": "LAK", "countries": "Laos"},
  {"code": "GEL", "name": "Lari", "symbol": "GEL", "countries": "Georgia"},
  {"code": "LBP", "name": "Lebanese Pound", "symbol": "LBP", "countries": "Lebanon"},
  {"code": "ALL", "name": "Lek", "symbol": "ALL", "countries": "Albania"},
  {"code": "HNL", "name": "Lempira", "symbol": "HNL", "countries": "Honduras"},
  {"code": "SLE", "name": "Leone", "symbol": "SLE", "countries": "Sierra Leone"},
  {"code": "LRD", "name": "Liberian Dollar", "symbol": "LRD", "countries": "Liberia"},
  {"code": "LYD", "name": "Libyan Dinar", "symbol": "LYD", "countries": "Libya"},
  {"code": "SZL", "name": "Lilangeni", "symbol": "SZL", "countries": "Eswatini"},
  {"code": "LSL", "name": "Loti", "symbol": "LSL", "countries": "Lesotho"},
  {"code": "MGA", "name": "Malagasy Ariary", "symbol": "MGA", "countries": "Madagascar"},
  {"code": "MWK", "name": "Malawi Kwacha", "symbol": "MWK", "countries": "Malawi"},
  {"code": "MYR", "name": "Malaysian Ringgit", "symbol": "MYR", "countries": "Malaysia"},
  {"code": "MUR", "name": "Mauritius Rupee", "symbol": "MUR", "countries": "Mauritius"},
  {"code": "MXN", "name": "Mexican Peso", "symbol": "MXN", "countries": "Mexico"},
  {"code": "MDL", "name": "Moldovan Leu", "symbol": "MDL", "countries": "Moldova"},
  {"code": "MAD", "name": "Moroccan Dirham", "symbol": "MAD", "countries": "Morocco, Western Sahara"},
  {"code": "MZN", "name": "Mozambique Metical", "symbol": "MZN", "countries": "Mozambique"},
  {"code": "NGN", "name": "Naira", "symbol": "₦", "countries": "Nigeria"},
  {"code": "ERN", "name": "Nakfa", "symbol": "ERN", "countries": "Eritrea"},
  {"code": "NAD", "name": "Namibia Dollar", "symbol": "NAD", "countries": "Namibia"},
  {"code": "NPR", "name": "Nepalese Rupee", "symbol": "NPR", "countries": "Nepal"},
  {"code": "ILS", "name": "New Israeli Sheqel", "symbol": "₪", "countries": "Israel, Palestinian Territories"},
  {"code": "TWD", "name": "New Taiwan Dollar", "symbol": "TWD", "countries": "Taiwan"},
  {"code": "NZD", "name": "New Zealand Dollar", "symbol": "NZ$", "countries": "New Zealand, Cook Islands, Niue, Pitcairn Islands, Tokelau"},
  {"code": "BTN", "name": "Ngultrum", "symbol": "BTN", "countries": "Bhutan"},
  {"code": "KPW", "name": "North Korean Won", "symbol": "KPW", "countries": "North Korea, Korea, Democratic People's Republic of"},
  {"code": "NOK", "name": "Norwegian Krone", "symbol": "NOK", "countries": "Norway, Svalbard & Jan Mayen"},
  {"code": "MRU", "name": "Ouguiya", "symbol": "MRU", "countries": "Mauritania"},
  {"code": "PKR", "name": "Pakistan Rupee", "symbol": "PKR", "countries": "Pakistan"},
  {"code": "MOP", "name": "Pataca", "symbol": "MOP", "countries": "Macao SAR China"},
  {"code": "TOP", "name": "Pa’anga", "symbol": "TOP", "countries": "Tonga"},
  {"code": "UYU", "name": "Peso Uruguayo", "symbol": "UYU", "countries": "Uruguay"},
  {"code": "PHP", "name": "Philippine Peso", "symbol": "₱", "countries": "Philippines"},
  {"code": "GBP", "name": "Pound Sterling", "symbol": "£", "countries": "United Kingdom, Guernsey, Isle of Man, Jersey, United Kingdom, England, Scotland, Wales, Northern Ireland, Britain"},
  {"code": "BWP", "name": "Pula", "symbol": "BWP", "countries": "Botswana"},
  {"code": "QAR", "name": "Qatari Rial", "symbol": "QAR", "countries": "Qatar"},
  {"code": "GTQ", "name": "Quetzal", "symbol": "GTQ", "countries": "Guatemala"},
  {"code": "ZAR", "name": "Rand", "symbol": "R", "countries": "South Africa"},
  {"code": "OMR", "name": "Rial Omani", "symbol": "OMR", "countries": "Oman"},
  {"code": "KHR", "name": "Riel", "symbol": "KHR", "countries": "Cambodia"},
  {"code": "RON", "name": "Romanian Leu", "symbol": "RON", "countries": "Romania"},
  {"code": "MVR", "name": "Rufiyaa", "symbol": "MVR", "countries": "Maldives"},
  {"code": "IDR", "name": "Rupiah", "symbol": "IDR", "countries": "Indonesia"},
  {"code": "RUB", "name": "Russian Ruble", "symbol": "₽", "countries": "Russia"},
  {"code": "RWF", "name": "Rwanda Franc", "symbol": "RWF", "countries": "Rwanda"},
  {"code": "SHP", "name": "Saint Helena Pound", "symbol": "SHP", "countries": "St. Helena"},
  {"code": "SAR", "name": "Saudi Riyal", "symbol": "SAR", "countries": "Saudi Arabia"},
  {"code": "RSD", "name": "Serbian Dinar", "symbol": "RSD", "countries": "Serbia"},
  {"code": "SCR", "name": "Seychelles Rupee", "symbol": "SCR", "countries": "Seychelles"},
  {"code": "SGD", "name": "Singapore Dollar", "symbol": "S$", "countries": "Singapore"},
  {"code": "PEN", "name": "Sol", "symbol": "PEN", "countries": "Peru"},
  {"code": "SBD", "name": "Solomon Islands Dollar", "symbol": "SBD", "countries": "Solomon Islands"},
  {"code": "KGS", "name": "Som", "symbol": "KGS", "countries": "Kyrgyzstan"},
  {"code": "SOS", "name": "Somali Shilling", "symbol": "SOS", "countries": "Somalia"},
  {"code": "TJS", "name": "Somoni", "symbol": "TJS", "countries": "Tajikistan"},
  {"code": "KRW", "name": "South Korean Won", "symbol": "₩", "countries": "South Korea, Korea, Republic of"},
  {"code": "SSP", "name": "South Sudanese Pound", "symbol": "SSP", "countries": "South Sudan"},
  {"code": "LKR", "name": "Sri Lanka Rupee", "symbol": "LKR", "countries": "Sri Lanka"},
  {"code": "SDG", "name": "Sudanese Pound", "symbol": "SDG", "countries": "Sudan"},
  {"code": "SRD", "name": "Surinam Dollar", "symbol": "SRD", "countries": "Suriname"},
  {"code": "SEK", "name": "Swedish Krona", "symbol": "SEK", "countries": "Sweden"},
  {"code": "CHF", "name": "Swiss Franc", "symbol": "CHF", "countries": "Switzerland, Liechtenstein"},
  {"code": "SYP", "name": "Syrian Pound", "symbol": "SYP", "countries": "Syria"},
  {"code": "BDT", "name": "Taka", "symbol": "৳", "countries": "Bangladesh"},
  {"code": "WST", "name": "Tala", "symbol": "WST", "countries": "Samoa"},
  {"code": "TZS", "name": "Tanzanian Shilling", "symbol": "TZS", "countries": "Tanzania"},
  {"code": "KZT", "name": "Tenge", "symbol": "KZT", "countries": "Kazakhstan"},
  {"code": "TTD", "name": "Trinidad and Tobago Dollar", "symbol": "TTD", "countries": "Trinidad & Tobago"},
  {"code": "MNT", "name": "Tugrik", "symbol": "MNT", "countries": "Mongolia"},
  {"code": "TND", "name": "Tunisian Dinar", "symbol": "TND", "countries": "Tunisia"},
  {"code": "TRY", "name": "Turkish Lira", "symbol": "₺", "countries": "Türkiye"},
  {"code": "TMT", "name": "Turkmenistan New Manat", "symbol": "TMT", "countries": "Turkmenistan"},
  {"code": "AED", "name": "UAE Dirham", "symbol": "AED", "countries": "United Arab Emirates, United Arab Emirates, Dubai, Abu Dhabi"},
  {"code": "USD", "name": "US Dollar", "symbol": "$", "countries": "United States, Ecuador, El Salvador, Panama, Timor-Leste, Zimbabwe, Puerto Rico, Guam, U.S. Virgin Islands, American Samoa, Marshall Islands, Micronesia, Palau, Turks & Caicos Islands, British Virgin Islands, Caribbean Netherlands, United States of America, America"},
  {"code": "UGX", "name": "Uganda Shilling", "symbol": "UGX", "countries": "Uganda"},
  {"code": "UZS", "name": "Uzbekistan Sum", "symbol": "UZS", "countries": "Uzbekistan"},
  {"code": "VUV", "name": "Vatu", "symbol": "VUV", "countries": "Vanuatu"},
  {"code": "YER", "name": "Yemeni Rial", "symbol": "YER", "countries": "Yemen"},
  {"code": "JPY", "name": "Yen", "symbol": "¥", "countries": "Japan"},
  {"code": "CNY", "name": "Yuan Renminbi", "symbol": "CN¥", "countries": "China"},
  {"code": "ZMW", "name": "Zambian Kwacha", "symbol": "ZMW", "countries": "Zambia"},
  {"code": "ZWG", "name": "Zimbabwe Gold", "symbol": "ZWG", "countries": "Zimbabwe"},
  {"code": "PLN", "name": "Zloty", "symbol": "PLN", "countries": "Poland"},
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']
export const DEFAULT_CURRENCY: CurrencyCode = 'INR'
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCIES.some(c => c.code === value)
}
export function resolveCurrency(value: unknown): CurrencyCode {
  return isCurrencyCode(value) ? value : DEFAULT_CURRENCY
}
export function searchCurrencies(query: string) {
  const q = query.trim().toLowerCase()
  return CURRENCIES.filter(c => `${c.name} ${c.code} ${c.symbol} ${c.countries}`.toLowerCase().includes(q))
}
export function currencyInfo(code: string = DEFAULT_CURRENCY) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES.find(c => c.code === DEFAULT_CURRENCY)!
}
// ISO names put the unit last ("Mexican Peso"), except these.
const UNIT_OVERRIDES: Record<string, string> = {
  GBP: 'pound', CNY: 'yuan', OMR: 'rial', UYU: 'peso', NIO: 'córdoba',
  VES: 'bolívar', VED: 'bolívar', XOF: 'franc', XAF: 'franc', ZWG: 'ZiG',
}
/** The currency's everyday unit for copy like "Every peso has a job.": rupee, dollar, euro. */
export function currencyUnit(code: string = DEFAULT_CURRENCY): string {
  const { code: resolved, name } = currencyInfo(code)
  return UNIT_OVERRIDES[resolved] ?? name.split(' ').pop()!.toLowerCase()
}
export function currencyPrefix(code: string = DEFAULT_CURRENCY): string {
  const { symbol } = currencyInfo(code)
  return /^[A-Z]{3}$/.test(symbol) ? `${symbol} ` : symbol
}
function groupDigits(raw: string, code: string): string {
  if (resolveCurrency(code) !== 'INR') return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const last3 = raw.slice(-3)
  const rest = raw.slice(0, -3)
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
}
/** Display only: preserve the app's existing two-decimal precision for every currency. */
export function formatMoney(value: number, code: string = DEFAULT_CURRENCY): string {
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.')
  const sign = value < 0 && !(whole === '0' && fraction === '00') ? '-' : ''
  return `${sign}${currencyPrefix(code)}${groupDigits(whole, code)}${fraction === '00' ? '' : `.${fraction}`}`
}
/** Chart labels: 1.5k, 12.5L, 1.2Cr (INR) or 1.3M, 2.1B, with the sign ahead of the symbol like formatMoney. */
function formatCompact(value: number, code: string): string {
  const abs = Math.abs(value)
  if (Math.round(abs) < 1000) return formatMoney(Math.sign(value) * Math.round(abs), code)
  const units: [number, string][] = resolveCurrency(code) === 'INR' ? [[1e3, 'k'], [1e5, 'L'], [1e7, 'Cr']] : [[1e3, 'k'], [1e6, 'M'], [1e9, 'B']]
  const rounded = (i: number) => Number((abs / units[i][0]).toFixed(i === 0 && abs >= 1e4 ? 0 : 1))
  // Pick the unit after rounding so 999,950 reads 10L, not 1000k, and 99,99,500 reads 1Cr, not 100L.
  let i = 0
  while (i < units.length - 1 && rounded(i) * units[i][0] >= units[i + 1][0]) i++
  return `${value < 0 ? '-' : ''}${currencyPrefix(code)}${rounded(i)}${units[i][1]}`
}
export function formatMoneyInput(raw: string, code: string = DEFAULT_CURRENCY): string {
  const [whole, fraction] = raw.split('.')
  return `${currencyPrefix(code)}${groupDigits(whole || '0', code)}${fraction === undefined ? '' : `.${fraction}`}`
}
export function createCurrencyFormat(code: string = DEFAULT_CURRENCY) {
  const currencyCode = resolveCurrency(code)
  const symbol = currencyInfo(currencyCode).symbol
  return {
    currencyCode, currencySymbol: symbol, currencyPrefix: currencyPrefix(currencyCode),
    formatMoney: (value: number) => formatMoney(value, currencyCode),
    formatCurrency: (value: number, hide = false) => hide ? `${currencyPrefix(currencyCode)}••••` : formatMoney(value, currencyCode),
    formatAmountInput: (raw: string) => formatMoneyInput(raw, currencyCode),
    formatCompact: (value: number, hide = false) => hide ? `${currencyPrefix(currencyCode)}••` : formatCompact(value, currencyCode),
    // Static tour examples use Indian grouping in source. Format their numeric values as-is.
    currencyText: (text: string) => text.replace(/₹([\d,]+(?:\.\d+)?)/g, (_, n: string) => formatMoney(Number(n.replace(/,/g, '')), currencyCode)).replace(/₹/g, currencyPrefix(currencyCode)),
  }
}
