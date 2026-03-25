import { useState, useEffect, useRef, FormEvent } from 'react';
import { useParams } from 'react-router-dom';

interface ChatMessage { role: 'user' | 'assistant'; content: string; }
interface Question { type: 'open' | 'scale' | 'multiple_choice' | 'yes_no'; options?: string[] | null; }
interface RequiredFields { email?: boolean; name?: boolean; last_name?: boolean; age?: boolean; }
interface RespondentInfo { email?: string; name?: string; last_name?: string; age?: string; }
interface SurveyMeta {
  title: string; description: string; company_name: string;
  questions: Question[]; required_fields: RequiredFields;
}

const API = import.meta.env.VITE_API_URL || '';

const FIELD_LABELS: Record<keyof RequiredFields, string> = {
  email: 'Correo electrónico',
  name: 'Nombre',
  last_name: 'Apellido',
  age: 'Edad',
};

export default function SurveyChat() {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<SurveyMeta | null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'intake' | 'chat'>('intake');
  const [respondentInfo, setRespondentInfo] = useState<RespondentInfo>({});
  const [intakeError, setIntakeError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMsg, setStreamingMsg] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionId = (() => {
    const key = `survey_session_${token}`;
    let id = sessionStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
    return id;
  })();

  useEffect(() => {
    fetch(`${API}/api/public/survey/${token}`)
      .then(r => { if (!r.ok) throw new Error('Encuesta no disponible'); return r.json(); })
      .then((data: SurveyMeta) => {
        setMeta(data);
        // If no fields required, skip intake
        const fields = data.required_fields ?? {};
        const hasAny = Object.values(fields).some(Boolean);
        if (!hasAny) setStage('chat');
      })
      .catch(e => setError(e.message));
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMsg]);

  // Auto-start: AI greets first when chat stage begins
  useEffect(() => {
    if (stage === 'chat' && messages.length === 0 && !sending) {
      startChat();
    }
  }, [stage]);

  // ── Intake form submit ───────────────────────────────────────
  function submitIntake(e: FormEvent) {
    e.preventDefault();
    setIntakeError('');
    const fields = meta?.required_fields ?? {};
    for (const key of Object.keys(fields) as Array<keyof RequiredFields>) {
      if (fields[key] && !respondentInfo[key]?.trim()) {
        setIntakeError(`El campo "${FIELD_LABELS[key]}" es obligatorio.`);
        return;
      }
    }
    if (respondentInfo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respondentInfo.email)) {
      setIntakeError('Ingresa un correo electrónico válido.');
      return;
    }
    if (respondentInfo.age && (isNaN(Number(respondentInfo.age)) || Number(respondentInfo.age) < 1 || Number(respondentInfo.age) > 120)) {
      setIntakeError('Ingresa una edad válida (1-120).');
      return;
    }
    setStage('chat');
  }

  // ── AI speaks first ──────────────────────────────────────────
  async function startChat() {
    setSending(true);
    setStreamingMsg('');
    try {
      const body: Record<string, unknown> = { sessionId };
      if (Object.keys(respondentInfo).length > 0) body.respondentInfo = respondentInfo;

      const res = await fetch(`${API}/api/public/survey/${token}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error('Error al iniciar');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.delta) { accumulated += data.delta; setStreamingMsg(accumulated); }
            if (data.done) {
              setMessages([{ role: 'assistant', content: accumulated }]);
              setStreamingMsg('');
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar la encuesta');
    } finally {
      setSending(false);
    }
  }

  // ── Chat send ────────────────────────────────────────────────
  async function sendMessage(text: string) {
    if (!text.trim() || sending || completed) return;
    setSending(true);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreamingMsg('');

    try {
      const body: Record<string, unknown> = { sessionId, message: text };

      const res = await fetch(`${API}/api/public/survey/${token}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error('Error al obtener respuesta');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.delta) { accumulated += data.delta; setStreamingMsg(accumulated); }
            if (data.done) {
              setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
              setStreamingMsg('');
              if (data.completed) setCompleted(true);
              else setQIdx(i => i + 1);
            }
            if (data.error) setError(data.error);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal');
    } finally {
      setSending(false);
    }
  }

  if (error) return (
    <div style={s.center}>
      <div style={s.errorBox}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Error</p>
        <p style={{ color: '#6b7280' }}>{error}</p>
      </div>
    </div>
  );

  if (!meta) return <div style={s.center}><p style={{ color: '#9ca3af' }}>Cargando…</p></div>;

  // ── Intake form ──────────────────────────────────────────────
  if (stage === 'intake') {
    const fields = meta.required_fields ?? {};
    const activeFields = (Object.keys(fields) as Array<keyof RequiredFields>).filter(k => fields[k]);

    return (
      <div style={s.center}>
        <div style={s.intakeCard}>
          <div style={s.intakeHeader}>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{meta.title}</h1>
            {meta.company_name && <p style={{ color: '#9ca3af', fontSize: 13 }}>{meta.company_name}</p>}
          </div>

          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
            Antes de comenzar, necesitamos algunos datos básicos.
          </p>

          {intakeError && (
            <div style={s.intakeErrorBanner}>{intakeError}</div>
          )}

          <form onSubmit={submitIntake} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeFields.includes('name') && (
              <div style={s.fieldGroup}>
                <label style={s.label}>Nombre *</label>
                <input
                  style={s.input}
                  placeholder="Tu nombre"
                  value={respondentInfo.name ?? ''}
                  onChange={e => setRespondentInfo(p => ({ ...p, name: e.target.value }))}
                />
              </div>
            )}
            {activeFields.includes('last_name') && (
              <div style={s.fieldGroup}>
                <label style={s.label}>Apellido *</label>
                <input
                  style={s.input}
                  placeholder="Tu apellido"
                  value={respondentInfo.last_name ?? ''}
                  onChange={e => setRespondentInfo(p => ({ ...p, last_name: e.target.value }))}
                />
              </div>
            )}
            {activeFields.includes('email') && (
              <div style={s.fieldGroup}>
                <label style={s.label}>Correo electrónico *</label>
                <input
                  style={s.input}
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={respondentInfo.email ?? ''}
                  onChange={e => setRespondentInfo(p => ({ ...p, email: e.target.value }))}
                />
              </div>
            )}
            {activeFields.includes('age') && (
              <div style={s.fieldGroup}>
                <label style={s.label}>Edad *</label>
                <input
                  style={s.input}
                  type="number"
                  placeholder="Ej. 28"
                  min={1} max={120}
                  value={respondentInfo.age ?? ''}
                  onChange={e => setRespondentInfo(p => ({ ...p, age: e.target.value }))}
                />
              </div>
            )}
            <button style={s.startBtn} type="submit">Comenzar encuesta →</button>
          </form>
        </div>
      </div>
    );
  }

  // ── Chat stage ───────────────────────────────────────────────
  const currentQuestion = meta.questions[qIdx] ?? null;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <h1 style={{ fontSize: 17, fontWeight: 700 }}>{meta.title}</h1>
        {meta.company_name && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{meta.company_name}</p>}
      </header>

      <div style={s.chatArea}>
        {messages.length === 0 && !streamingMsg && sending && (
          <p style={s.hint}>Conectando con el asistente…</p>
        )}
        {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}

        {streamingMsg && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <div style={s.bubbleAI}>{streamingMsg}<span style={s.cursor} /></div>
          </div>
        )}
        {sending && !streamingMsg && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <div style={{ ...s.bubbleAI, color: '#9ca3af', fontSize: 20, letterSpacing: 4 }}>●●●</div>
          </div>
        )}
        {completed && (
          <div style={s.completedBanner}>¡Encuesta completada! Gracias por tus respuestas.</div>
        )}
        <div ref={bottomRef} />
      </div>

      {!completed && (
        <div style={s.inputArea}>
          <InputPanel
            question={currentQuestion}
            input={input}
            setInput={setInput}
            sending={sending}
            onSend={sendMessage}
            onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div style={role === 'user' ? s.bubbleUser : s.bubbleAI}>
        {content.replace('[SURVEY_COMPLETE]', '').trim()}
      </div>
    </div>
  );
}

function InputPanel({ question, input, setInput, sending, onSend, onSubmit }: {
  question: Question | null; input: string; setInput: (v: string) => void;
  sending: boolean; onSend: (t: string) => void; onSubmit: (e: FormEvent) => void;
}) {
  const type = question?.type ?? 'open';

  if (type === 'scale') return (
    <div>
      <p style={s.inputLabel}>Selecciona (1 = muy bajo · 10 = excelente)</p>
      <div style={s.scaleGrid}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button key={n} style={{ ...s.scaleBtn, ...(sending ? s.dimmed : {}) }} disabled={sending} onClick={() => onSend(String(n))}>{n}</button>
        ))}
      </div>
    </div>
  );

  if (type === 'yes_no') return (
    <div>
      <p style={s.inputLabel}>Selecciona tu respuesta</p>
      <div style={{ display: 'flex', gap: 12 }}>
        {['Sí', 'No'].map(opt => (
          <button key={opt} style={{ ...s.yesNoBtn, ...(sending ? s.dimmed : {}) }} disabled={sending} onClick={() => onSend(opt)}>{opt}</button>
        ))}
      </div>
    </div>
  );

  if (type === 'multiple_choice' && question?.options?.length) return (
    <div>
      <p style={s.inputLabel}>Selecciona una opción</p>
      <div style={s.optionsGrid}>
        {question.options.map((opt: string) => (
          <button key={opt} style={{ ...s.optionBtn, ...(sending ? s.dimmed : {}) }} disabled={sending} onClick={() => onSend(opt)}>{opt}</button>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 10 }}>
      <input style={s.textInput} value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe tu respuesta…" disabled={sending} autoFocus />
      <button style={{ ...s.sendBtn, ...(sending || !input.trim() ? s.dimmed : {}) }} type="submit" disabled={sending || !input.trim()}>Enviar</button>
    </form>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f4f6f9' },
  header: { background: '#fff', padding: '14px 20px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
  chatArea: { flex: 1, overflowY: 'auto', padding: '20px 16px 8px', display: 'flex', flexDirection: 'column' },
  inputArea: { background: '#fff', borderTop: '1px solid #e5e7eb', padding: '14px 16px', flexShrink: 0 },
  bubbleUser: { maxWidth: '75%', padding: '11px 15px', borderRadius: 16, borderBottomRightRadius: 4, background: '#4f46e5', color: '#fff', fontSize: 15, lineHeight: 1.6 },
  bubbleAI: { maxWidth: '75%', padding: '11px 15px', borderRadius: 16, borderBottomLeftRadius: 4, background: '#fff', color: '#1a1a2e', fontSize: 15, lineHeight: 1.6, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  hint: { textAlign: 'center', color: '#9ca3af', marginTop: 48, fontSize: 14 },
  cursor: { display: 'inline-block', width: 2, height: 15, background: '#4f46e5', marginLeft: 2, verticalAlign: 'middle' },
  completedBanner: { textAlign: 'center', padding: '14px 24px', background: '#d1fae5', color: '#065f46', borderRadius: 10, margin: '12px 0', fontWeight: 600, fontSize: 15 },
  // Intake
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f4f6f9', padding: 16 },
  intakeCard: { background: '#fff', borderRadius: 14, padding: '36px 32px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,.09)' },
  intakeHeader: { marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f3f4f6' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, outline: 'none' },
  startBtn: { padding: '13px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  intakeErrorBanner: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 },
  errorBox: { background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.08)' },
  // Input types
  inputLabel: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  scaleGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  scaleBtn: { width: 48, height: 48, borderRadius: 10, border: '2px solid #e5e7eb', background: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  yesNoBtn: { flex: 1, padding: '14px', borderRadius: 12, border: '2px solid #4f46e5', background: '#fff', fontSize: 16, fontWeight: 600, color: '#4f46e5', cursor: 'pointer' },
  optionsGrid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  optionBtn: { padding: '12px 16px', borderRadius: 10, border: '2px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left' as const },
  textInput: { flex: 1, padding: '12px 16px', border: '1px solid #d1d5db', borderRadius: 24, fontSize: 15, outline: 'none' },
  sendBtn: { padding: '12px 22px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 24, fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  dimmed: { opacity: 0.5, cursor: 'not-allowed' },
};
