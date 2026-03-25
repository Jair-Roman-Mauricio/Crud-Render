import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import client from '../../api/client';

interface AdminUser {
  id: string;
  email: string;
  company_name: string;
  is_active: boolean;
  survey_count?: number;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', company_name: '' });
  const [error, setError] = useState('');

  useEffect(() => { fetchAdmins(); }, []);

  async function fetchAdmins() {
    const { data } = await client.get('/api/admin/users');
    setAdmins(data);
  }

  async function createAdmin(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/api/admin/users', form);
      setForm({ email: '', password: '', company_name: '' });
      setShowForm(false);
      fetchAdmins();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(typeof msg === 'string' ? msg : 'Error creating admin');
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await client.patch(`/api/admin/users/${id}`, { is_active: !current });
    fetchAdmins();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>SuperAdmin Panel</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#666', fontSize: 13 }}>{user?.email}</span>
          <button style={styles.btnSm} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.toolbar}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Company Accounts ({admins.length})</h2>
          <button style={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New Company'}
          </button>
        </div>

        {showForm && (
          <div style={styles.formCard}>
            <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Create Admin Account</h3>
            {error && <p style={{ color: '#e53e3e', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={createAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={styles.input} placeholder="Company Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              <input style={styles.input} placeholder="Password (min 8 chars)" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} required />
              <input style={styles.input} placeholder="Company Name" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required />
              <button style={styles.btnPrimary} type="submit">Create Account</button>
            </form>
          </div>
        )}

        <table style={styles.table}>
          <thead>
            <tr>
              {['Company', 'Email', 'Surveys', 'Status', 'Created', 'Actions'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id} style={styles.tr}>
                <td style={styles.td}>{a.company_name}</td>
                <td style={styles.td}>{a.email}</td>
                <td style={styles.td}>{a.survey_count ?? 0}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.badge, background: a.is_active ? '#d1fae5' : '#fee2e2', color: a.is_active ? '#065f46' : '#991b1b' }}>
                    {a.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td style={styles.td}>{new Date(a.created_at).toLocaleDateString()}</td>
                <td style={styles.td}>
                  <button style={styles.btnSm} onClick={() => toggleActive(a.id, a.is_active)}>
                    {a.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#fff', padding: '16px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  main: { padding: '32px' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  btnPrimary: { padding: '9px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  btnSm: { padding: '6px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 },
  input: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  formCard: { background: '#fff', borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 480, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#374151' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '12px 16px', fontSize: 14 },
  badge: { padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 },
};
