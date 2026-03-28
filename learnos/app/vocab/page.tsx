'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { VocabSet, VocabCard, VocabProgress } from '@/lib/types'

type View = 'sets' | 'cards' | 'quiz'

export default function VocabPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string>('')
  const [view, setView] = useState<View>('sets')
  const [sets, setSets] = useState<VocabSet[]>([])
  const [activeSet, setActiveSet] = useState<VocabSet | null>(null)
  const [cards, setCards] = useState<VocabCard[]>([])
  const [progress, setProgress] = useState<Record<string, VocabProgress>>({})
  const [quizQueue, setQuizQueue] = useState<VocabCard[]>([])
  const [quizIdx, setQuizIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [showNewSet, setShowNewSet] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [newSetIcon, setNewSetIcon] = useState('📝')
  const [newCardDe, setNewCardDe] = useState('')
  const [newCardEn, setNewCardEn] = useState('')
  const [newCardSyn, setNewCardSyn] = useState('')
  const [stats, setStats] = useState({ correct: 0, wrong: 0 })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      loadSets(data.user.id)
    })
  }, [router])

  async function loadSets(uid: string) {
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', uid).single()
    if (!profile) return
    const { data } = await supabase.from('vocab_sets').select('*').eq('workspace_id', profile.workspace_id).order('created_at', { ascending: false })
    setSets(data || [])
  }

  async function loadCards(setId: string) {
    const { data } = await supabase.from('vocab_cards').select('*').eq('set_id', setId)
    setCards(data || [])
    if (userId) {
      const { data: prog } = await supabase.from('vocab_progress').select('*').eq('user_id', userId).in('card_id', (data||[]).map((c:VocabCard) => c.id))
      const map: Record<string, VocabProgress> = {}
      ;(prog || []).forEach((p: VocabProgress) => { map[p.card_id] = p })
      setProgress(map)
    }
  }

  async function createSet() {
    if (!newSetName.trim() || !userId) return
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', userId).single()
    await supabase.from('vocab_sets').insert({ name: newSetName, icon: newSetIcon, color: '#EEEDFE', workspace_id: profile?.workspace_id, created_by: userId, description: '' })
    setNewSetName(''); setShowNewSet(false)
    loadSets(userId)
  }

  async function createCard() {
    if (!newCardDe.trim() || !newCardEn.trim() || !activeSet) return
    const synonyms = newCardSyn.split(',').map(s => s.trim()).filter(Boolean)
    await supabase.from('vocab_cards').insert({ set_id: activeSet.id, word_de: newCardDe, word_en: newCardEn, synonyms, example_sentence: '' })
    setNewCardDe(''); setNewCardEn(''); setNewCardSyn(''); setShowNewCard(false)
    loadCards(activeSet.id)
  }

  function openSet(s: VocabSet) {
    setActiveSet(s); setView('cards'); loadCards(s.id)
  }

  function startQuiz() {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    setQuizQueue(shuffled); setQuizIdx(0); setAnswer(''); setResult(null)
    setStats({ correct: 0, wrong: 0 }); setView('quiz')
  }

  function checkAnswer() {
    const card = quizQueue[quizIdx]
    const clean = (s: string) => s.trim().toLowerCase()
    const correct = clean(answer) === clean(card.word_en) || (card.synonyms || []).some((s: string) => clean(answer) === clean(s))
    setResult(correct ? 'correct' : 'wrong')
    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), wrong: prev.wrong + (correct ? 0 : 1) }))
    if (userId) {
      const prog = progress[card.id]
      const newCorrect = (prog?.correct || 0) + (correct ? 1 : 0)
      const newWrong = (prog?.wrong || 0) + (correct ? 0 : 1)
      const strength = Math.min(5, Math.floor(newCorrect / 2) + 1)
      supabase.from('vocab_progress').upsert({ user_id: userId, card_id: card.id, correct: newCorrect, wrong: newWrong, strength, last_seen: new Date().toISOString() })
    }
  }

  function nextCard() {
    if (quizIdx + 1 >= quizQueue.length) { setView('cards'); return }
    setQuizIdx(i => i + 1); setAnswer(''); setResult(null)
  }

  const icons = ['📝','📚','💼','✈️','🏥','💻','🎯','🌍','🗣️','⭐']

  if (view === 'quiz' && quizQueue.length > 0) {
    const card = quizQueue[quizIdx]
    const total = quizQueue.length
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
        <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('cards')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
          <span style={{ fontWeight: 500 }}>Quiz: {activeSet?.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b6b67' }}>{quizIdx + 1} / {total}</span>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem 1rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <div style={{ flex: 1, background: '#EAF3DE', borderRadius: '8px', padding: '8px', textAlign: 'center', fontSize: '13px', color: '#27500A', fontWeight: 500 }}>✓ {stats.correct}</div>
            <div style={{ flex: 1, background: '#FCEBEB', borderRadius: '8px', padding: '8px', textAlign: 'center', fontSize: '13px', color: '#791F1F', fontWeight: 500 }}>✗ {stats.wrong}</div>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '16px', padding: '2rem', textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '13px', color: '#6b6b67', marginBottom: '8px' }}>Wie heißt das auf Englisch?</div>
            <div style={{ fontSize: '28px', fontWeight: 500 }}>{card.word_de}</div>
          </div>
          {result === null ? (
            <div>
              <input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && answer && checkAnswer()} placeholder="Englische Übersetzung eingeben..." autoFocus style={{ width: '100%', padding: '12px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '16px', marginBottom: '8px' }} />
              <button onClick={checkAnswer} disabled={!answer} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>Prüfen</button>
            </div>
          ) : (
            <div>
              <div style={{ padding: '1rem', borderRadius: '12px', marginBottom: '8px', background: result === 'correct' ? '#EAF3DE' : '#FCEBEB', color: result === 'correct' ? '#27500A' : '#791F1F', fontSize: '15px' }}>
                {result === 'correct' ? `✓ Richtig!` : `✗ Falsch. Richtig: "${card.word_en}"`}
                {card.synonyms?.length > 0 && <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>Auch akzeptiert: {card.synonyms.join(', ')}</div>}
              </div>
              <button onClick={nextCard} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
                {quizIdx + 1 >= total ? 'Fertig' : 'Weiter →'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === 'cards' && activeSet) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
        <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('sets')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
          <span style={{ fontSize: '18px' }}>{activeSet.icon}</span>
          <span style={{ fontWeight: 500 }}>{activeSet.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b6b67' }}>{cards.length} Karten</span>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
          {cards.length > 0 && <button onClick={startQuiz} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', marginBottom: '1rem' }}>▶ Quiz starten ({cards.length} Karten)</button>}
          <button onClick={() => setShowNewCard(true)} style={{ width: '100%', padding: '10px', background: '#fff', border: '0.5px solid #378ADD', color: '#378ADD', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', marginBottom: '1rem' }}>+ Vokabel hinzufügen</button>
          {showNewCard && (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
              <input value={newCardDe} onChange={e => setNewCardDe(e.target.value)} placeholder="Deutsch" style={{ width: '100%', padding: '9px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
              <input value={newCardEn} onChange={e => setNewCardEn(e.target.value)} placeholder="Englisch" style={{ width: '100%', padding: '9px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
              <input value={newCardSyn} onChange={e => setNewCardSyn(e.target.value)} placeholder="Synonyme (kommagetrennt, optional)" style={{ width: '100%', padding: '9px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={createCard} style={{ flex: 1, padding: '9px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Speichern</button>
                <button onClick={() => setShowNewCard(false)} style={{ flex: 1, padding: '9px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '8px', cursor: 'pointer', color: '#6b6b67' }}>Abbrechen</button>
              </div>
            </div>
          )}
          {cards.map(card => {
            const p = progress[card.id]
            return (
              <div key={card.id} style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '15px' }}>{card.word_de}</div>
                    <div style={{ color: '#6b6b67', fontSize: '13px', marginTop: '2px' }}>{card.word_en}</div>
                    {card.synonyms?.length > 0 && <div style={{ fontSize: '12px', color: '#6b6b67', marginTop: '2px' }}>+ {card.synonyms.join(', ')}</div>}
                  </div>
                  {p && <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ fontSize: '11px', background: '#EAF3DE', color: '#27500A', padding: '2px 6px', borderRadius: '20px' }}>✓ {p.correct}</span>
                    <span style={{ fontSize: '11px', background: '#FCEBEB', color: '#791F1F', padding: '2px 6px', borderRadius: '20px' }}>✗ {p.wrong}</span>
                  </div>}
                </div>
              </div>
            )
          })}
          {cards.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#6b6b67', fontSize: '14px' }}>Noch keine Vokabeln. Füge deine erste Karte hinzu!</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <span style={{ fontWeight: 500, fontSize: '17px' }}>🗂️ Vokabel-Sets</span>
      </div>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <button onClick={() => setShowNewSet(true)} style={{ width: '100%', padding: '10px', background: '#fff', border: '0.5px solid #378ADD', color: '#378ADD', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', marginBottom: '1rem' }}>+ Neues Set erstellen</button>
        {showNewSet && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder="Name des Sets (z.B. DOOH Fachbegriffe)" style={{ width: '100%', padding: '9px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {icons.map(ic => <button key={ic} onClick={() => setNewSetIcon(ic)} style={{ padding: '6px', fontSize: '18px', background: newSetIcon === ic ? '#E6F1FB' : '#fff', border: `0.5px solid ${newSetIcon === ic ? '#378ADD' : '#e5e5e2'}`, borderRadius: '6px', cursor: 'pointer' }}>{ic}</button>)}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={createSet} style={{ flex: 1, padding: '9px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Erstellen</button>
              <button onClick={() => setShowNewSet(false)} style={{ flex: 1, padding: '9px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '8px', cursor: 'pointer', color: '#6b6b67' }}>Abbrechen</button>
            </div>
          </div>
        )}
        {sets.map(s => (
          <div key={s.id} onClick={() => openSet(s)} style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>{s.icon || '📝'}</span>
            <div><div style={{ fontWeight: 500 }}>{s.name}</div>{s.description && <div style={{ fontSize: '12px', color: '#6b6b67' }}>{s.description}</div>}</div>
            <span style={{ marginLeft: 'auto', fontSize: '18px', color: '#6b6b67' }}>›</span>
          </div>
        ))}
        {sets.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#6b6b67', fontSize: '14px' }}>Noch keine Sets. Erstelle dein erstes Vokabel-Set!</div>}
      </div>
    </div>
  )
}
