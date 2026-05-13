export function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  const token  = req.headers['x-admin-secret'];
  if (!secret || token !== secret)
    return res.status(401).json({ error: 'No autorizado' });
  next();
}
