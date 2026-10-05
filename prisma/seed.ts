/**
 * prisma/seed.ts — Development seed data
 * Run: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Seed merchant
  const merchant = await prisma.merchant.upsert({
    where: { phone: '+919876543210' },
    update: {},
    create: {
      phone: '+919876543210',
      businessName: 'Gupta General Store',
      category: 'kirana',
      plan: 'pro',
      upiVpa: 'gupta@upi',
      quietStart: '21:00',
      quietEnd: '09:00',
      users: {
        create: {
          role: 'owner',
          name: 'Ramesh Gupta',
          supabaseId: 'seed-user-id-1',
        },
      },
      reminderRules: {
        create: {
          name: 'Default',
          isDefault: true,
          stages: [
            { dayOffset: 1,  channel: 'whatsapp', templateName: 'T1_polite' },
            { dayOffset: 3,  channel: 'whatsapp', templateName: 'T2_with_link' },
            { dayOffset: 5,  channel: 'whatsapp', templateName: 'T3_firm' },
            { dayOffset: 7,  channel: 'voice',    templateName: null },
            { dayOffset: 10, channel: 'voice',    templateName: null },
            { dayOffset: 14, channel: 'whatsapp', templateName: 'T4_final' },
            { dayOffset: 15, channel: 'escalate', templateName: null },
          ],
        },
      },
    },
  })

  console.log('✅ Merchant created:', merchant.id)

  // Seed customers
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { merchantId_phone: { phone: '+919111111111', merchantId: merchant.id } },
      update: {},
      create: {
        merchantId: merchant.id,
        name: 'Priya Sharma',
        phone: '+919111111111',
        consent: true,
        consentAt: new Date(),
      },
    }),
    prisma.customer.upsert({
      where: { merchantId_phone: { phone: '+919222222222', merchantId: merchant.id } },
      update: {},
      create: {
        merchantId: merchant.id,
        name: 'Vijay Mehta',
        phone: '+919222222222',
        consent: true,
        consentAt: new Date(),
      },
    }),
    prisma.customer.upsert({
      where: { merchantId_phone: { phone: '+919333333333', merchantId: merchant.id } },
      update: {},
      create: {
        merchantId: merchant.id,
        name: 'Sunita Patel',
        phone: '+919333333333',
        consent: true,
        consentAt: new Date(),
      },
    }),
    prisma.customer.upsert({
      where: { merchantId_phone: { phone: '+919444444444', merchantId: merchant.id } },
      update: {},
      create: {
        merchantId: merchant.id,
        name: 'Ajay Kumar',
        phone: '+919444444444',
        consent: false, // No consent — should not receive reminders
        consentAt: null,
      },
    }),
  ])

  console.log('✅ Customers created:', customers.length)

  // Seed outstandings
  const today = new Date()
  const daysAgo = (n: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - n)
    return d
  }
  const daysFromNow = (n: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + n)
    return d
  }

  const outstandings = await Promise.all([
    prisma.outstanding.create({
      data: {
        merchantId: merchant.id,
        customerId: customers[0].id,
        invoiceNo: 'INV-001',
        amount: 15000,
        dueDate: daysAgo(45), // 45 days overdue
        status: 'overdue',
        currentStage: 3,
      },
    }),
    prisma.outstanding.create({
      data: {
        merchantId: merchant.id,
        customerId: customers[1].id,
        invoiceNo: 'INV-002',
        amount: 8500,
        dueDate: daysAgo(5),
        status: 'promised',
        currentStage: 2,
      },
    }),
    prisma.outstanding.create({
      data: {
        merchantId: merchant.id,
        customerId: customers[2].id,
        invoiceNo: 'INV-003',
        amount: 22000,
        dueDate: daysAgo(95), // 95 days — defaulter
        status: 'disputed',
        currentStage: 6,
      },
    }),
    prisma.outstanding.create({
      data: {
        merchantId: merchant.id,
        customerId: customers[0].id,
        invoiceNo: 'INV-004',
        amount: 5000,
        dueDate: daysFromNow(7), // Future — upcoming
        status: 'upcoming',
        currentStage: 0,
      },
    }),
  ])

  console.log('✅ Outstandings created:', outstandings.length)

  // Seed a promise for outstanding[1]
  await prisma.promise.create({
    data: {
      outstandingId: outstandings[1].id,
      customerId: customers[1].id,
      merchantId: merchant.id,
      promisedDate: daysFromNow(3),
      source: 'whatsapp',
      status: 'open',
      notes: 'Vijay bhai ne kaha kal se 3 din mein denge',
    },
  })

  // Seed a dispute for outstanding[2]
  await prisma.dispute.create({
    data: {
      outstandingId: outstandings[2].id,
      customerId: customers[2].id,
      merchantId: merchant.id,
      reason: 'Kuch items quality se related problem thi',
      status: 'open',
    },
  })

  // Seed audit logs
  await prisma.auditLog.create({
    data: {
      merchantId: merchant.id,
      actor: 'merchant',
      action: 'outstanding.created',
      entity: 'outstanding',
      entityId: outstandings[0].id,
      payload: { amount: 15000 },
      payloadHash: 'seed-hash-1',
    },
  })
  await prisma.auditLog.create({
    data: {
      merchantId: merchant.id,
      actor: 'system:reminder-engine',
      action: 'reminder.sent',
      entity: 'outstanding',
      entityId: outstandings[0].id,
      payload: { channel: 'whatsapp', stage: 0, templateName: 'T1_polite' },
      payloadHash: 'seed-hash-2',
    },
  })

  console.log('✅ Seed complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
