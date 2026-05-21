import { Router }                              from 'express';
import { sendCampaign, getStatus, isCampaignRunning } from '../services/whatsappBaileys.js';
import Registration                             from '../models/Registration.js';

const router = Router();

// Estado de la última campaña (en memoria)
let lastCampaignResult = null;

// POST /api/campaigns/send — responde 202 inmediatamente, envía en background
router.post('/send', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim())
    return res.status(400).json({ error: 'message requerido' });

  const { state } = getStatus();
  if (state !== 'connected')
    return res.status(400).json({ error: 'WhatsApp no conectado. Escanea el QR primero.' });

  if (isCampaignRunning())
    return res.status(409).json({ error: 'Ya hay una campaña en curso. Espera a que termine.' });

  const registrations = await Registration.find({}, 'phone');
  const phones = registrations.map(r => r.phone).filter(Boolean);

  if (phones.length === 0)
    return res.json({ sent: 0, failed: 0, message: 'Sin números registrados' });

  // Responder inmediatamente para evitar timeout HTTP
  res.status(202).json({ ok: true, total: phones.length, message: 'Campaña iniciada en background' });

  // Ejecutar en background sin bloquear
  lastCampaignResult = { status: 'running', total: phones.length, sent: 0, failed: 0 };
  sendCampaign(phones, message.trim())
    .then(results => { lastCampaignResult = { status: 'done', ...results }; })
    .catch(err    => { lastCampaignResult = { status: 'error', error: err.message }; });
});

// GET /api/campaigns/status — consultar el resultado de la última campaña
router.get('/status', (_req, res) => {
  res.json(lastCampaignResult ?? { status: 'idle' });
});

export default router;
