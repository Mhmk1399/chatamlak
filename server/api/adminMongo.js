import crypto from 'node:crypto';
import { createMongoAdminActions } from '../lib/services/mongoAdminService.js';

export function registerMongoAdminRoutes(app, deps) {
  const execute = createMongoAdminActions(deps);
  app.post('/api/admin/db-tools', async (req, res) => {
    if (!deps.isLoopbackRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const expected = Buffer.from(process.env.ADMIN_API_TOKEN || ''), provided = Buffer.from(String(req.headers['x-ouj-chat-admin-token'] || ''));
    if (!expected.length || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return res.status(401).json({ error: 'Invalid admin token.' });
    try { return res.json({ ok: true, result: await execute(String(req.body?.action || '').trim().toLowerCase(), req.body?.payload || {}) }); }
    catch (error) { return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ error: error.code === 11000 ? 'A record with these details already exists.' : error.message || 'Admin action failed.' }); }
  });
}
