// i18n/en.ts — English strings (toggle)
export const en = {
  nav: {
    dashboard: 'Dashboard',
    customers: 'Customers',
    udhaari: 'Outstandings',
    promises: 'Promises',
    disputes: 'Disputes',
    activity: 'Activity',
    settings: 'Settings',
    reports: 'Reports',
  },

  dashboard: {
    title: 'Ugaahi',
    subtitle: 'Your collection assistant',
    totalOutstanding: 'Total Outstanding',
    totalOverdue: 'Overdue',
    collectedThisWeek: 'Collected This Week',
    collectedThisMonth: 'Collected This Month',
    collectionRate: 'Collection Rate',
    openPromises: 'Open Promises',
    openDisputes: 'Open Disputes',
    defaulters: 'Defaulter List',
  },

  customers: {
    title: 'Your Customers',
    addNew: 'Add Customer',
    import: 'CSV Import',
    search: 'Search customers...',
    name: 'Name',
    phone: 'Phone',
    consent: 'Consent',
    consentGiven: 'Yes',
    consentMissing: 'No',
    optedOut: 'Opted Out',
    activeOutstandings: 'Active Outstandings',
    addForm: {
      title: 'New Customer',
      name: 'Customer name',
      phone: 'Phone number',
      consentLabel: 'Customer has consented to receive reminders ✓',
      consentRequired: 'Consent is required',
      notes: 'Notes (optional)',
      submit: 'Add Customer',
    },
  },

  outstandings: {
    title: 'Outstandings Ledger',
    addNew: 'Add Outstanding',
    filterAll: 'All',
    filterOverdue: 'Overdue',
    filterUpcoming: 'Upcoming',
    filterPaid: 'Paid',
    amount: 'Amount',
    dueDate: 'Due Date',
    customer: 'Customer',
    status: 'Status',
    invoiceNo: 'Invoice No',
    addForm: {
      title: 'Add Outstanding',
      customer: 'Select customer',
      amount: 'Amount (₹)',
      dueDate: 'Due Date',
      invoiceNo: 'Invoice Number (optional)',
      notes: 'Notes',
      uploadPhoto: 'Upload invoice photo',
      submit: 'Add Outstanding',
    },
    statusLabels: {
      upcoming: 'Upcoming',
      overdue: 'Overdue',
      promised: 'Promised',
      disputed: 'Disputed',
      paid: 'Paid ✓',
      written_off: 'Written Off',
    },
  },

  payments: {
    paymentReceived: 'Payment Received ✓',
    sendPayLink: 'Send Payment Link',
    linkCreated: 'Link created',
    paid: 'Paid',
    pending: 'Pending',
  },

  reminders: {
    title: 'Reminder Rules',
    default: 'Default Rule',
    stage: 'Stage',
    day: 'Day',
    channel: 'Channel',
    template: 'Template',
    addStage: 'Add Stage',
    save: 'Save',
  },

  actions: {
    edit: 'Edit',
    delete: 'Delete',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    back: 'Back',
    viewDetails: 'View Details',
    markPaid: 'Mark Paid',
    createPromise: 'Create Promise',
    raiseDispute: 'Raise Dispute',
    triggerCall: 'Trigger Call',
  },

  errors: {
    generic: 'Something went wrong. Please try again.',
    unauthorized: 'Login required',
    notFound: 'Not found',
    consentRequired: 'Customer consent is required',
    validPhone: 'Enter a valid Indian phone number',
  },

  confirm: {
    delete: 'Are you sure you want to delete this?',
    markPaid: 'Mark this payment as paid?',
    writeOff: 'Write off this outstanding?',
    triggerCall: 'Trigger an AI call to this customer?',
  },

  activity: {
    title: 'Activity Timeline',
    empty: 'No activity yet',
    types: {
      'reminder.sent': 'Reminder sent',
      'payment.received': 'Payment received',
      'call.placed': 'Call placed',
      'promise.created': 'Promise recorded',
      'promise.broken': 'Promise broken',
      'dispute.opened': 'Dispute opened',
      'escalation.triggered': 'Escalated to merchant',
    },
  },

  landing: {
    hero: {
      headline: 'Automate your payment collection',
      subheadline: 'WhatsApp reminders, AI voice calls, and UPI payment links — all automated. You just watch.',
      cta: 'Start Free Trial',
      demo: 'Watch Demo',
    },
    pricing: {
      title: 'Simple Pricing',
      trial: { name: 'Free Trial', duration: '14 days', price: '₹0', features: ['5 customers', '50 reminders', 'Dashboard'] },
      starter: { name: 'Starter', price: '₹499/month', features: ['Unlimited customers', 'WhatsApp reminders', 'Razorpay payment links', 'Dashboard'] },
      pro: { name: 'Pro', price: '₹999/month', features: ['All starter features', 'AI voice calls', 'CSV import', 'Priority support'] },
    },
  },
}

export type EnglishStrings = typeof en
