/**
 * Twilio WhatsApp Service
 *
 * Handles individual messages, bulk campaigns with rate-limiting,
 * and a scheduling structure ready for Bull/BullMQ + Redis.
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID   — Your Twilio Account SID (starts with "AC")
 *   TWILIO_AUTH_TOKEN    — Your Twilio Auth Token
 *   TWILIO_WHATSAPP_NUMBER — Sender number, e.g. +14155238886 or whatsapp:+14155238886
 *   BRAND_URL            — Brand landing URL (used in templates)
 */

import twilio         from 'twilio';
import { EventEmitter } from 'events';
import { sanitizePhone, sanitizePhones, deduplicatePhones, toWhatsAppAddress } from '../utils/phoneUtils.js';

// ─── Event bus ────────────────────────────────────────────────────────────────
// Consumed by socket/index.js to broadcast real-time progress to the frontend.
export const twilioEvents = new EventEmitter();

// ─── Message templates ────────────────────────────────────────────────────────
const TEMPLATES = {
  reminder: (url) =>
    `⏰ *Cuscus Hats* — El drop se acerca. Las unidades son limitadas, prepárate.\n\n🔗 ${url}`,
  launch: (url) =>
    `🎩 *¡El drop está LIVE!* Las gorras de Cuscus Hats ya están disponibles. Entra ahora antes de que se agoten:\n\n🔗 ${url}`,
  early_access: (url) =>
    `⭐ *Acceso anticipado activado.* Eres parte del primer grupo en acceder al drop de Cuscus Hats.\n\n🔗 ${url}`,
};

// ─── In-memory state ──────────────────────────────────────────────────────────
// activeCampaign holds the status of the currently running (or last completed) campaign.
let activeCampaign  = null;
const campaignHistory = [];  // keeps last MAX_HISTORY entries
const MAX_HISTORY   = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level, message, meta = {}) {
  const ts    = new Date().toISOString();
  const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
  const line  = `[Twilio][${ts}] ${message}${extra ? ' ' + extra : ''}`;
  if (level === 'error') console.error(line);
  else                   console.log(line);
}

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

function interpolate(text, vars = {}) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{{${key}}}`));
}

// ─── Twilio client factory ────────────────────────────────────────────────────

function buildClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    throw new Error('Twilio no configurado: falta TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en .env');
  }
  if (sid.startsWith('ACxxx') || token === 'your_auth_token') {
    throw new Error('Twilio no configurado: reemplaza las credenciales de ejemplo en .env');
  }

  return twilio(sid, token);
}

function getSenderAddress() {
  const raw = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM;
  if (!raw) {
    throw new Error('Twilio no configurado: falta TWILIO_WHATSAPP_NUMBER en .env');
  }
  // Ensure "whatsapp:" prefix
  return raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a safe configuration summary (no credentials exposed).
 */
export function getConfig() {
  const sid   = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN  || '';
  const from  = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '';

  const configured =
    sid.length > 0 &&
    token.length > 0 &&
    !sid.startsWith('ACxxx') &&
    token !== 'your_auth_token';

  return {
    configured,
    accountSid: sid ? sid.slice(0, 6) + '...' + sid.slice(-4) : null,
    from:       from || null,
  };
}

/**
 * Returns all available message templates with a rendered preview.
 */
export function getTemplates() {
  const url = process.env.BRAND_URL || 'https://cuscushats.com';
  return Object.entries(TEMPLATES).map(([key, fn]) => ({ key, preview: fn(url) }));
}

/**
 * Returns the status of the active (or last completed) campaign.
 */
export function getCampaignStatus() {
  return activeCampaign ? { ...activeCampaign } : { status: 'idle' };
}

/**
 * Returns the last MAX_HISTORY completed campaigns.
 */
export function getCampaignHistory() {
  return [...campaignHistory];
}

// ─── Send individual message ──────────────────────────────────────────────────

/**
 * Send a single WhatsApp message via Twilio.
 *
 * @param {string} phone   - Recipient phone, any reasonable format.
 * @param {string} message - Message body. Supports {{phone}} placeholder.
 * @param {Object} vars    - Extra template variables.
 * @returns {Promise<{ sid: string, status: string, phone: string }>}
 */
export async function sendMessage(phone, message, vars = {}) {
  if (!message?.trim()) throw new Error('El mensaje no puede estar vacío');

  const sanitized = sanitizePhone(phone);
  if (!sanitized) throw new Error(`Número de teléfono inválido: ${phone}`);

  const client  = buildClient();
  const from    = getSenderAddress();
  const body    = interpolate(message.trim(), { phone: sanitized, ...vars });

  log('info', `Enviando mensaje a ${sanitized}`);

  const msg = await client.messages.create({
    from,
    to:   toWhatsAppAddress(sanitized),
    body,
  });

  log('info', `Mensaje enviado a ${sanitized}`, { sid: msg.sid, status: msg.status });

  return { sid: msg.sid, status: msg.status, phone: sanitized };
}

// ─── Bulk campaign ────────────────────────────────────────────────────────────

/**
 * Send a message to a list of phone numbers.
 * Emits progress events on `twilioEvents` for real-time frontend updates.
 *
 * Rate-limiting options:
 *   delayMin   {number} ms — minimum delay between messages (default 800)
 *   delayMax   {number} ms — maximum delay between messages (default 2000)
 *   batchSize  {number}    — messages per batch before longer pause (default 10)
 *   batchDelay {number} ms — pause after each batch (default 5000)
 *
 * @param {string[]} phones
 * @param {string}   message
 * @param {Object}   [options]
 * @returns {Promise<Object>} Final campaign result
 */
export async function sendBulkCampaign(phones, message, options = {}) {
  if (activeCampaign?.status === 'running') {
    throw new Error('Ya hay una campaña Twilio en curso. Espera a que termine.');
  }

  const {
    delayMin   = 800,
    delayMax   = 2000,
    batchSize  = 10,
    batchDelay = 5000,
    vars       = {},
  } = options;

  // Sanitize & deduplicate
  const { valid, invalid } = sanitizePhones(phones);
  const unique             = deduplicatePhones(valid);

  if (unique.length === 0) throw new Error('No hay números válidos para enviar.');

  const campaignId = Date.now().toString();
  const total      = unique.length;

  activeCampaign = {
    id:          campaignId,
    status:      'running',
    total,
    sent:        0,
    failed:      0,
    skipped:     invalid.length,
    errors:      [],
    current:     null,
    startedAt:   new Date().toISOString(),
    completedAt: null,
  };

  twilioEvents.emit('twilio:campaign:start', { ...activeCampaign });
  log('info', `Campaña ${campaignId} iniciada`, { total, skipped: invalid.length });

  try {
    for (let i = 0; i < unique.length; i++) {
      const phone = unique[i];

      activeCampaign.current = phone;
      twilioEvents.emit('twilio:campaign:progress', {
        ...activeCampaign,
        current: phone,
      });

      try {
        await sendMessage(phone, message, { ...vars, phone });
        activeCampaign.sent++;
      } catch (err) {
        activeCampaign.failed++;
        activeCampaign.errors.push({ phone, error: err.message });
        log('error', `Error enviando a ${phone}`, { error: err.message });
      }

      // After each batch, pause longer to respect Twilio rate limits
      const isLastMessage = i === unique.length - 1;
      if (!isLastMessage) {
        if ((i + 1) % batchSize === 0) {
          log('info', `Pausa de batch tras ${i + 1}/${total} mensajes`);
          await new Promise(r => setTimeout(r, batchDelay));
        } else {
          await randomDelay(delayMin, delayMax);
        }
      }
    }
  } finally {
    activeCampaign.status      = 'done';
    activeCampaign.completedAt = new Date().toISOString();
    activeCampaign.current     = null;

    const finalResult = { ...activeCampaign };

    // Keep history bounded
    campaignHistory.push(finalResult);
    if (campaignHistory.length > MAX_HISTORY) campaignHistory.shift();

    twilioEvents.emit('twilio:campaign:done', finalResult);
    log('info', `Campaña ${campaignId} completada`, {
      sent:   finalResult.sent,
      failed: finalResult.failed,
    });
  }

  return { ...activeCampaign };
}

// ─── Scheduled campaign (structure ready for Bull/BullMQ) ────────────────────

/**
 * Create a scheduled campaign entry.
 *
 * Currently returns the structure without persisting or executing it.
 * To activate scheduling, integrate with Bull/BullMQ + Redis:
 *   - npm install bullmq ioredis
 *   - Create a queue: new Queue('twilio-scheduled')
 *   - Add a job: queue.add('campaign', payload, { delay: ms })
 *   - Create a worker that calls sendBulkCampaign
 *
 * @param {string[]} phones
 * @param {string}   message
 * @param {string}   sendAt   ISO 8601 datetime
 * @param {Object}   [options]
 * @returns {Object} Scheduled campaign descriptor
 */
export function createScheduledCampaign(phones, message, sendAt, options = {}) {
  const { valid, invalid } = sanitizePhones(phones);
  const unique             = deduplicatePhones(valid);
  const scheduledDate      = new Date(sendAt);

  const entry = {
    id:          Date.now().toString(),
    status:      'scheduled',
    phones:      unique,
    skipped:     invalid.length,
    message,
    sendAt:      scheduledDate.toISOString(),
    options,
    createdAt:   new Date().toISOString(),
    note:        'Integrar Bull/BullMQ + Redis para activar ejecución automática.',
  };

  log('info', `Campaña programada creada para ${entry.sendAt}`, { total: unique.length });

  return entry;
}
