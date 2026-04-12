'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const modules = [
  { href: '/notes',   icon: '📥', label: 'Quick Capture', desc: 'Notizen & Links', bg: '#fefce8', border: '#fde68a' },
  { href: '/library', icon: '📖', label: 'Bibliothek', desc: 'Texte & Ordner', bg: '#E8F6FA', border: '#ADD8E6' },
  { href: '/vocab',   icon: '🗂',  label: 'Vokabeln',  desc: 'Sets & Quiz',   bg: '#fdf8f2', border: '#e8d9c0' },
  { href: '/writing', icon: '✍️', label: 'Schreiben', desc: 'KI-Feedback',    bg: '#f2f7f2', border: '#b8ddb8' },
  { href: '/grammar', icon: '🎯', label: 'Grammatik', desc: 'Zeiten erkennen',bg: '#f5f2fa', border: '#c8b8e8' },
  { href: '/youtube', icon: '▶️', label: 'YouTube', desc: 'Video zusammenfassen', bg: '#fff5f5', border: '#ffb8b8' },
]

export default function Dashboard() {
  const [profile, setProfile] = useState<{name:string} | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      supabase.from('profiles').select('name').eq('id', data.user.id).single().then(({ data: p }) => { if (p) setProfile(p) })
    })
  }, [router])

  async function logout() {
    await supabase.auth.signOut(); router.push('/auth')
  }

  const initials = profile?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'U'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 17 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div style={{ minHeight: '100vh', background: '#edf4f7' }}>
      <div style={{ background: '#1a3a4a', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ width: '32px', height: '32px', background: '#ADD8E6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📚</div>
        <span style={{ color: '#fff', fontSize: '17px', fontWeight: 700, flex: 1, letterSpacing: '-0.2px' }}>LearnOS</span>
        <div style={{ width: '32px', height: '32px', background: '#E8F6FA', border: '2px solid #ADD8E6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#1a3a4a', cursor: 'pointer' }} onClick={logout} title="Logout">{initials}</div>
      </div>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1.25rem 1rem' }}>
        <div style={{ background: '#E8F6FA', borderRadius: '10px', borderLeft: '3px solid #7BB8CC', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#1a3a4a' }}>
          {greeting}{profile ? `, ${profile.name}` : ''} 👋
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {modules.map(m => (
            <div key={m.href} onClick={() => router.push(m.href)} style={{ background: m.bg, border: `1.5px solid ${m.border}`, borderRadius: '10px', padding: '14px 12px', cursor: 'pointer' }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>{m.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a4a' }}>{m.label}</div>
              <div style={{ fontSize: '11px', color: '#5a7280', marginTop: '2px' }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
