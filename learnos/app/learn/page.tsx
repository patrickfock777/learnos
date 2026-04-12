'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/app/components/BottomNav'

const modules = [
  {
    href: '/vocab',
    icon: '🗂',
    title: 'Vokabeltrainer',
    desc: 'Lerne neue Wörter mit Karteikarten und Quiz',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.1)',
    border: 'rgba(168, 85, 247, 0.25)',
  },
  {
    href: '/writing',
    icon: '✍️',
    title: 'Schreib-Trainer',
    desc: 'Schreibe Texte und bekomme KI-Feedback',
    color: '#00e5c8',
    bg: 'rgba(0, 229, 200, 0.1)',
    border: 'rgba(0, 229, 200, 0.25)',
  },
  {
    href: '/grammar',
    icon: '🎯',
    title: 'Grammatik-Trainer',
    desc: 'Erkenne englische Zeitformen',
    color: '#f472b6',
    bg: 'rgba(244, 114, 182, 0.1)',
    border: 'rgba(244, 114, 182, 0.25)',
  },
]

export default function LearnPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth')
    })
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
      <div style={{ padding: '20px 16px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#e8ecf4', letterSpacing: '-0.5px' }}>Sprache lernen</h1>
          <p style={{ fontSize: '13px', color: '#5a6478', marginTop: '4px' }}>Verbessere dein Englisch Schritt für Schritt</p>
        </div>

        <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {modules.map(m => (
            <button
              key={m.href}
              onClick={() => router.push(m.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px',
                background: '#141a2e',
                border: `1.5px solid #2a3050`,
                borderRadius: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                background: m.bg,
                border: `1px solid ${m.border}`,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#e8ecf4', marginBottom: '3px' }}>{m.title}</div>
                <div style={{ fontSize: '12px', color: '#5a6478', lineHeight: '1.4' }}>{m.desc}</div>
              </div>
              <span style={{ color: '#2a3050', fontSize: '18px' }}>›</span>
            </button>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
