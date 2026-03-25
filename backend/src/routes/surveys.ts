import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('superadmin', 'admin'));

const surveySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  system_prompt: z.string().optional(),
  language: z.enum(['auto', 'es', 'en', 'pt', 'fr']).optional(),
  status: z.enum(['draft', 'active', 'closed']).optional(),
  required_fields: z.object({
    email: z.boolean().optional(),
    name: z.boolean().optional(),
    last_name: z.boolean().optional(),
    age: z.boolean().optional(),
  }).optional(),
});

const questionSchema = z.object({
  question_text: z.string().min(1),
  question_order: z.number().int().min(0),
  type: z.enum(['open', 'scale', 'multiple_choice', 'yes_no']).optional(),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().optional(),
});

const linkSchema = z.object({
  label: z.string().optional(),
  max_responses: z.number().int().positive().optional(),
  expires_at: z.string().datetime().optional(),
});

function adminFilter(req: Request, paramIndex = 1) {
  return req.user!.role === 'superadmin' ? '' : `AND admin_id = $${paramIndex}`;
}

function adminParam(req: Request): string[] {
  return req.user!.role === 'superadmin' ? [] : [req.user!.sub];
}

// ─── SURVEYS ────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const isSuper = req.user!.role === 'superadmin';
  const query = isSuper
    ? `SELECT s.*, COUNT(sl.id)::int AS link_count FROM surveys s
       LEFT JOIN survey_links sl ON sl.survey_id = s.id
       GROUP BY s.id ORDER BY s.created_at DESC`
    : `SELECT s.*, COUNT(sl.id)::int AS link_count FROM surveys s
       LEFT JOIN survey_links sl ON sl.survey_id = s.id
       WHERE s.admin_id = $1
       GROUP BY s.id ORDER BY s.created_at DESC`;
  const { rows } = await db.query(query, isSuper ? [] : [req.user!.sub]);
  res.json(rows);
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await db.query(
    `SELECT * FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  const { rows: questions } = await db.query(
    'SELECT * FROM questions WHERE survey_id = $1 ORDER BY question_order',
    [req.params.id]
  );
  res.json({ ...rows[0], questions });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = surveySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { title, description = '', system_prompt = '', language = 'auto', status = 'draft', required_fields = { email: true, name: true, last_name: true, age: true } } = parsed.data;
  const { rows } = await db.query(
    `INSERT INTO surveys (admin_id, title, description, system_prompt, language, status, required_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.sub, title, description, system_prompt, language, status, JSON.stringify(required_fields)]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = surveySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  const setClauses = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = [req.params.id, ...fields.map(([, v]) => v)];

  const { rows } = await db.query(
    `UPDATE surveys SET ${setClauses} WHERE id = $1 ${adminFilter(req, values.length + 1)} RETURNING *`,
    [...values, ...adminParam(req)]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await db.query(
    `DELETE FROM surveys WHERE id = $1 ${adminFilter(req, 2)} RETURNING id`,
    [req.params.id, ...adminParam(req)]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
});

// ─── QUESTIONS ───────────────────────────────────────────────────────────────

router.post('/:id/questions', async (req: Request, res: Response): Promise<void> => {
  // Verify survey ownership
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { question_text, question_order, type = 'open', options = null, is_required = true } = parsed.data;
  const { rows } = await db.query(
    `INSERT INTO questions (survey_id, question_text, question_order, type, options, is_required)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, question_text, question_order, type, options ? JSON.stringify(options) : null, is_required]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id/questions/:qid', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const parsed = questionSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  const setClauses = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await db.query(
    `UPDATE questions SET ${setClauses} WHERE id = $1 AND survey_id = $${fields.length + 2} RETURNING *`,
    [req.params.qid, ...fields.map(([, v]) => v), req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

router.delete('/:id/questions/:qid', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  await db.query('DELETE FROM questions WHERE id = $1 AND survey_id = $2', [req.params.qid, req.params.id]);
  res.json({ success: true });
});

// ─── SURVEY LINKS ────────────────────────────────────────────────────────────

router.get('/:id/links', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const { rows } = await db.query(
    'SELECT *, (SELECT COUNT(*)::int FROM responses r WHERE r.survey_link_id = sl.id) AS response_count FROM survey_links sl WHERE sl.survey_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/:id/links', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { label, max_responses, expires_at } = parsed.data;
  const token = nanoid(32);

  const { rows } = await db.query(
    `INSERT INTO survey_links (survey_id, token, label, max_responses, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, token, label ?? null, max_responses ?? null, expires_at ?? null]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id/links/:lid', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const schema = z.object({ is_active: z.boolean().optional(), expires_at: z.string().datetime().nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  const setClauses = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await db.query(
    `UPDATE survey_links SET ${setClauses} WHERE id = $1 AND survey_id = $${fields.length + 2} RETURNING *`,
    [req.params.lid, ...fields.map(([, v]) => v), req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

router.delete('/:id/links/:lid', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys WHERE id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }
  await db.query('DELETE FROM survey_links WHERE id = $1 AND survey_id = $2', [req.params.lid, req.params.id]);
  res.json({ success: true });
});

export default router;
