import twilio from 'twilio';

/**
 * Validate that an incoming request genuinely comes from Twilio
 * by checking the X-Twilio-Signature header against the payload.
 *
 * Use this middleware on webhook routes in production.
 * Requires the full public URL of the webhook endpoint (set WEBHOOK_BASE_URL in .env).
 *
 * @example
 *   router.post('/webhook', validateTwilioWebhook, handler)
 */
export function validateTwilioWebhook(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken || authToken === 'your_auth_token') {
    console.warn('[Twilio] Webhook validation skipped: TWILIO_AUTH_TOKEN not configured.');
    return next();
  }

  const signature  = req.headers['x-twilio-signature'] || '';
  const baseUrl    = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const webhookUrl = `${baseUrl}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, signature, webhookUrl, req.body || {});

  if (!isValid) {
    return res.status(403).json({ error: 'Firma Twilio inválida — solicitud rechazada.' });
  }

  next();
}
