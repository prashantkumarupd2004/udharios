// i18n/hi.ts — Hinglish strings (default language)
export const hi = {
  // Nav
  nav: {
    dashboard: 'Dashboard',
    customers: 'Customers',
    udhaari: 'Udhaari',
    promises: 'Promises',
    disputes: 'Disputes',
    activity: 'Activity',
    settings: 'Settings',
    reports: 'Reports',
  },

  // Dashboard
  dashboard: {
    title: 'Ugaahi',
    subtitle: 'Aapka collection assistant',
    totalOutstanding: 'Total Baaki',
    totalOverdue: 'Overdue',
    collectedThisWeek: 'Is Hafte Vasool',
    collectedThisMonth: 'Is Mahine Vasool',
    collectionRate: 'Collection Rate',
    openPromises: 'Khule Promises',
    openDisputes: 'Khule Disputes',
    defaulters: 'Defaulter List',
  },

  // Customers
  customers: {
    title: 'Aapke Customers',
    addNew: 'Naya Customer Jodein',
    import: 'CSV Import',
    search: 'Customer search karein...',
    name: 'Naam',
    phone: 'Mobile',
    consent: 'Consent',
    consentGiven: 'Haan',
    consentMissing: 'Nahi',
    optedOut: 'Opt Out',
    activeOutstandings: 'Active Udhaar',
    addForm: {
      title: 'Naya Customer',
      name: 'Customer ka naam',
      phone: 'Mobile number',
      consentLabel: 'Customer ne reminders ke liye consent diya hai ✓',
      consentRequired: 'Consent dena zaroori hai',
      notes: 'Notes (optional)',
      submit: 'Customer Add Karo',
    },
  },

  // Outstandings
  outstandings: {
    title: 'Udhaari Ledger',
    addNew: 'Naya Udhaar',
    filterAll: 'Sab',
    filterOverdue: 'Overdue',
    filterUpcoming: 'Aane Wala',
    filterPaid: 'Paid',
    amount: 'Amount',
    dueDate: 'Due Date',
    customer: 'Customer',
    statusField: 'Status',
    invoiceNo: 'Invoice No',
    addForm: {
      title: 'Naya Udhaar Add Karo',
      customer: 'Customer chuno',
      amount: 'Amount (₹)',
      dueDate: 'Due Date',
      invoiceNo: 'Invoice Number (optional)',
      notes: 'Notes',
      uploadPhoto: 'Invoice photo upload karo',
      submit: 'Udhaar Add Karo',
    },
    statusLabels: {
      upcoming: 'Aane Wala',
      overdue: 'Baaki',
      promised: 'Promise Mila',
      disputed: 'Dispute Hai',
      paid: 'Payment Mil Gaya ✓',
      written_off: 'Write Off',
    },
  },

  // Payments
  payments: {
    paymentReceived: 'Payment Mil Gaya ✓',
    sendPayLink: 'Payment Link Bhejo',
    linkCreated: 'Link bana diya gaya',
    paid: 'Paid',
    pending: 'Pending',
  },

  // Reminders
  reminders: {
    title: 'Reminder Rules',
    default: 'Default Rule',
    stage: 'Stage',
    day: 'Din',
    channel: 'Channel',
    template: 'Template',
    addStage: 'Stage Jodo',
    save: 'Save Karo',
  },

  // Actions
  actions: {
    edit: 'Edit',
    delete: 'Delete',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Band Karo',
    back: 'Wapas',
    viewDetails: 'Details Dekho',
    markPaid: 'Paid Mark Karo',
    createPromise: 'Promise Lo',
    raiseDispute: 'Dispute Karo',
    triggerCall: 'Call Karo',
  },

  // Errors
  errors: {
    generic: 'Kuch galat ho gaya. Dobara try karein.',
    unauthorized: 'Login required',
    notFound: 'Nahi mila',
    consentRequired: 'Customer consent zaroori hai',
    validPhone: 'Valid Indian phone number daalein',
  },

  // Confirm dialogs
  confirm: {
    delete: 'Kya aap sachchi mein delete karna chahte hain?',
    markPaid: 'Kya aap yeh payment paid mark karna chahte hain?',
    writeOff: 'Kya aap yeh outstanding write off karna chahte hain?',
    triggerCall: 'Kya aap customer ko call karenge?',
  },

  // Activity
  activity: {
    title: 'Activity Timeline',
    empty: 'Abhi koi activity nahi hai',
    types: {
      'reminder.sent': 'Reminder bheja gaya',
      'payment.received': 'Payment mili',
      'call.placed': 'Call ki gayi',
      'promise.created': 'Promise liya gaya',
      'promise.broken': 'Promise toot gaya',
      'dispute.opened': 'Dispute khola gaya',
      'escalation.triggered': 'Escalation ki gayi',
    },
  },

  // Landing
  landing: {
    hero: {
      headline: 'Udhaari collection ab automatic',
      subheadline: 'WhatsApp reminders, AI voice calls, aur UPI payment links — sab automatic. Aap bas dekho.',
      cta: 'Free mein shuru karein',
      demo: 'Demo dekho',
    },
    pricing: {
      title: 'Simple Pricing',
      trial: { name: 'Free Trial', duration: '14 din', price: '₹0', features: ['5 customers', '50 reminders', 'Dashboard'] },
      starter: { name: 'Starter', price: '₹499/maah', features: ['Unlimited customers', 'WhatsApp reminders', 'Razorpay payment links', 'Dashboard'] },
      pro: { name: 'Pro', price: '₹999/maah', features: ['Sab starter features', 'AI voice calls', 'CSV import', 'Priority support'] },
    },
  },
}

export type HinglishStrings = typeof hi
