import { Router } from 'express';
import { getDropState } from '../state/dropState.js';

const router = Router();

// GET /api/drop/state  — initial state for SSR / non-socket clients
router.get('/state', async (_req, res) => {
  res.json(await getDropState());
});

export default router;
