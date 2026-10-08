/**
 * Karza verification provider.
 *
 * Real mode: KARZA_API_KEY set ho to live Karza API calls.
 * Mock mode: key nahi hai to realistic sample data (testing ke liye).
 *
 * Karza docs: https://docs.karza.in
 */

import type { CheckResult, CheckType, VerificationProvider } from './types'

const KARZA_BASE = 'https://api.karza.in/v3'

function isMock(): boolean {
  return !process.env.KARZA_API_KEY
}

async function karzaPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${KARZA_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-karza-key': process.env.KARZA_API_KEY ?? '',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Karza API ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}

// ---- Mock data (realistic sample responses for testing) ----

function mockResult(checkType: CheckType, input: string, data: Record<string, unknown>): CheckResult {
  return { ok: true, checkType, input, data: { ...data, _mock: true, _note: 'Sample data — Karza API key lagao live results ke liye' }, costPaise: 0 }
}

export class KarzaProvider implements VerificationProvider {
  id = 'karza'
  name = 'Karza Technologies'

  get mockMode() { return isMock() }

  async panCheck(pan: string): Promise<CheckResult> {
    const p = pan.toUpperCase().trim()
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) {
      return { ok: false, checkType: 'pan_check', input: pan, error: 'Invalid PAN format (ABCDE1234F)' }
    }
    if (isMock()) {
      return mockResult('pan_check', p, {
        pan: p, name: 'RAJESH KUMAR SHARMA', status: 'Valid',
        category: 'Individual', aadhaarLinked: true,
      })
    }
    try {
      const r = await karzaPost('/pan-authentication', { pan: p, consent: 'Y' })
      return { ok: true, checkType: 'pan_check', input: p, data: r, costPaise: 400 }
    } catch (e) { return { ok: false, checkType: 'pan_check', input: p, error: String(e) } }
  }

  async companyCheck(cin: string): Promise<CheckResult> {
    const c = cin.toUpperCase().trim()
    if (isMock()) {
      return mockResult('company_check', c, {
        cin: c, companyName: 'SHARMA TRADERS PRIVATE LIMITED',
        status: 'Active', class: 'Private', incorporationDate: '2018-03-15',
        directors: [{ name: 'RAJESH KUMAR SHARMA', din: '01234567' }, { name: 'PRIYA SHARMA', din: '07654321' }],
        registeredAddress: 'Mumbai, Maharashtra',
      })
    }
    try {
      const r = await karzaPost('/mca', { cin: c, consent: 'Y' })
      return { ok: true, checkType: 'company_check', input: c, data: r, costPaise: 1500 }
    } catch (e) { return { ok: false, checkType: 'company_check', input: c, error: String(e) } }
  }

  async mobileToPan(mobile: string): Promise<CheckResult> {
    const m = mobile.replace(/\D/g, '').slice(-10)
    if (m.length !== 10) {
      return { ok: false, checkType: 'mobile_to_pan', input: mobile, error: 'Invalid mobile number (10 digits)' }
    }
    if (isMock()) {
      return mockResult('mobile_to_pan', m, {
        mobile: m, pan: 'ABCDE1234F', name: 'RAJESH KUMAR SHARMA', verified: true,
      })
    }
    try {
      const r = await karzaPost('/mobile-to-pan', { mobile: m, consent: 'Y' })
      return { ok: true, checkType: 'mobile_to_pan', input: m, data: r, costPaise: 1000 }
    } catch (e) { return { ok: false, checkType: 'mobile_to_pan', input: m, error: String(e) } }
  }

  async mobileToAddress(mobile: string): Promise<CheckResult> {
    const m = mobile.replace(/\D/g, '').slice(-10)
    if (m.length !== 10) {
      return { ok: false, checkType: 'mobile_to_address', input: mobile, error: 'Invalid mobile number (10 digits)' }
    }
    if (isMock()) {
      return mockResult('mobile_to_address', m, {
        mobile: m, name: 'RAJESH KUMAR SHARMA',
        address: 'Flat 402, Shanti Apartments, Andheri West, Mumbai 400053',
        city: 'Mumbai', state: 'Maharashtra', pincode: '400053',
      })
    }
    try {
      const r = await karzaPost('/mobile-to-address', { mobile: m, consent: 'Y' })
      return { ok: true, checkType: 'mobile_to_address', input: m, data: r, costPaise: 1200 }
    } catch (e) { return { ok: false, checkType: 'mobile_to_address', input: m, error: String(e) } }
  }

  async profile360(id: string): Promise<CheckResult> {
    const v = id.trim()
    if (isMock()) {
      return mockResult('profile_360', v, {
        name: 'RAJESH KUMAR SHARMA', pan: 'ABCDE1234F', mobile: '98200XXXXX',
        email: 'r***@gmail.com', address: 'Andheri West, Mumbai 400053',
        dob: '1985-**-**', gender: 'Male',
      })
    }
    try {
      const r = await karzaPost('/profile-360', { id: v, consent: 'Y' })
      return { ok: true, checkType: 'profile_360', input: v, data: r, costPaise: 2000 }
    } catch (e) { return { ok: false, checkType: 'profile_360', input: v, error: String(e) } }
  }

  async panToContact(pan: string): Promise<CheckResult> {
    const p = pan.toUpperCase().trim()
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) {
      return { ok: false, checkType: 'pan_to_contact', input: pan, error: 'Invalid PAN format (ABCDE1234F)' }
    }
    if (isMock()) {
      return mockResult('pan_to_contact', p, {
        pan: p, mobile: '98200XXXXX', email: 'r***@gmail.com', name: 'RAJESH KUMAR SHARMA',
      })
    }
    try {
      const r = await karzaPost('/pan-to-contact', { pan: p, consent: 'Y' })
      return { ok: true, checkType: 'pan_to_contact', input: p, data: r, costPaise: 800 }
    } catch (e) { return { ok: false, checkType: 'pan_to_contact', input: p, error: String(e) } }
  }

  async creditReport(pan: string, mobile: string): Promise<CheckResult> {
    const p = pan.toUpperCase().trim()
    const m = mobile.replace(/\D/g, '').slice(-10)
    if (isMock()) {
      return mockResult('credit_report', `${p} / ${m}`, {
        pan: p, score: 742, scoreRange: '300-900', rating: 'Good',
        activeLoans: 2, totalOutstanding: 185000, defaults: 0,
        lastDefault: null, enquiriesLast6M: 3,
        summary: 'Repayment behaviour acha hai. Koi default nahi.',
      })
    }
    try {
      const r = await karzaPost('/credit-report', { pan: p, mobile: m, consent: 'Y' })
      return { ok: true, checkType: 'credit_report', input: `${p} / ${m}`, data: r, costPaise: 7500 }
    } catch (e) { return { ok: false, checkType: 'credit_report', input: `${p} / ${m}`, error: String(e) } }
  }
}
