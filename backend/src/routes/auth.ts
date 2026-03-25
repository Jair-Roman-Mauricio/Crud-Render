import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' });
    return;
  }
  const { email, password } = parsed.data;

  const { rows } = await db.query(
    'SELECT id, email, password_hash, role, company_name, is_active FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];

  if (!user || !user.is_active) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, company: user.company_name ?? null },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, company_name: user.company_name },
  });
});

router.get('/me', authenticate, (req: Request, res: Response): void => {
  res.json({ user: req.user });
});

export default router;
