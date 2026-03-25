import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import client from '../../api/client';

interface Survey {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'closed';
  link_count: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#fef9c3', color: '#854d0e' },
  active: { bg: '#d1fae5', color: '#065f46' },
  closed: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<Survey[]>([]);

  useEffect(() => { fetchSurveys(); }, []);

  async function fetchSurveys() {
    const { data } = await client.get('/api/surveys');
    setSurveys(data);
  }

  async function deleteSurvey(id: string) {
    if (!confirm('Delete this survey and all its data?')) return;
    await client.delete(`/api/surveys/${id}`);
    fetchSurveys();
  }

  async function toggleStatus(s: Survey) {
    const next = s.status === 'active' ? 'closed' : 'active';
    await client.patch(`/api/surveys/${s.id}`, { status: next });
    fetchSurveys();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>SurveyAI</h1>
          <p style={{ color: '#666', fontSize: 13 }}>{user?.company_name}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={styles.btnPrimary} onClick={() => navigate('/admin/surveys/new')}>
            + New Survey
          </button>
          <button style={styles.btnSm} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
          My Surveys ({surveys.length})
        </h2>

        {surveys.length === 0 && (
          <div style={styles.empty}>
            <p>No surveys yet. Create your first one!</p>
            <button style={{ ...styles.btnPrimary, marginTop: 16 }} onClick={() => navigate('/admin/surveys/new')}>
              Create Survey
            </button>
          </div>
        )}

        <div style={styles.grid}>
          {surveys.map(s => {
            const badge = STATUS_COLORS[s.status];
            return (
              <div key={s.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={{ ...styles.badge, background: badge.bg, color: badge.color }}>
                    {s.status}
                  </span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.link_count} link(s)</span>
                </div>
                <h3 style={styles.cardTitle}>{s.title}</h3>
                {s.description && <p style={styles.cardDesc}>{s.description}</p>}
                <div style={styles.cardActions}>
                  <button style={styles.btnSm} onClick={() => navigate(`/admin/surveys/${s.id}`)}>
                    Results
                  </button>
                  <button style={styles.btnSm} onClick={() => toggleStatus(s)}>
                    {s.status === 'active' ? 'Close' : 'Activate'}
                  </button>
                  <button style={{ ...styles.btnSm, color: '#dc2626' }} onClick={() => deleteSurvey(s.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#fff', padding: '16px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  main: { padding: '32px' },
  btnPrimary: { padding: '9px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  btnSm: { padding: '6px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 },
  badge: { padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 },
  empty: { textAlign: 'center', padding: 64, color: '#6b7280' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 },
  card: { background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 },
  cardActions: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
};
