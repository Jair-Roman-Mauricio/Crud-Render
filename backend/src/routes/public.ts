import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { streamSurveyChat } from '../services/claudeService';

const router = Router();

async function resolveToken(token: string) {
  const { rows } = await db.query(
    `SELECT sl.id AS link_id, sl.is_active, sl.expires_at, sl.max_responses,
            s.id AS survey_id, s.title, s.description, s.system_prompt, s.status,
            s.required_fields,
            u.company_name
     FROM survey_links sl
     JOIN surveys s ON s.id = sl.survey_id
     JOIN users u ON u.id = s.admin_id
     WHERE sl.token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

// Validate link and return survey metadata + required fields config
router.get('/survey/:token', async (req: Request, res: Response): Promise<void> => {
  const link = await resolveToken(req.params.token);
  if (!link) { res.status(404).json({ error: 'Survey not found' }); return; }
  if (!link.is_active || link.status === 'closed') {
    res.status(410).json({ error: 'This survey is no longer active' }); return;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    res.status(410).json({ error: 'This survey has expired' }); return;
  }

  const { rows: questions } = await db.query(
    'SELECT type, options, question_order FROM questions WHERE survey_id = $1 ORDER BY question_order',
    [link.survey_id]
  );

  res.json({
    title: link.title,
    description: link.description,
    company_name: link.company_name,
    required_fields: link.required_fields ?? {},
    questions: questions.map((q: { type: string; options: unknown }) => ({
      type: q.type,
      options: q.options,
    })),
  });
});

const startSchema = z.object({
  sessionId: z.string().uuid(),
  respondentInfo: z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    age: z.string().regex(/^\d{1,3}$/).optional(),
  }).optional(),
});

// Start conversation — AI sends first greeting with no user message
router.post('/survey/:token/start', async (req: Request, res: Response): Promise<void> => {
  const link = await resolveToken(req.params.token);
  if (!link) { res.status(404).json({ error: 'Survey not found' }); return; }
  if (!link.is_active || link.status === 'closed') {
    res.status(410).json({ error: 'Survey not active' }); return;
  }

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { sessionId, respondentInfo } = parsed.data;

  // Find or create response row
  const { rows: existing } = await db.query(
    'SELECT id FROM responses WHERE survey_link_id = $1 AND respondent_session_id = $2 AND status = $3',
    [link.link_id, sessionId, 'in_progress']
  );

  let responseId: string;
  if (existing[0]) {
    responseId = existing[0].id;
  } else {
    const metadata = respondentInfo ? { ...respondentInfo } : {};
    const { rows: newResp } = await db.query(
      `INSERT INTO responses (survey_link_id, respondent_session_id, metadata)
       VALUES ($1, $2, $3) RETURNING id`,
      [link.link_id, sessionId, JSON.stringify(metadata)]
    );
    responseId = newResp[0].id;
  }

  const { rows: questions } = await db.query(
    'SELECT question_text, question_order, type, options FROM questions WHERE survey_id = $1 ORDER BY question_order',
    [link.survey_id]
  );

  // Stream AI greeting — no user message in history yet, AI speaks first
  await streamSurveyChat(responseId, {
    title: link.title,
    description: link.description,
    system_prompt: link.system_prompt,
    company_name: link.company_name,
    questions,
  }, res);
});

const respondentInfoSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  age: z.string().regex(/^\d{1,3}$/).optional(),
}).optional();

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  respondentInfo: respondentInfoSchema,
});

// Chat endpoint — SSE stream
router.post('/survey/:token/chat', async (req: Request, res: Response): Promise<void> => {
  const link = await resolveToken(req.params.token);
  if (!link) { res.status(404).json({ error: 'Survey not found' }); return; }
  if (!link.is_active || link.status === 'closed') {
    res.status(410).json({ error: 'Survey not active' }); return;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    res.status(410).json({ error: 'Survey expired' }); return;
  }

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { sessionId, message, respondentInfo } = parsed.data;

  // Check max_responses
  if (link.max_responses) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS cnt FROM responses WHERE survey_link_id = $1 AND status = $2',
      [link.link_id, 'completed']
    );
    if (rows[0].cnt >= link.max_responses) {
      res.status(410).json({ error: 'Survey has reached max responses' }); return;
    }
  }

  // Find or create response row
  const { rows: existing } = await db.query(
    'SELECT id, metadata FROM responses WHERE survey_link_id = $1 AND respondent_session_id = $2 AND status = $3',
    [link.link_id, sessionId, 'in_progress']
  );

  let responseId: string;
  if (existing[0]) {
    responseId = existing[0].id;
    // Update metadata if respondentInfo provided (re-submission)
    if (respondentInfo && Object.keys(respondentInfo).length > 0) {
      const merged = { ...existing[0].metadata, ...respondentInfo };
      await db.query('UPDATE responses SET metadata = $1 WHERE id = $2', [JSON.stringify(merged), responseId]);
    }
  } else {
    const metadata = respondentInfo ? { ...respondentInfo } : {};
    const { rows: newResp } = await db.query(
      `INSERT INTO responses (survey_link_id, respondent_session_id, metadata)
       VALUES ($1, $2, $3) RETURNING id`,
      [link.link_id, sessionId, JSON.stringify(metadata)]
    );
    responseId = newResp[0].id;
  }

  // Save user message
  await db.query(
    'INSERT INTO messages (response_id, role, content) VALUES ($1, $2, $3)',
    [responseId, 'user', message]
  );

  // Load survey questions for prompt building
  const { rows: questions } = await db.query(
    'SELECT question_text, question_order, type, options FROM questions WHERE survey_id = $1 ORDER BY question_order',
    [link.survey_id]
  );

  await streamSurveyChat(responseId, {
    title: link.title,
    description: link.description,
    system_prompt: link.system_prompt,
    company_name: link.company_name,
    questions,
  }, res);
});

export default router;
