'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { GrammarSentence } from '@/lib/types'

const TENSES = [
  { id: 'simple_present', label: 'Simple Present' },
  { id: 'present_continuous', label: 'Present Continuous' },
  { id: 'simple_past', label: 'Simple Past' },
  { id: 'present_perfect', label: 'Present Perfect' },
  { id: 'past_continuous', label: 'Past Continuous' },
  { id: 'past_perfect', label: 'Past Perfect' },
  { id: 'will_future', label: 'Will Future' },
  { id: 'going_to_future', label: 'Going to Future' },
]

export default function GrammarPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [sentences, setSentences] = useState<GrammarSentence[]>([])
  const [current, setCurrent] = useState<GrammarSentence | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [stats, setStats] = useState({ correct: 0, wrong: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      loadSentences(data.user.id)
    })
  }, [router])

  async function loadSentences(uid: string) {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', uid).single()
    const { data } = await supabase.from('grammar_sentences').select('*').eq('workspace_id', profile?.workspace_id || '').order('created_at', { ascending: false })
    const list = data || []
    setSentences(list)
    if (list.length > 0) setCurrent(list[Math.floor(Math.random() * list.length)])
    setLoading(false)
  }

  async function generateMore() {
    if (!userId) return
    setGenerating(true)
    try {
      const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', userId).single()
      const res = await fetch('/api/generate-grammar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tense: 'mixed', difficulty: 2 }) })
      const generated: GrammarSentence[] = await res.json()
      const toInsert = generated.map((s: GrammarSentence) => ({ ...s, workspace_id: profile?.workspace_id, id: undefined }))
      await supabase.from('grammar_sentences').insert(toInsert)
      loadSentences(userId)
    } catch { alert('Fehler beim Generieren.') }
    setGenerating(false)
  }

  function answer(tense: string) {
    if (result !== null || !current) return
    setSelected(tense)
    const correct = tense === current.tense
    setResult(correct ? 'correct' : 'wrong')
    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), wrong: prev.wrong + (correct ? 0 : 1), total: prev.total + 1 }))
    if (userId) supabase.from('grammar_progress').insert({ user_id: userId, sentence_id: current.id, answered_tense: tense, was_correct: correct, answered_at: new Date().toISOString() })
  }

  function next() {
    const pool = sentences.filter(s => s.id !== current?.id)
    if (pool.length === 0) return
    setCurrent(pool[Math.floor(Math.random() * pool.length)])
    setSelected(null); setResult(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <span style={{ fontWeight: 500, fontSize: '17px' }}>🎯 Grammatik-Trainer</span>
        {stats.total > 0 && <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b6b67' }}>{stats.correct}/{stats.total} richtig</span>}
      </div>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        {sentences.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '36px', marginBottom: '1rem' }}>🎯</div>
            <p style={{ color: '#6b6b67', marginBottom: '1.5rem', fontSize: '15px' }}>Noch keine Sätze vorhanden. Lass die KI Übungssätze generieren!</p>
            <button onClick={generateMore} disabled={generating} style={{ padding: '12px 24px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
              {generating ? '⏳ Generiere Sätze...' : '✨ Sätze generieren'}
            </button>
          </div>
        )}
        {current && (
          <div>
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', color: '#6b6b67', marginBottom: '8px' }}>Welche Zeitform ist das?</div>
              <div style={{ fontSize: '20px', fontWeight: 500, fontStyle: 'italic', lineHeight: '1.5' }}>"{current.sentence}"</div>
              {current.signal_words?.length > 0 && <div style={{ fontSize: '12px', color: '#6b6b67', marginTop: '8px' }}>Signalwörter: {current.signal_words.join(', ')}</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1rem' }}>
              {TENSES.map(t => {
                let bg = '#fff', border = '#e5e5e2', color = '#1a1a18'
                if (selected === t.id) {
                  if (result === 'correct') { bg = '#EAF3DE'; border = '#639922'; color = '#27500A' }
                  else { bg = '#FCEBEB'; border = '#E24B4A'; color = '#791F1F' }
                } else if (result !== null && t.id === current.tense) {
                  bg = '#EAF3DE'; border = '#639922'; color = '#27500A'
                }
                return (
                  <button key={t.id} onClick={() => answer(t.id)} disabled={result !== null} style={{ padding: '11px 8px', background: bg, border: `0.5px solid ${border}`, borderRadius: '10px', fontSize: '13px', color, cursor: result !== null ? 'default' : 'pointer', fontWeight: selected === t.id ? 500 : 400 }}>
                    {t.label}
                  </button>
                )
              })}
            </div>
            {result && (
              <div style={{ background: result === 'correct' ? '#EAF3DE' : '#FCEBEB', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 500, marginBottom: '4px', color: result === 'correct' ? '#27500A' : '#791F1F' }}>
                  {result === 'correct' ? '✓ Richtig!' : `✗ Falsch — es ist ${TENSES.find(t => t.id === current.tense)?.label}`}
                </div>
                <p style={{ fontSize: '13px', color: result === 'correct' ? '#27500A' : '#791F1F', lineHeight: '1.5' }}>{current.explanation}</p>
              </div>
            )}
            {result && (
              <button onClick={next} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
                Nächster Satz →
              </button>
            )}
          </div>
        )}
        {sentences.length > 0 && (
          <button onClick={generateMore} disabled={generating} style={{ width: '100%', padding: '10px', background: '#fff', border: '0.5px solid #e5e5e2', color: '#6b6b67', borderRadius: '12px', fontSize: '13px', cursor: 'pointer', marginTop: '1rem' }}>
            {generating ? '⏳ Generiere...' : '+ Neue Sätze generieren (KI)'}
          </button>
        )}
      </div>
    </div>
  )
}
