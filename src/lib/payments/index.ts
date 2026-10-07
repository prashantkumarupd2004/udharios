/**
 * Payment Gateway Factory
 *
 * Merchant ke configured gateway ka instance deta hai.
 * Naya gateway add karna ho to bas yahan register karo!
 */

import type { PaymentGateway, GatewayId } from './types'
import { RazorpayGateway } from './razorpay'
import { UpiVpaGateway } from './upiVpa'
import { PhonePeGateway } from './phonepe'
import { CashfreeGateway } from './cashfree'
import { PayUGateway } from './payu'

const REGISTRY: Record<GatewayId, () => PaymentGateway> = {
  razorpay: () => new RazorpayGateway(),
  upi_vpa: () => new UpiVpaGateway(),
  phonepe: () => new PhonePeGateway(),
  cashfree: () => new CashfreeGateway(),
  payu: () => new PayUGateway(),
}

export function getGateway(id: GatewayId): PaymentGateway {
  const factory = REGISTRY[id]
  if (!factory) throw new Error(`Unknown gateway: ${id}`)
  return factory()
}

export function getAvailableGateways(): GatewayId[] {
  return Object.keys(REGISTRY) as GatewayId[]
}

/** Kya ye gateway abhi usable hai (adapter ready)? */
export function isGatewayReady(id: GatewayId): boolean {
  try {
    getGateway(id)
    return true
  } catch {
    return false
  }
}
