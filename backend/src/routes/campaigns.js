import { Router }                 from 'express';
import { sendCampaign, getStatus } from '../services/whatsappBaileys.js';
import Registration                from '../models/Registration.js';

const router = Router();

// POST /api/campaigns/send
router.post('/send', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim())
    return res.status(400).json({ error: 'message requerido' });

  const { state } = getStatus();
  if (state !== 'connected')
    return res.status(400).json({ error: 'WhatsApp no conectado. Escanea el QR primero.' });

  const registrations = await Registration.find({}, 'phone');
  const phones = registrations.map(r => r.phone).filter(Boolean);

  if (phones.length === 0)
    return res.json({ sent: 0, failed: 0, message: 'Sin números registrados' });

  try {
    const results = await sendCampaign(phones, message.trim());
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
