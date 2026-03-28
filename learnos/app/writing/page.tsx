'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { WritingSession } from '@/lib/types'

type View = 'history' | 'write' | 'result'

export default function WritingPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [view, setView] = useState<View>('history')
  const [sessions, setSessions] = useState<WritingSession[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeSession, setActiveSession] = useState<WritingSession | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      loadSessions(data.user.id)
    })
  }, [router])

  async function loadSessions(uid: string) {
    const { data } = await supabase.from('writing_sessions').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    setSessions(data || [])
  }

  async function submitWriting() {
    if (!text.trim() || !userId) return
    setLoading(true)
    try {
      const res = await fetch('/api/improve-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      const result = await res.json()
      const { data } = await supabase.from('writing_sessions').insert({
        user_id: userId,
        title: title || `Session ${new Date().toLocaleDateString('de-AT')}`,
        original_text: text,
        improved_text: result.improved,
        feedback: result.feedback,
        score: result.score
      }).select().single()
      if (data) { setActiveSession(data); setView('result') }
      loadSessions(userId)
    } catch {
      alert('Fehler beim Verbessern. Bitte versuche es erneut.')
    }
    setLoading(false)
  }

  const scoreColor = (s: number) => s >= 80 ? '#27500A' : s >= 60 ? '#633806' : '#791F1F'
  const scoreBg = (s: number) => s >= 80 ? '#EAF3DE' : s >= 60 ? '#FAEEDA' : '#FCEBEB'

  if (view === 'result' && activeSession) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
        <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => { setView('history'); setText(''); setTitle('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
          <span style={{ fontWeight: 500 }}>Ergebnis</span>
          {activeSession.score !== null && <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, padding: '3px 10px', borderRadius: '20px', background: scoreBg(activeSession.score), color: scoreColor(activeSession.score) }}>Score: {activeSession.score}/100</span>}
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', color: '#6b6b67', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dein Original</div>
            <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#6b6b67' }}>{activeSession.original_text}</p>
          </div>
          {activeSession.improved_text && (
            <div style={{ background: '#EAF3DE', border: '0.5px solid #639922', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '12px', color: '#27500A', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KI-Verbesserung</div>
              <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#27500A' }}>{activeSession.improved_text}</p>
            </div>
          )}
          {activeSession.feedback && activeSession.feedback.length > 0 && (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ fontSize: '12px', color: '#6b6b67', marginBottom: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Korrekturen ({activeSession.feedback.length})</div>
              {activeSession.feedback.map((f, i) => (
                <div key={i} style={{ borderTop: i > 0 ? '0.5px solid #e5e5e2' : 'none', paddingTop: i > 0 ? '10px' : 0, marginTop: i > 0 ? '10px' : 0 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', background: '#FCEBEB', color: '#791F1F', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>✗ {f.error}</span>
                    <span style={{ fontSize: '12px', color: '#6b6b67' }}>→</span>
                    <span style={{ fontSize: '12px', background: '#EAF3DE', color: '#27500A', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>✓ {f.correction}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#6b6b67', lineHeight: '1.5' }}>{f.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === 'write') {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
        <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('history')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
          <span style={{ fontWeight: 500 }}>Neuer Text</span>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel (optional)" style={{ width: '100%', padding: '10px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Schreibe hier deinen englischen Text..." rows={10} style={{ width: '100%', padding: '12px', border: '0.5px solid #e5e5e2', borderRadius: '12px', fontSize: '15px', lineHeight: '1.7', resize: 'vertical', marginBottom: '8px' }} />
          <button onClick={submitWriting} disabled={!text.trim() || loading} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'KI analysiert...' : '✨ Verbessern & Feedback erhalten'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <span style={{ fontWeight: 500, fontSize: '17px' }}>✍️ Schreib-Trainer</span>
      </div>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <button onClick={() => setView('write')} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', marginBottom: '1rem' }}>+ Neuen Text schreiben</button>
        <div style={{ fontSize: '13px', color: '#6b6b67', marginBottom: '0.75rem', fontWeight: 500 }}>Verlauf ({sessions.length} Sessions)</div>
        {sessions.map(s => (
          <div key={s.id} onClick={() => { setActiveSession(s); setView('result') }} style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '8px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>{s.title}</div>
                <div style={{ fontSize: '12px', color: '#6b6b67', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.original_text}</div>
                <div style={{ fontSize: '11px', color: '#6b6b67', marginTop: '6px' }}>{new Date(s.created_at).toLocaleDateString('de-AT')}</div>
              </div>
              {s.score !== null && <span style={{ fontSize: '13px', fontWeight: 500, padding: '3px 8px', borderRadius: '20px', background: scoreBg(s.score), color: scoreColor(s.score), marginLeft: '8px' }}>{s.score}</span>}
            </div>
          </div>
        ))}
        {sessions.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#6b6b67', fontSize: '14px' }}>Noch keine Sessions. Schreibe deinen ersten Text!</div>}
      </div>
    </div>
  )
}
