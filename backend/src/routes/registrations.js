import { Router } from 'express';
import Registration from '../models/Registration.js';
import { requireAdmin } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';

const router = Router();

// POST /api/registrations
router.post('/', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'El teléfono es requerido' });

  try {
    const reg = await Registration.create({ phone });
    const io = getIO();
    if (io) io.emit('registration:new', { id: reg._id.toString(), phone: reg.phone, created_at: reg.created_at });
    res.status(201).json({ message: 'Registrado exitosamente', id: reg._id });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: 'Este número ya está registrado' });
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/registrations  — admin only
router.get('/', requireAdmin, async (_req, res) => {
  const registrations = await Registration.find().sort({ created_at: -1 });
  res.json({ count: registrations.length, registrations });
});

// DELETE /api/registrations  — admin only — delete all
router.delete('/', requireAdmin, async (_req, res) => {
  const result = await Registration.deleteMany({});
  res.json({ message: `${result.deletedCount} registros eliminados` });
});

// DELETE /api/registrations/:id  — admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  const deleted = await Registration.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'No encontrado' });
  res.json({ message: 'Eliminado' });
});

export default router;
