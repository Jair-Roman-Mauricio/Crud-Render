import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('superadmin'));

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  company_name: z.string().min(1),
  permissions: z.record(z.unknown()).optional(),
});

const updateAdminSchema = z.object({
  company_name: z.string().min(1).optional(),
  permissions: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

// List all admin accounts
router.get('/users', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await db.query(
    `SELECT id, email, role, company_name, permissions, is_active, created_at
     FROM users WHERE role = 'admin' ORDER BY created_at DESC`
  );
  res.json(rows);
});

// Get single admin
router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.company_name, u.permissions, u.is_active, u.created_at,
            COUNT(s.id)::int AS survey_count
     FROM users u
     LEFT JOIN surveys s ON s.admin_id = u.id
     WHERE u.id = $1 AND u.role = 'admin'
     GROUP BY u.id`,
    [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// Create admin account
router.post('/users', async (req: Request, res: Response): Promise<void> => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { email, password, company_name, permissions = {} } = parsed.data;
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const hash = await bcrypt.hash(password, rounds);

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, role, company_name, permissions)
     VALUES ($1, $2, 'admin', $3, $4)
     RETURNING id, email, role, company_name, permissions, is_active, created_at`,
    [email, hash, company_name, JSON.stringify(permissions)]
  );
  res.status(201).json(rows[0]);
});

// Update admin account
router.patch('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateAdminSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (parsed.data.company_name !== undefined) { updates.push(`company_name = $${i++}`); values.push(parsed.data.company_name); }
  if (parsed.data.permissions !== undefined) { updates.push(`permissions = $${i++}`); values.push(JSON.stringify(parsed.data.permissions)); }
  if (parsed.data.is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(parsed.data.is_active); }

  if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  values.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} AND role = 'admin'
     RETURNING id, email, role, company_name, permissions, is_active, created_at`,
    values
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// Soft-delete admin (set is_active = false)
router.delete('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await db.query(
    `UPDATE users SET is_active = false WHERE id = $1 AND role = 'admin' RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
});

export default router;
