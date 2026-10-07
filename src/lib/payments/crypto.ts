/**
 * Gateway credentials encryption
 *
 * Merchant ki payment gateway keys DB me encrypted store hoti hain.
 * Key: GATEWAY_ENCRYPTION_KEY env var (32 bytes hex).
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.GATEWAY_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'GATEWAY_ENCRYPTION_KEY missing — 64-char hex string chahiye. ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encryptCredentials(creds: Record<string, string>): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(creds), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:data (sab hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptCredentials(encrypted: string): Record<string, string> {
  const key = getKey()
  const [ivHex, tagHex, dataHex] = encrypted.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted format')
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString('utf8'))
}

/** Masked version — UI me dikhane ke liye (secrets chhupake) */
export function maskCredentials(
  creds: Record<string, string>,
  secretKeys: string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(creds)) {
    out[k] = secretKeys.includes(k) && v ? '••••••••' : v
  }
  return out
}
