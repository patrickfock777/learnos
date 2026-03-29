'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: 'linear-gradient(160deg, #1a3a4a 0%, #2a6478 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
    card: { background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '380px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
    header: { background: '#1a3a4a', padding: '2rem 2rem 1.5rem', textAlign: 'center' as const },
    logoBox: { width: '56px', height: '56px', background: '#ADD8E6', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '26px' },
    title: { color: '#fff', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' },
    sub: { color: '#ADD8E6', fontSize: '12px', marginTop: '4px', opacity: 0.9 },
    body: { padding: '1.5rem' },
    tabs: { display: 'flex', borderBottom: '2px solid #dde8ec', marginBottom: '1.25rem' },
    tab: (active: boolean): React.CSSProperties => ({ flex: 1, padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 500, cursor: 'pointer', color: active ? '#1a3a4a' : '#5a7280', borderBottom: `2px solid ${active ? '#7BB8CC' : 'transparent'}`, marginBottom: '-2px', background: 'none', border: 'none', borderBottom: `2px solid ${active ? '#7BB8CC' : 'transparent'}` }),
    input: { width: '100%', padding: '10px 12px', border: '1.5px solid #dde8ec', borderRadius: '8px', fontSize: '14px', marginBottom: '10px', color: '#1a2c35', background: '#f7f4f0', outline: 'none' },
    btn: { width: '100%', padding: '11px', background: '#1a3a4a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.2px' },
    error: { fontSize: '13px', color: '#e24b4a', background: '#fef0f0', padding: '8px 12px', borderRadius: '7px', marginBottom: '10px', border: '1px solid #f5c0c0' },
    forgot: { textAlign: 'center' as const, fontSize: '12px', color: '#5a7280', marginTop: '12px', cursor: 'pointer' },
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    if (mode === 'signup') {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) { setError(err.message); setLoading(false); return }
      if (data.user) {
        const { data: ws } = await supabase.from('workspaces').insert({ name: `${name}'s Workspace`, created_by: data.user.id }).select().single()
        await supabase.from('profiles').insert({ id: data.user.id, email, name, workspace_id: ws?.id, role: 'admin' })
        router.push('/dashboard')
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) { setError('E-Mail oder Passwort falsch.'); setLoading(false); return }
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logoBox}>📚</div>
          <div style={s.title}>LearnOS</div>
          <div style={s.sub}>Deine persönliche Lernplattform</div>
        </div>
        <div style={s.body}>
          <div style={s.tabs}>
            {(['login','signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={s.tab(mode === m)}>
                {m === 'login' ? 'Einloggen' : 'Registrieren'}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" required style={s.input} />}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail Adresse" required style={s.input} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort" required style={s.input} />
            {error && <div style={s.error}>{error}</div>}
            <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Bitte warten...' : mode === 'login' ? 'Einloggen' : 'Konto erstellen'}
            </button>
          </form>
          <div style={s.forgot}>Passwort vergessen? <span style={{ color: '#2a6478', fontWeight: 500 }}>Support kontaktieren</span></div>
        </div>
      </div>
    </div>
  )
}
