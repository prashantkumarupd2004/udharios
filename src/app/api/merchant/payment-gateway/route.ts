/**
 * GET /api/merchant/payment-gateway — Merchant ka gateway config lao
 * PUT /api/merchant/payment-gateway — Gateway select karo + keys save karo
 *
 * Credentials encrypted store hote hain. GET me secrets masked aate hain.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getGateway, isGatewayReady, getAvailableGateways } from '@/lib/payments'
import { GATEWAY_META, type GatewayId } from '@/lib/payments/types'
import {
  encryptCredentials,
  decryptCredentials,
  maskCredentials,
} from '@/lib/payments/crypto'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
  return session?.merchantId ?? null
}

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        paymentGateway: true,
        gatewayCredentials: true,
        gatewayTestMode: true,
        upiVpa: true,
      },
    })
    if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const gatewayId = (merchant.paymentGateway ?? 'upi_vpa') as GatewayId

    // Available gateways with metadata
    const gateways = getAvailableGateways()
      .filter(isGatewayReady)
      .map((id) => ({
        id,
        ...GATEWAY_META[id],
        ready: true,
        fields: getGateway(id).getCredentialFields(),
      }))

    // Current credentials (masked)
    let currentCredentials: Record<string, string> = {}
    if (merchant.gatewayCredentials) {
      try {
        const raw = typeof merchant.gatewayCredentials === 'string'
          ? merchant.gatewayCredentials
          : JSON.stringify(merchant.gatewayCredentials)
        // Agar encrypted string hai to decrypt karo
        let decrypted: Record<string, string> = {}
        try {
          decrypted = decryptCredentials(raw)
        } catch {
          // Shayad plain JSON hai (purana data)
          decrypted = JSON.parse(raw)
        }
        const gw = getGateway(gatewayId)
        const secretKeys = gw.getCredentialFields()
          .filter((f) => f.secret)
          .map((f) => f.key)
        currentCredentials = maskCredentials(decrypted, secretKeys)
      } catch {
        currentCredentials = {}
      }
    }

    return NextResponse.json({
      current: {
        gateway: gatewayId,
        testMode: merchant.gatewayTestMode ?? true,
        credentials: currentCredentials,
        // UPI VPA fallback
        upiVpa: merchant.upiVpa ?? null,
      },
      gateways,
    })
  } catch (err) {
    logger.error('GET /api/merchant/payment-gateway error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { gateway, credentials, testMode } = body as {
      gateway: GatewayId
      credentials: Record<string, string>
      testMode?: boolean
    }

    if (!gateway || !getAvailableGateways().includes(gateway)) {
      return NextResponse.json({ error: 'Invalid gateway' }, { status: 400 })
    }
    if (!isGatewayReady(gateway)) {
      return NextResponse.json(
        { error: 'Ye gateway abhi ready nahi hai — jald aa raha hai!' },
        { status: 400 },
      )
    }

    const gw = getGateway(gateway)
    const requiredFields = gw.getCredentialFields()

    // Masked values (••••••••) ko purani values se replace karo
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { gatewayCredentials: true, paymentGateway: true },
    })
    let existing: Record<string, string> = {}
    if (merchant?.gatewayCredentials) {
      try {
        const raw = typeof merchant.gatewayCredentials === 'string'
          ? merchant.gatewayCredentials
          : JSON.stringify(merchant.gatewayCredentials)
        existing = decryptCredentials(raw)
      } catch { existing = {} }
    }
    // Sirf same gateway ke liye purani values rakho
    if (merchant?.paymentGateway !== gateway) existing = {}

    const merged: Record<string, string> = {}
    for (const field of requiredFields) {
      const incoming = credentials?.[field.key]
      if (incoming && incoming !== '••••••••' && incoming.trim() !== '') {
        merged[field.key] = incoming.trim()
      } else if (existing[field.key]) {
        merged[field.key] = existing[field.key]
      }
    }

    // Required fields check (non-secret wale kam se kam hone chahiye)
    const missing = requiredFields
      .filter((f) => !merged[f.key])
      .map((f) => f.label)
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Ye fields bharo: ${missing.join(', ')}` },
        { status: 400 },
      )
    }

    const encrypted = encryptCredentials(merged)

    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        paymentGateway: gateway,
        gatewayCredentials: encrypted,
        gatewayTestMode: testMode ?? true,
      },
    })

    logger.info('Merchant payment gateway updated', { merchantId, gateway })

    return NextResponse.json({
      success: true,
      gateway,
      message: `${GATEWAY_META[gateway].name} connect ho gaya! ✅`,
    })
  } catch (err) {
    logger.error('PUT /api/merchant/payment-gateway error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
