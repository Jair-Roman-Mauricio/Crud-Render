import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate(user.role === 'superadmin' ? '/superadmin/dashboard' : '/admin/dashboard');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.title}>SurveyAI</h1>
        <p style={styles.sub}>Sign in to your account</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f4f6f9' },
  card: { background: '#fff', borderRadius: 12, padding: '40px 36px', width: 360, boxShadow: '0 4px 24px rgba(0,0,0,.08)' },
  title: { fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 4 },
  sub: { color: '#666', textAlign: 'center', marginBottom: 24, fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, outline: 'none' },
  btn: { padding: '12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, marginTop: 4 },
  error: { color: '#e53e3e', fontSize: 13, marginBottom: 8, textAlign: 'center' },
};
