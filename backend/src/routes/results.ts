import { Router, Request, Response } from 'express';
import { db } from '../config/database';
import { openai } from '../config/claude';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('superadmin', 'admin'));

function adminFilter(req: Request, paramIndex = 1) {
  return req.user!.role === 'superadmin' ? '' : `AND s.admin_id = $${paramIndex}`;
}
function adminParam(req: Request): string[] {
  return req.user!.role === 'superadmin' ? [] : [req.user!.sub];
}

// List all responses for a survey
router.get('/:id/results', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys s WHERE s.id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const { rows } = await db.query(
    `SELECT r.id, r.respondent_session_id, r.status, r.metadata,
            r.started_at, r.completed_at,
            sl.token AS link_token, sl.label AS link_label,
            COUNT(m.id)::int AS message_count
     FROM responses r
     JOIN survey_links sl ON sl.id = r.survey_link_id
     LEFT JOIN messages m ON m.response_id = r.id
     WHERE sl.survey_id = $1
     GROUP BY r.id, sl.token, sl.label
     ORDER BY r.started_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

// Full transcript for one response
router.get('/:id/results/:rid', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT id FROM surveys s WHERE s.id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  const { rows: resp } = await db.query(
    `SELECT r.* FROM responses r
     JOIN survey_links sl ON sl.id = r.survey_link_id
     WHERE r.id = $1 AND sl.survey_id = $2`,
    [req.params.rid, req.params.id]
  );
  if (!resp[0]) { res.status(404).json({ error: 'Response not found' }); return; }

  const { rows: msgs } = await db.query(
    'SELECT role, content, created_at FROM messages WHERE response_id = $1 ORDER BY created_at ASC',
    [req.params.rid]
  );
  res.json({ ...resp[0], messages: msgs });
});

// Generate (or return cached) AI analysis
router.get('/:id/analysis', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT s.id, s.title, s.description, s.status, s.ai_analysis, s.analysis_generated_at
     FROM surveys s WHERE s.id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }

  // Return cached analysis if available
  if (sv[0].ai_analysis) {
    res.json({
      analysis: sv[0].ai_analysis,
      generated_at: sv[0].analysis_generated_at,
      cached: true,
    });
    return;
  }

  // Generate fresh analysis
  const analysis = await generateAnalysis(req.params.id, sv[0]);
  res.json({ analysis, cached: false });
});

// Close survey + auto-generate analysis
router.post('/:id/close', async (req: Request, res: Response): Promise<void> => {
  const { rows: sv } = await db.query(
    `SELECT s.id, s.title, s.description, s.status
     FROM surveys s WHERE s.id = $1 ${adminFilter(req, 2)}`,
    [req.params.id, ...adminParam(req)]
  );
  if (!sv[0]) { res.status(404).json({ error: 'Survey not found' }); return; }
  if (sv[0].status === 'closed') { res.status(400).json({ error: 'Survey already closed' }); return; }

  // Close survey and deactivate all links
  await db.query(`UPDATE surveys SET status = 'closed' WHERE id = $1`, [req.params.id]);
  await db.query(
    `UPDATE survey_links SET is_active = false WHERE survey_id = $1`,
    [req.params.id]
  );

  // Generate and store analysis in background (don't block response)
  res.json({ success: true, message: 'Survey closed. Generating analysis…' });

  // Fire-and-forget analysis generation
  generateAnalysis(req.params.id, sv[0]).catch(err =>
    console.error('[analysis] Failed to generate:', err)
  );
});

async function generateAnalysis(surveyId: string, survey: { title: string; description: string }): Promise<string> {
  const { rows: questions } = await db.query(
    'SELECT question_text, type FROM questions WHERE survey_id = $1 ORDER BY question_order',
    [surveyId]
  );

  const { rows: responses } = await db.query(
    `SELECT r.id FROM responses r
     JOIN survey_links sl ON sl.id = r.survey_link_id
     WHERE sl.survey_id = $1 AND r.status = 'completed'
     LIMIT 50`,
    [surveyId]
  );

  if (responses.length === 0) {
    const msg = 'No hay respuestas completadas para analizar.';
    await db.query(
      `UPDATE surveys SET ai_analysis = $1, analysis_generated_at = NOW() WHERE id = $2`,
      [msg, surveyId]
    );
    return msg;
  }

  const transcripts: string[] = [];
  for (const resp of responses) {
    const { rows: msgs } = await db.query(
      'SELECT role, content FROM messages WHERE response_id = $1 ORDER BY created_at ASC',
      [resp.id]
    );
    const convo = msgs
      .map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'Respondente' : 'IA'}: ${m.content.replace('[SURVEY_COMPLETE]', '').trim()}`
      )
      .join('\n');
    transcripts.push(`--- Respuesta ${transcripts.length + 1} ---\n${convo}`);
  }

  const questionList = questions
    .map((q: { question_text: string; type: string }, i: number) => `${i + 1}. ${q.question_text} (${q.type})`)
    .join('\n');

  const prompt = `Eres un analista experto en investigación de mercado. Analiza las siguientes respuestas de una encuesta conversacional.

ENCUESTA: ${survey.title}
OBJETIVO: ${survey.description || 'No especificado'}

PREGUNTAS:
${questionList}

TRANSCRIPCIONES (${responses.length} respuestas completadas):
${transcripts.join('\n\n')}

Proporciona un análisis detallado en español con estas secciones:
## Resumen Ejecutivo
## Hallazgos Principales
## Sentimiento General
## Patrones y Tendencias
## Recomendaciones

Usa los datos reales. Sé específico y accionable.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
  });

  const analysis = completion.choices[0]?.message?.content ?? 'No se pudo generar el análisis.';

  await db.query(
    `UPDATE surveys SET ai_analysis = $1, analysis_generated_at = NOW() WHERE id = $2`,
    [analysis, surveyId]
  );

  return analysis;
}

export default router;
