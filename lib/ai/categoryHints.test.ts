import { describe, it, expect } from 'vitest'
import { categoryHint } from './categoryHints'

describe('categoryHint', () => {
  it('describes common category names, emoji and joiners ignored', () => {
    expect(categoryHint('🛒 Groceries')).toMatch(/kirana/)
    expect(categoryHint('🚕 Cabs & Auto')).toMatch(/Rapido/)
    expect(categoryHint('Bills And Utilities')).toMatch(/electricity/)
    expect(categoryHint('🧑‍🍳 House help')).toMatch(/maid/)
    expect(categoryHint('Petrol/Gas')).toMatch(/petrol/)
  })

  it('reads Hindi and Hinglish names like their English twins', () => {
    expect(categoryHint('Rashan')).toBe(categoryHint('Groceries'))
    expect(categoryHint('Kapde')).toBe(categoryHint('Clothes'))
    expect(categoryHint('Bahar ka Khana')).toBe(categoryHint('Eating out'))
    expect(categoryHint('Bijli-Paani')).toMatch(/^Household utility bills/)
    expect(categoryHint('Ghar ka Saman')).toBeNull()
  })

  it('picks the narrower meaning first', () => {
    expect(categoryHint('🍕 Food delivery')).toMatch(/^Restaurant food ordered/)
    expect(categoryHint('Food')).toMatch(/^Anything to eat/)
    expect(categoryHint('Loans & EMI')).toMatch(/^Loan repayments/)
  })

  it('keeps two neighbouring categories apart', () => {
    expect(categoryHint('🏥 Doctor')).not.toBe(categoryHint('💊 Medicines'))
    expect(categoryHint('🏥 Doctor')).not.toMatch(/pharmacy/i)
  })

  it('never gives a narrower name a broader hint', () => {
    // "Health Insurance" with the general insurance hint pulled term insurance into it.
    expect(categoryHint('Health Insurance')).toBeNull()
    expect(categoryHint('Online orders')).toBeNull()
    expect(categoryHint('Personal')).toBeNull()
    expect(categoryHint('Outings')).toBeNull()
    expect(categoryHint('Cooking')).toBeNull()
    expect(categoryHint('Society Maintenance')).toBeNull()
    expect(categoryHint('Car Maintenance')).toBeNull()
    expect(categoryHint('Home Loan')).toBeNull()
    expect(categoryHint('Staff Salary')).toBeNull()
    expect(categoryHint('Drinks')).toBeNull()
    // A model name is one vehicle; the generic hint would pull the family car's FASTag into the scooter.
    expect(categoryHint('Activa')).toBeNull()
  })

  it('gives a one-thing name only its own meaning', () => {
    // "Gaming" with the entertainment hint took "movie with frnds" at p 0.97.
    expect(categoryHint('Gaming')).not.toMatch(/movie|PVR/i)
    expect(categoryHint('Movies')).not.toMatch(/gaming/i)
    expect(categoryHint('Temple')).not.toMatch(/church|mosque/i)
    expect(categoryHint('Maid')).not.toMatch(/driver|car/i)
    expect(categoryHint('Fal')).not.toMatch(/vegetable/i)
    expect(categoryHint('Mobile Recharge')).not.toMatch(/broadband|DTH/i)
    for (const name of ['Books', 'Train', 'Metro', 'Amazon', 'Stocks', 'LIC', 'SIP', 'Coffee', 'Chai', 'Uber', 'Swiggy', 'Data', 'Recharge', 'Lunch', 'Salon']) {
      expect(categoryHint(name), name).toBeNull()
    }
  })

  it('leaves mixed or narrower names to Jev', () => {
    // Each of these had a one-part hint that cost real picks on a blind set.
    for (const name of ['Home & Bills', 'Household Bills', 'Petrol Gaadi', 'Car Fuel', 'Driver', 'Nanny', 'Emergency', 'Birthday Gifts', 'Misc']) {
      expect(categoryHint(name), name).toBeNull()
    }
    expect(categoryHint('🍿 Snacks')).not.toMatch(/coffee|Starbucks/i)
    expect(categoryHint('☕ Coffee & Snacks')).toMatch(/Starbucks/)
    expect(categoryHint('Household')).not.toMatch(/puja|festival/i)
    expect(categoryHint('🛟 Emergency fund')).toMatch(/emergency fund/i)
  })

  it('gives a broad name its whole kind', () => {
    expect(categoryHint('Bills')).toMatch(/mobile/i)
    expect(categoryHint('Bills & Utilities')).toMatch(/mobile/i)
    expect(categoryHint('Utilities')).not.toMatch(/mobile/i)
    expect(categoryHint('📱 Mobile & Internet')).toMatch(/broadband/i)
  })

  it('gives no hint when the name has a word it does not know', () => {
    // A hint keyed on one word would pull house rent into Furniture Rent and beer into Office Party.
    expect(categoryHint('Furniture Rent')).toBeNull()
    expect(categoryHint('Office Party')).toBeNull()
    expect(categoryHint('Mummy cloths')).toBeNull()
    expect(categoryHint('Ganapati Expense 25')).toBeNull()
    expect(categoryHint('🎉')).toBeNull()
  })
})
