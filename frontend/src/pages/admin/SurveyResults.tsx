import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

interface Survey { id: string; title: string; status: 'draft' | 'active' | 'closed'; description: string; }
interface SurveyLink { id: string; token: string; label: string; is_active: boolean; response_count: number; }
interface ResponseRow { id: string; respondent_session_id: string; status: string; started_at: string; completed_at: string | null; message_count: number; link_label: string; metadata?: { name?: string; last_name?: string; email?: string; age?: string }; }
interface Message { role: 'user' | 'assistant'; content: string; }

type Tab = 'overview' | 'links' | 'responses' | 'analysis';

export default function SurveyResults() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [links, setLinks] = useState<SurveyLink[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [selected, setSelected] = useState<{ messages: Message[] } | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const fetchSurvey = useCallback(async () => {
    const { data } = await client.get(`/api/surveys/${id}`);
    setSurvey(data);
  }, [id]);

  const fetchLinks = useCallback(async () => {
    const { data } = await client.get(`/api/surveys/${id}/links`);
    setLinks(data);
  }, [id]);

  const fetchResponses = useCallback(async () => {
    const { data } = await client.get(`/api/surveys/${id}/results`);
    setResponses(data);
  }, [id]);

  useEffect(() => {
    fetchSurvey();
    fetchLinks();
    fetchResponses();
  }, [fetchSurvey, fetchLinks, fetchResponses]);

  // When survey is closed, auto-load analysis tab and fetch analysis
  useEffect(() => {
    if (survey?.status === 'closed' && !analysis) {
      setTab('analysis');
      loadAnalysis();
    }
  }, [survey?.status]);

  async function loadAnalysis() {
    setAnalyzing(true);
    try {
      const { data } = await client.get(`/api/surveys/${id}/analysis`);
      setAnalysis(data.analysis);
      setAnalysisGeneratedAt(data.generated_at ?? null);
    } catch {
      setAnalysis('Error al cargar el análisis. Intenta de nuevo.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function closeSurvey() {
    setClosing(true);
    setConfirmClose(false);
    try {
      await client.post(`/api/surveys/${id}/close`);
      await fetchSurvey();
      await fetchLinks();
      setTab('analysis');
      // Poll until analysis is ready (backend generates it async)
      setAnalyzing(true);
      const poll = setInterval(async () => {
        try {
          const { data } = await client.get(`/api/surveys/${id}/analysis`);
          if (data.analysis && data.cached) {
            setAnalysis(data.analysis);
            setAnalysisGeneratedAt(data.generated_at ?? null);
            setAnalyzing(false);
            clearInterval(poll);
          }
        } catch { /* keep polling */ }
      }, 3000);
      // Stop polling after 2 min max
      setTimeout(() => { clearInterval(poll); setAnalyzing(false); }, 120000);
    } catch {
      setClosing(false);
    }
    setClosing(false);
  }

  async function createLink() {
    await client.post(`/api/surveys/${id}/links`, { label: newLinkLabel || undefined });
    setNewLinkLabel('');
    fetchLinks();
  }

  async function toggleLink(lid: string, cur: boolean) {
    await client.patch(`/api/surveys/${id}/links/${lid}`, { is_active: !cur });
    fetchLinks();
  }

  async function openTranscript(rid: string) {
    const { data } = await client.get(`/api/surveys/${id}/results/${rid}`);
    setSelected({ messages: data.messages });
  }

  const surveyUrl = (token: string) => `${window.location.origin}/s/${token}`;

  // Stats
  const total = responses.length;
  const completed = responses.filter(r => r.status === 'completed').length;
  const inProgress = responses.filter(r => r.status === 'in_progress').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgMessages = total > 0 ? Math.round(responses.reduce((a, r) => a + r.message_count, 0) / total) : 0;

  const dailyData = (() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('es', { weekday: 'short' })] = 0;
    }
    responses.forEach(r => {
      const label = new Date(r.started_at).toLocaleDateString('es', { weekday: 'short' });
      if (label in days) days[label]++;
    });
    return Object.entries(days);
  })();
  const maxDay = Math.max(...dailyData.map(([, v]) => v), 1);

  const isClosed = survey?.status === 'closed';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Resumen' },
    { key: 'links', label: `Links (${links.length})` },
    { key: 'responses', label: `Respuestas (${total})` },
    { key: 'analysis', label: '✨ Análisis IA' },
  ];

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.back} onClick={() => navigate('/admin/dashboard')}>← Dashboard</button>

        <div style={{ textAlign: 'center' }}>
          {survey && (
            <>
              <p style={{ fontWeight: 700, fontSize: 15 }}>{survey.title}</p>
              <span style={{ ...s.badge, background: isClosed ? '#fee2e2' : '#d1fae5', color: isClosed ? '#991b1b' : '#065f46' }}>
                {isClosed ? 'Cerrada' : survey.status === 'active' ? 'Activa' : 'Borrador'}
              </span>
            </>
          )}
        </div>

        {/* Close button — only when not closed */}
        {!isClosed ? (
          <button
            style={{ ...s.btnDanger, ...(closing ? { opacity: 0.6 } : {}) }}
            onClick={() => setConfirmClose(true)}
            disabled={closing}
          >
            {closing ? 'Cerrando…' : '🔒 Cerrar encuesta'}
          </button>
        ) : (
          <div style={{ width: 140 }} />
        )}
      </header>

      {/* Closed banner */}
      {isClosed && (
        <div style={s.closedBanner}>
          🔒 Esta encuesta está cerrada. Los links fueron desactivados y el análisis IA ha sido generado.
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
            onClick={() => {
              setTab(t.key);
              if (t.key === 'analysis' && !analysis && !analyzing) loadAnalysis();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main style={s.main}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div style={s.statsGrid}>
              <StatCard label="Total respuestas" value={total} color="#4f46e5" />
              <StatCard label="Completadas" value={completed} color="#059669" />
              <StatCard label="En progreso" value={inProgress} color="#d97706" />
              <StatCard label="Tasa de completado" value={`${completionRate}%`} color="#7c3aed" />
              <StatCard label="Mensajes promedio" value={avgMessages} color="#0891b2" />
              <StatCard label="Links activos" value={links.filter(l => l.is_active).length} color="#db2777" />
            </div>

            <div style={s.card}>
              <h3 style={s.cardTitle}>Tasa de completado</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1, height: 14, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${completionRate}%`, height: '100%', background: '#4f46e5', borderRadius: 99 }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, minWidth: 40 }}>{completionRate}%</span>
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
                <LegendDot color="#4f46e5" label={`Completadas (${completed})`} />
                <LegendDot color="#fbbf24" label={`En progreso (${inProgress})`} />
                <LegendDot color="#e5e7eb" label={`Abandonadas (${total - completed - inProgress})`} />
              </div>
            </div>

            <div style={s.card}>
              <h3 style={s.cardTitle}>Respuestas últimos 7 días</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, marginTop: 16 }}>
                {dailyData.map(([day, count]) => (
                  <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{count > 0 ? count : ''}</span>
                    <div style={{
                      width: '100%', borderRadius: '4px 4px 0 0',
                      height: `${Math.max((count / maxDay) * 88, count > 0 ? 8 : 2)}px`,
                      background: count > 0 ? '#4f46e5' : '#e5e7eb',
                    }} />
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{day}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={s.card}>
              <h3 style={s.cardTitle}>Distribución por estado</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                {[
                  { label: 'Completadas', count: completed, color: '#059669' },
                  { label: 'En progreso', count: inProgress, color: '#d97706' },
                  { label: 'Abandonadas', count: total - completed - inProgress, color: '#9ca3af' },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.label}</span>
                      <span style={{ fontSize: 13 }}>{item.count} ({total > 0 ? Math.round((item.count / total) * 100) : 0}%)</span>
                    </div>
                    <div style={{ height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%`, height: '100%', background: item.color, borderRadius: 99 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LINKS ── */}
        {tab === 'links' && (
          <>
            {!isClosed && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <input style={{ ...s.input, flex: 1 }} placeholder="Etiqueta (ej. Email Q1)" value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} />
                <button style={s.btnPrimary} onClick={createLink}>Generar Link</button>
              </div>
            )}
            {links.length === 0 && <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32 }}>No hay links aún.</p>}
            {links.map(l => (
              <div key={l.id} style={s.linkCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600 }}>{l.label || 'Sin etiqueta'}</span>
                  <span style={{ ...s.badge, background: l.is_active ? '#d1fae5' : '#f3f4f6', color: l.is_active ? '#065f46' : '#6b7280' }}>
                    {l.is_active ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9fafb', padding: '8px 12px', borderRadius: 6, marginBottom: 10 }}>
                  <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' }}>{surveyUrl(l.token)}</code>
                  <button style={s.btnSm} onClick={() => navigator.clipboard.writeText(surveyUrl(l.token))}>Copiar</button>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#6b7280', alignItems: 'center' }}>
                  <span>{l.response_count} respuesta(s)</span>
                  {!isClosed && (
                    <button style={s.btnSm} onClick={() => toggleLink(l.id, l.is_active)}>
                      {l.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── RESPONSES ── */}
        {tab === 'responses' && (
          responses.length === 0
            ? <p style={{ color: '#9ca3af', textAlign: 'center', padding: 48 }}>No hay respuestas aún.</p>
            : <table style={s.table}>
              <thead>
                <tr>{['Respondente', 'Estado', 'Mensajes', 'Link', 'Inicio', 'Fin', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {responses.map(r => (
                  <tr key={r.id} style={s.tr}>
                    <td style={s.td}>
                      {r.metadata?.name ? (
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 13 }}>{r.metadata.name} {r.metadata.last_name ?? ''}</p>
                          {r.metadata.email && <p style={{ fontSize: 12, color: '#6b7280' }}>{r.metadata.email}</p>}
                          {r.metadata.age && <p style={{ fontSize: 12, color: '#9ca3af' }}>{r.metadata.age} años</p>}
                        </div>
                      ) : (
                        <code style={{ fontSize: 11 }}>{r.respondent_session_id.slice(0, 8)}…</code>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: r.status === 'completed' ? '#d1fae5' : '#fef9c3', color: r.status === 'completed' ? '#065f46' : '#854d0e' }}>
                        {r.status === 'completed' ? 'Completado' : r.status === 'in_progress' ? 'En progreso' : 'Abandonado'}
                      </span>
                    </td>
                    <td style={s.td}>{r.message_count}</td>
                    <td style={s.td}>{r.link_label || '—'}</td>
                    <td style={s.td}>{new Date(r.started_at).toLocaleDateString('es')}</td>
                    <td style={s.td}>{r.completed_at ? new Date(r.completed_at).toLocaleDateString('es') : '—'}</td>
                    <td style={s.td}><button style={s.btnSm} onClick={() => openTranscript(r.id)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}

        {/* ── AI ANALYSIS ── */}
        {tab === 'analysis' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={s.cardTitle}>Análisis con Inteligencia Artificial</h3>
                <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                  GPT-4o analiza todas las respuestas completadas ({completed}) y genera insights detallados.
                </p>
                {analysisGeneratedAt && (
                  <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
                    Generado: {new Date(analysisGeneratedAt).toLocaleString('es')}
                  </p>
                )}
              </div>
              {!analyzing && (
                <button
                  style={{ ...s.btnPrimary, ...(completed === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                  onClick={loadAnalysis}
                  disabled={completed === 0}
                >
                  {analysis ? '🔄 Re-analizar' : '✨ Generar análisis'}
                </button>
              )}
            </div>

            {analyzing && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
                <p style={{ fontWeight: 600 }}>Analizando {completed} respuesta(s)…</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>GPT-4o está procesando las conversaciones.</p>
                <div style={s.spinner} />
              </div>
            )}

            {!analyzing && !analysis && completed === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                <div style={{ fontSize: 40 }}>📊</div>
                <p style={{ marginTop: 12 }}>No hay respuestas completadas aún.</p>
              </div>
            )}

            {!analyzing && analysis && (
              <div style={s.analysisContent}>
                <MarkdownRenderer text={analysis} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Confirm close modal */}
      {confirmClose && (
        <div style={s.overlay} onClick={() => setConfirmClose(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>¿Cerrar encuesta?</h3>
            <p style={{ color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
              Al cerrar la encuesta:<br />
              • Todos los links serán desactivados<br />
              • No se aceptarán más respuestas<br />
              • Se generará el análisis IA automáticamente<br />
              <strong>Esta acción no se puede deshacer.</strong>
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={s.btnDanger} onClick={closeSurvey}>Sí, cerrar encuesta</button>
              <button style={s.btnSm} onClick={() => setConfirmClose(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Transcript modal */}
      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700 }}>Transcripción</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '60vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5,
                    background: m.role === 'user' ? '#4f46e5' : '#f3f4f6',
                    color: m.role === 'user' ? '#fff' : '#1a1a2e',
                  }}>
                    {m.content.replace('[SURVEY_COMPLETE]', '').trim()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,.06)', borderLeft: `4px solid ${color}` }}>
      <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color, marginTop: 4 }}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
    </div>
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  return (
    <div>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## ')) return <h3 key={i} style={{ fontWeight: 700, fontSize: 17, marginTop: 22, marginBottom: 8, color: '#1a1a2e', borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>{line.slice(3)}</h3>;
        if (line.startsWith('### ')) return <h4 key={i} style={{ fontWeight: 700, fontSize: 15, marginTop: 14, marginBottom: 6, color: '#374151' }}>{line.slice(4)}</h4>;
        if (line.match(/^\*\*(.+)\*\*$/)) return <p key={i} style={{ fontWeight: 700, marginBottom: 6 }}>{line.replace(/\*\*/g, '')}</p>;
        if (line.startsWith('- ') || line.startsWith('• ')) return <li key={i} style={{ marginLeft: 20, marginBottom: 5, color: '#374151', lineHeight: 1.6 }}>{line.slice(2).replace(/\*\*/g, '')}</li>;
        if (line.match(/^\d+\./)) return <p key={i} style={{ marginBottom: 8, color: '#374151', lineHeight: 1.7, paddingLeft: 4 }}>{line.replace(/\*\*/g, '')}</p>;
        if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
        return <p key={i} style={{ marginBottom: 6, color: '#374151', lineHeight: 1.7 }}>{line.replace(/\*\*/g, '')}</p>;
      })}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#fff', padding: '14px 28px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  back: { background: 'none', border: 'none', fontSize: 14, color: '#4f46e5', cursor: 'pointer', fontWeight: 600 },
  closedBanner: { background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '10px 28px', fontSize: 13, color: '#991b1b', fontWeight: 500 },
  tabBar: { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 28px', display: 'flex', gap: 4 },
  tab: { padding: '12px 16px', background: 'none', border: 'none', borderBottom: '3px solid transparent', fontSize: 14, cursor: 'pointer', color: '#6b7280', fontWeight: 500 },
  tabActive: { borderBottomColor: '#4f46e5', color: '#4f46e5', fontWeight: 700 },
  main: { padding: '24px 28px', maxWidth: 960, margin: '0 auto' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 14, marginBottom: 20 },
  card: { background: '#fff', borderRadius: 10, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,.06)', marginBottom: 18 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a2e' },
  input: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  btnPrimary: { padding: '9px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  btnDanger: { padding: '9px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  btnSm: { padding: '6px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  badge: { padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 },
  linkCard: { background: '#fff', borderRadius: 10, padding: 18, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#374151' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '11px 16px', fontSize: 14 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  analysisContent: { background: '#f9fafb', borderRadius: 8, padding: '20px 24px', lineHeight: 1.8, fontSize: 14 },
  spinner: { width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#4f46e5', borderRadius: '50%', margin: '20px auto 0', animation: 'spin 0.8s linear infinite' },
};
