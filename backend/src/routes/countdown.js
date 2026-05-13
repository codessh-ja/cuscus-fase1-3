import { Router } from 'express';
import Config from '../models/Config.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const KEY = 'countdown';
const DEFAULT_MS = () => Date.now() + 14 * 24 * 60 * 60 * 1000;

async function getTargetDate() {
  const doc = await Config.findOne({ key: KEY });
  if (doc) return doc.value.targetDate;
  const ts = DEFAULT_MS();
  await Config.findOneAndUpdate(
    { key: KEY },
    { value: { targetDate: ts } },
    { upsert: true }
  );
  return ts;
}

// GET /api/countdown
router.get('/', async (_req, res) => {
  res.json({ targetDate: await getTargetDate() });
});

// PUT /api/countdown  — admin only
router.put('/', requireAdmin, async (req, res) => {
  const { targetDate } = req.body;
  const parsed = new Date(targetDate);
  if (!targetDate || isNaN(parsed.getTime()))
    return res.status(400).json({ error: 'targetDate inválido' });

  const ts = parsed.getTime();
  await Config.findOneAndUpdate(
    { key: KEY },
    { value: { targetDate: ts } },
    { upsert: true }
  );
  res.json({ targetDate: ts });
});

export default router;
