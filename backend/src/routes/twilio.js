/**
 * Twilio WhatsApp Routes
 *
 * All endpoints require the X-Admin-Secret header (same admin secret used
 * by the rest of the API), except the /webhook which is called by Twilio's
 * servers and validated via X-Twilio-Signature.
 *
 * Base path: /api/twilio  (registered in src/index.js)
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────
 *  GET  /api/twilio/config           Config status (no credentials)
 *  GET  /api/twilio/templates        Available message templates
 *  POST /api/twilio/send             Send one message
 *  POST /api/twilio/bulk             Bulk send to a provided phone list
 *  POST /api/twilio/campaign         Bulk send to all registered phones
 *  POST /api/twilio/schedule         Schedule a campaign (structure)
 *  GET  /api/twilio/status           Active campaign status
 *  GET  /api/twilio/history          Last 20 completed campaigns
 *  POST /api/twilio/webhook          Twilio incoming-message webhook
 * ─────────────────────────────────────────────────────────
 */

import { Router }               from 'express';
import Registration             from '../models/Registration.js';
import { requireAdmin }         from '../middleware/auth.js';
import { validateTwilioWebhook} from '../middleware/validateTwilio.js';
import { sanitizePhone, sanitizePhones } from '../utils/phoneUtils.js';
import {
  sendMessage,
  sendBulkCampaign,
  createScheduledCampaign,
  getCampaignStatus,
  getCampaignHistory,
  getConfig,
  getTemplates,
} from '../services/twilioWhatsapp.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twilio/config
// Returns Twilio connection status. Safe — does NOT expose credentials.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', requireAdmin, (_req, res) => {
  res.json(getConfig());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twilio/templates
// List all built-in message templates with a rendered preview.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/templates', requireAdmin, (_req, res) => {
  res.json({ templates: getTemplates() });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/send
// Send a single WhatsApp message to one recipient.
//
// Body:
//   { phone: string, message: string }
//
// Example:
//   { "phone": "+573001234567", "message": "Hola {{phone}}, el drop es hoy!" }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send', requireAdmin, async (req, res) => {
  const { phone, message } = req.body;

  if (!phone)           return res.status(400).json({ error: 'phone es requerido' });
  if (!message?.trim()) return res.status(400).json({ error: 'message es requerido' });

  const sanitized = sanitizePhone(phone);
  if (!sanitized) return res.status(400).json({ error: `Número inválido: ${phone}` });

  try {
    const result = await sendMessage(sanitized, message.trim());
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/bulk
// Bulk send to a manually provided list of phone numbers.
// Responds 202 immediately; campaign runs in the background.
//
// Body:
//   {
//     phones:  string[],          // required
//     message: string,            // required, supports {{phone}}
//     options: {                  // optional
//       delayMin:   number (ms),  // default 800
//       delayMax:   number (ms),  // default 2000
//       batchSize:  number,       // default 10
//       batchDelay: number (ms)   // default 5000
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bulk', requireAdmin, async (req, res) => {
  const { phones, message, options } = req.body;

  if (!Array.isArray(phones) || phones.length === 0)
    return res.status(400).json({ error: 'phones debe ser un array no vacío' });

  if (!message?.trim())
    return res.status(400).json({ error: 'message es requerido' });

  const { valid, invalid } = sanitizePhones(phones);

  if (valid.length === 0)
    return res.status(400).json({ error: 'No hay números válidos en la lista', invalid });

  const current = getCampaignStatus();
  if (current.status === 'running')
    return res.status(409).json({ error: 'Ya hay una campaña en curso. Espera a que termine.' });

  // Acknowledge immediately — the HTTP client doesn't block waiting for all sends
  res.status(202).json({
    ok:      true,
    total:   valid.length,
    skipped: invalid.length,
    invalid: invalid.length > 0 ? invalid : undefined,
    message: 'Campaña iniciada en background. Sigue el progreso vía WebSocket (twilio:campaign:progress).',
  });

  sendBulkCampaign(valid, message.trim(), options || {}).catch(err => {
    console.error('[Twilio] Error en campaña bulk:', err.message);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/campaign
// Bulk send to ALL registered phones in MongoDB.
// Responds 202 immediately.
//
// Body:
//   {
//     message: string,   // required
//     options: Object    // optional (same as /bulk)
//   }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign', requireAdmin, async (req, res) => {
  const { message, options } = req.body;

  if (!message?.trim())
    return res.status(400).json({ error: 'message es requerido' });

  const current = getCampaignStatus();
  if (current.status === 'running')
    return res.status(409).json({ error: 'Ya hay una campaña en curso. Espera a que termine.' });

  const registrations = await Registration.find({}, 'phone').lean();
  const phones        = registrations.map(r => r.phone).filter(Boolean);

  if (phones.length === 0)
    return res.json({ ok: true, total: 0, message: 'No hay números registrados.' });

  const { valid, invalid } = sanitizePhones(phones);

  res.status(202).json({
    ok:      true,
    total:   valid.length,
    skipped: invalid.length,
    message: 'Campaña a todos los registros iniciada en background.',
  });

  sendBulkCampaign(valid, message.trim(), options || {}).catch(err => {
    console.error('[Twilio] Error en campaña a registros:', err.message);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/schedule
// Schedule a campaign for a future date/time.
// Currently returns the scheduling structure; activate with Bull/BullMQ + Redis.
//
// Body:
//   {
//     phones:  string[]|undefined,   // optional — defaults to all registrations
//     message: string,               // required
//     sendAt:  string,               // required, ISO 8601 (e.g. "2025-12-25T10:00:00Z")
//     options: Object                // optional
//   }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/schedule', requireAdmin, async (req, res) => {
  const { phones, message, sendAt, options } = req.body;

  if (!message?.trim())
    return res.status(400).json({ error: 'message es requerido' });

  if (!sendAt)
    return res.status(400).json({ error: 'sendAt es requerido (formato ISO 8601)' });

  const scheduledDate = new Date(sendAt);
  if (isNaN(scheduledDate.getTime()))
    return res.status(400).json({ error: 'sendAt debe ser una fecha ISO 8601 válida' });

  if (scheduledDate <= new Date())
    return res.status(400).json({ error: 'sendAt debe ser una fecha futura' });

  // Use provided list or fall back to all registered numbers
  let targetPhones = phones;
  if (!Array.isArray(targetPhones) || targetPhones.length === 0) {
    const registrations = await Registration.find({}, 'phone').lean();
    targetPhones        = registrations.map(r => r.phone).filter(Boolean);
  }

  const { valid, invalid } = sanitizePhones(targetPhones);

  if (valid.length === 0)
    return res.status(400).json({ error: 'No hay números válidos para programar' });

  const scheduled = createScheduledCampaign(valid, message.trim(), sendAt, options || {});

  res.status(201).json({
    ok:   true,
    ...scheduled,
    invalid: invalid.length > 0 ? invalid : undefined,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twilio/status
// Returns the status of the currently running (or last completed) campaign.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', requireAdmin, (_req, res) => {
  res.json(getCampaignStatus());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twilio/history
// Returns the last 20 completed campaigns.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', requireAdmin, (_req, res) => {
  res.json({ campaigns: getCampaignHistory() });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/webhook
// Receives incoming WhatsApp messages and delivery status callbacks from Twilio.
// Twilio sends URL-encoded form data (not JSON).
//
// Set this URL in your Twilio console:
//   https://your-domain.com/api/twilio/webhook
//
// The validateTwilioWebhook middleware is applied in production to verify
// the X-Twilio-Signature header. Set WEBHOOK_BASE_URL in .env.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', validateTwilioWebhook, (req, res) => {
  const {
    From,
    To,
    Body,
    MessageSid,
    MessageStatus,
    NumMedia,
  } = req.body;

  const from   = (From  || '').replace('whatsapp:', '');
  const to     = (To    || '').replace('whatsapp:', '');
  const body   = Body   || '';
  const status = MessageStatus || 'incoming';

  if (MessageStatus) {
    // Delivery status callback (sent, delivered, read, failed)
    console.log(`[Twilio][Webhook] Status update — SID: ${MessageSid} → ${MessageStatus}`);
  } else {
    // Incoming message from a user
    console.log(`[Twilio][Webhook] Mensaje entrante de ${from}: "${body}" (media: ${NumMedia || 0})`);

    // TODO: Extend here to:
    //   - Save message to MongoDB (e.g. IncomingMessage model)
    //   - Broadcast to admin panel via getIO().emit('twilio:incoming', { from, body, at })
    //   - Auto-reply with a TwiML response based on keywords
  }

  // Twilio requires a valid TwiML response; empty <Response> means "no reply"
  res.set('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

export default router;
