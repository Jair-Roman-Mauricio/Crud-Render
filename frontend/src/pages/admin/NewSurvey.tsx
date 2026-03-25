import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

interface Question {
  question_text: string;
  type: 'open' | 'scale' | 'multiple_choice' | 'yes_no';
  options: string;
}

const RESPONDENT_FIELDS: { key: string; label: string; description: string }[] = [
  { key: 'name', label: 'Nombre', description: 'Nombre del respondente' },
  { key: 'last_name', label: 'Apellido', description: 'Apellido del respondente' },
  { key: 'email', label: 'Correo electrónico', description: 'Email de contacto' },
  { key: 'age', label: 'Edad', description: 'Edad en años' },
];

export default function NewSurvey() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('auto');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({
    email: true, name: true, last_name: true, age: true,
  });
  const [questions, setQuestions] = useState<Question[]>([
    { question_text: '', type: 'open', options: '' },
  ]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function addQuestion() {
    setQuestions(q => [...q, { question_text: '', type: 'open', options: '' }]);
  }

  function removeQuestion(i: number) {
    setQuestions(q => q.filter((_, idx) => idx !== i));
  }

  function updateQuestion(i: number, field: keyof Question, value: string) {
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data: survey } = await client.post('/api/surveys', {
        title, description, language,
        system_prompt: systemPrompt,
        required_fields: requiredFields,
        status: 'draft',
      });

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question_text.trim()) continue;
        await client.post(`/api/surveys/${survey.id}/questions`, {
          question_text: q.question_text,
          question_order: i,
          type: q.type,
          options: q.options ? q.options.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        });
      }

      navigate(`/admin/surveys/${survey.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(typeof msg === 'string' ? msg : 'Error saving survey');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/admin/dashboard')}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>New Survey</h1>
        <div />
      </header>
      <main style={styles.main}>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Survey Details</h2>
            <div style={styles.field}>
              <label style={styles.label}>Title *</label>
              <input style={styles.input} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Customer Satisfaction Q2" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Description / Goal</label>
              <textarea style={{ ...styles.input, height: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this survey trying to learn?" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Language</label>
              <select style={styles.input} value={language} onChange={e => setLanguage(e.target.value)}>
                <option value="auto">Auto-detect (multilingual)</option>
                <option value="es">Spanish</option>
                <option value="en">English</option>
                <option value="pt">Portuguese</option>
                <option value="fr">French</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Datos a recopilar del respondente</label>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                Se solicitarán antes de iniciar la encuesta. Desactiva los que no necesites.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {RESPONDENT_FIELDS.map(f => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', border: '1px solid', borderColor: requiredFields[f.key] ? '#4f46e5' : '#e5e7eb', borderRadius: 8, background: requiredFields[f.key] ? '#f5f3ff' : '#fff' }}>
                    <input
                      type="checkbox"
                      checked={!!requiredFields[f.key]}
                      onChange={e => setRequiredFields(prev => ({ ...prev, [f.key]: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: '#4f46e5' }}
                    />
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{f.label}</p>
                      <p style={{ fontSize: 12, color: '#9ca3af' }}>{f.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          <div style={styles.field}>
              <label style={styles.label}>Custom AI Instructions (optional)</label>
              <textarea
                style={{ ...styles.input, height: 100, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Leave blank to use default prompt. Override only if you need specific AI behavior."
              />
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Questions</h2>
            {questions.map((q, i) => (
              <div key={i} style={styles.questionRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Question {i + 1}</span>
                  {questions.length > 1 && (
                    <button type="button" style={styles.removeBtn} onClick={() => removeQuestion(i)}>Remove</button>
                  )}
                </div>
                <input
                  style={styles.input}
                  placeholder="Question text"
                  value={q.question_text}
                  onChange={e => updateQuestion(i, 'question_text', e.target.value)}
                />
                <select style={{ ...styles.input, marginTop: 8 }} value={q.type} onChange={e => updateQuestion(i, 'type', e.target.value)}>
                  <option value="open">Open (free text)</option>
                  <option value="scale">Scale (1-10)</option>
                  <option value="yes_no">Yes / No</option>
                  <option value="multiple_choice">Multiple Choice</option>
                </select>
                {q.type === 'multiple_choice' && (
                  <textarea
                    style={{ ...styles.input, marginTop: 8, height: 70, fontSize: 13 }}
                    placeholder="One option per line"
                    value={q.options}
                    onChange={e => updateQuestion(i, 'options', e.target.value)}
                  />
                )}
              </div>
            ))}
            <button type="button" style={styles.addBtn} onClick={addQuestion}>+ Add Question</button>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : 'Create Survey'}
            </button>
            <button type="button" style={styles.btnSm} onClick={() => navigate('/admin/dashboard')}>Cancel</button>
          </div>
        </form>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#fff', padding: '16px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  back: { background: 'none', border: 'none', fontSize: 14, color: '#4f46e5', cursor: 'pointer', fontWeight: 600 },
  main: { padding: '32px', maxWidth: 720, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 10, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  sectionTitle: { fontSize: 16, fontWeight: 700, marginBottom: 18 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  questionRow: { background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 12 },
  removeBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: 13, cursor: 'pointer' },
  addBtn: { background: 'none', border: '1px dashed #d1d5db', borderRadius: 8, padding: '8px 16px', fontSize: 14, color: '#6b7280', cursor: 'pointer', width: '100%', marginTop: 4 },
  btnPrimary: { padding: '10px 24px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  btnSm: { padding: '10px 18px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 },
  error: { color: '#dc2626', marginBottom: 16, fontSize: 14 },
};
