/**
 * Phone number utilities for WhatsApp messaging.
 *
 * Accepts formats: +573001234567, 573001234567, 0057300..., (300) 123-4567
 * Always outputs E.164: +573001234567
 */

/**
 * Sanitize and validate a single phone number.
 * Returns E.164 format ("+country+number") or null if invalid.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function sanitizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Remove spaces, dashes, parentheses, dots
  let cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');

  // Normalize 00xx → +xx (international prefix)
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);

  // Ensure starts with +
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;

  // Must match E.164: + followed by 7–15 digits only
  if (!/^\+\d{7,15}$/.test(cleaned)) return null;

  return cleaned;
}

/**
 * Sanitize an array of phone numbers.
 * Returns { valid: string[], invalid: string[] }
 *
 * @param {string[]} phones
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function sanitizePhones(phones) {
  if (!Array.isArray(phones)) return { valid: [], invalid: [] };

  const valid   = [];
  const invalid = [];

  for (const p of phones) {
    const result = sanitizePhone(p);
    if (result) valid.push(result);
    else         invalid.push(String(p));
  }

  return { valid, invalid };
}

/**
 * Deduplicate a list of already-sanitized E.164 numbers.
 *
 * @param {string[]} phones
 * @returns {string[]}
 */
export function deduplicatePhones(phones) {
  return [...new Set(phones)];
}

/**
 * Format an E.164 number for Twilio WhatsApp API: "whatsapp:+573001234567"
 *
 * @param {string} phone  E.164 format
 * @returns {string}
 */
export function toWhatsAppAddress(phone) {
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}
