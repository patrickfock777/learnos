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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'signup') {
      const { data, error: signupError } = await supabase.auth.signUp({ email, password })
      if (signupError) { setError(signupError.message); setLoading(false); return }
      if (data.user) {
        await supabase.from('workspaces').insert({ name: `${name}'s Workspace`, created_by: data.user.id })
        const { data: ws } = await supabase.from('workspaces').select('id').eq('created_by', data.user.id).single()
        await supabase.from('profiles').insert({ id: data.user.id, email, name, workspace_id: ws?.id, role: 'admin' })
        router.push('/dashboard')
      }
    } else {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) { setError('E-Mail oder Passwort falsch'); setLoading(false); return }
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f7', padding: '1rem' }}>
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📚</div>
          <h1 style={{ fontSize: '22px', fontWeight: 500 }}>LearnOS</h1>
          <p style={{ fontSize: '14px', color: '#6b6b67', marginTop: '4px' }}>Deine persönliche Lernplattform</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
          {(['login','signup'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px', border: '0.5px solid #e5e5e2', borderRadius: '8px', background: mode === m ? '#E6F1FB' : '#fff', color: mode === m ? '#0C447C' : '#6b6b67', fontWeight: mode === m ? 500 : 400, cursor: 'pointer', fontSize: '14px' }}>
              {m === 'login' ? 'Einloggen' : 'Registrieren'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mode === 'signup' && (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" required style={{ padding: '10px 12px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '15px' }} />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail" required style={{ padding: '10px 12px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '15px' }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort" required style={{ padding: '10px 12px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '15px' }} />
          {error && <p style={{ fontSize: '13px', color: '#E24B4A', background: '#FCEBEB', padding: '8px 12px', borderRadius: '8px' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '11px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Bitte warten...' : mode === 'login' ? 'Einloggen' : 'Account erstellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
