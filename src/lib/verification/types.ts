/**
 * Verification provider abstraction — Business Background Check
 * Har check type ke liye ek method. Provider: Karza (real) / mock (test mode).
 */

export type CheckType =
  | 'pan_check'         // PAN number → naam, status verify
  | 'company_check'     // CIN → MCA company details
  | 'mobile_to_pan'     // Mobile → linked PAN
  | 'mobile_to_address' // Mobile → address
  | 'profile_360'       // Mobile/PAN → comprehensive profile
  | 'pan_to_contact'    // PAN → mobile/email
  | 'credit_report'     // PAN+mobile → credit score & summary

export interface CheckResult {
  ok: boolean
  checkType: CheckType
  input: string
  data?: Record<string, unknown>
  error?: string
  costPaise?: number
}

export interface VerificationProvider {
  id: string
  name: string
  panCheck(pan: string): Promise<CheckResult>
  companyCheck(cin: string): Promise<CheckResult>
  mobileToPan(mobile: string): Promise<CheckResult>
  mobileToAddress(mobile: string): Promise<CheckResult>
  profile360(id: string): Promise<CheckResult>
  panToContact(pan: string): Promise<CheckResult>
  creditReport(pan: string, mobile: string): Promise<CheckResult>
}

export const CHECK_META: Record<CheckType, { title: string; titleHi: string; desc: string; descHi: string; inputLabel: string; inputPlaceholder: string; icon: string }> = {
  pan_check: {
    title: 'PAN Check', titleHi: 'PAN Check',
    desc: 'Validate PAN card details, verify authenticity and taxpayer info',
    descHi: 'PAN card details verify karo',
    inputLabel: 'PAN Number', inputPlaceholder: 'ABCDE1234F', icon: '🪪',
  },
  company_check: {
    title: 'Company Check', titleHi: 'Company Check',
    desc: 'MCA search — registration status, directors, compliance history',
    descHi: 'Company registration, directors dekho',
    inputLabel: 'CIN Number', inputPlaceholder: 'U12345MH2020PTC123456', icon: '🏢',
  },
  mobile_to_pan: {
    title: 'Mobile to PAN', titleHi: 'Mobile se PAN',
    desc: 'Find PAN linked to a mobile number',
    descHi: 'Mobile number se PAN pata karo',
    inputLabel: 'Mobile Number', inputPlaceholder: '9820021873', icon: '📱',
  },
  mobile_to_address: {
    title: 'Mobile to Address', titleHi: 'Mobile se Address',
    desc: 'Find address details linked to a mobile number',
    descHi: 'Mobile number se address pata karo',
    inputLabel: 'Mobile Number', inputPlaceholder: '9820021873', icon: '📍',
  },
  profile_360: {
    title: '360° Profile', titleHi: '360° Profile',
    desc: 'Comprehensive profile — identity, contact, address in one view',
    descHi: 'Ek me sab details — naam, contact, address',
    inputLabel: 'Mobile / PAN', inputPlaceholder: '9820021873 ya ABCDE1234F', icon: '👤',
  },
  pan_to_contact: {
    title: 'PAN to Contact', titleHi: 'PAN se Contact',
    desc: 'Find mobile number and email linked to a PAN',
    descHi: 'PAN se mobile number aur email pata karo',
    inputLabel: 'PAN Number', inputPlaceholder: 'ABCDE1234F', icon: '📞',
  },
  credit_report: {
    title: 'Credit Report', titleHi: 'Credit Report',
    desc: 'Payment behaviour — credit score, defaults, repayment history',
    descHi: 'Payment behaviour dekho — score, default history',
    inputLabel: 'PAN + Mobile', inputPlaceholder: 'ABCDE1234F, 9820021873', icon: '📊',
  },
}

export const CHECK_TYPES = Object.keys(CHECK_META) as CheckType[]
