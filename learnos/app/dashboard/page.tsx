'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const modules = [
  { id: 'library', icon: '📖', label: 'Bibliothek', desc: 'Texte lesen & anhören', color: '#E1F5EE', href: '/library' },
  { id: 'vocab', icon: '🗂️', label: 'Vokabeln', desc: 'Sets & Abfrage', color: '#EEEDFE', href: '/vocab' },
  { id: 'writing', icon: '✍️', label: 'Schreiben', desc: 'Texte & KI-Feedback', color: '#FAECE7', href: '/writing' },
  { id: 'grammar', icon: '🎯', label: 'Grammatik', desc: 'Zeiten erkennen', color: '#FBEAF0', href: '/grammar' },
]

export default function Dashboard() {
  const [profile, setProfile] = useState<{name:string;email:string} | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      supabase.from('profiles').select('name,email').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p) setProfile(p) })
    })
  }, [router])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>📚</span>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 500 }}>LearnOS</div>
            {profile && <div style={{ fontSize: '12px', color: '#6b6b67' }}>Hallo, {profile.name}</div>}
          </div>
        </div>
        <button onClick={logout} style={{ fontSize: '13px', color: '#6b6b67', background: 'none', border: '0.5px solid #e5e5e2', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}>Logout</button>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '1rem' }}>Was möchtest du lernen?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {modules.map(m => (
            <div key={m.id} onClick={() => router.push(m.href)} style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '16px', padding: '1.25rem', cursor: 'pointer' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{m.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>{m.label}</div>
              <div style={{ fontSize: '12px', color: '#6b6b67' }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
