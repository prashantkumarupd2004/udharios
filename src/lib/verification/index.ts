/**
 * Verification provider factory.
 * Abhi Karza hai (mock mode jab tak KARZA_API_KEY nahi hai).
 * Baad me Signzy/IDfy add kar sakte ho — interface same rahega.
 */
import { KarzaProvider } from './karza'
import type { VerificationProvider } from './types'

export function getVerificationProvider(): VerificationProvider {
  // Future: provider env se select karo
  return new KarzaProvider()
}

export * from './types'
export { KarzaProvider } from './karza'
