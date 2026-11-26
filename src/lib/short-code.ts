import { randomInt } from "node:crypto"

/*
 * QR short codes, e.g. qrfeed.app/f/k7m2xq9npd. 31 symbols with no look-alikes (0/o, 1/l/i),
 * so a code printed on a sticker can be typed by hand. 10 characters ≈ 49 bits: not guessable,
 * and the intake endpoint is rate-limited on top of that.
 */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
const LENGTH = 10
const PATTERN = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`)

export function generateShortCode(): string {
  let code = ""
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

export function isShortCode(value: string): boolean {
  return PATTERN.test(value)
}
