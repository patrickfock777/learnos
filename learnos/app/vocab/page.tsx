'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { VocabSet, VocabCard, VocabProgress } from '@/lib/types'
import BottomNav from '@/app/components/BottomNav'

const C = {
  primary:'#00e5c8', teal:'#00e5c8', tealDark:'#00b8a0', tealLight:'rgba(0,229,200,0.15)',
  accent:'#00e5c8', sand:'#141a2e', text:'#e8ecf4', text2:'#8892a8', border:'#2a3050',
  danger:'#ef4444', dangerLight:'rgba(239,68,68,0.15)', white:'#141a2e', bg:'#0a0e1a',
  warn:'rgba(168,85,247,0.15)', warnDark:'#a855f7', ok:'rgba(74,222,128,0.15)', okDark:'#4ade80',
  card2:'#1c2340', border2:'#3a4570', text3:'#5a6478',
  violet:'#a855f7', cyanGlow:'rgba(0,229,200,0.15)'
}

// Strength logic:
// 1 = Sehr schwach: never correct, wrong 2+ times
// 2 = Schwach: more wrong than correct
// 3 = Mittel: about equal, or attempted < 3 times
// 4 = Stark: correct 3+ times in a row (correct > wrong * 2)
function calcStrength(correct: number, wrong: number, streak: number): 1|2|3|4 {
  const total = correct + wrong
  if (total === 0) return 3
  if (correct === 0 && wrong >= 2) return 1
  if (wrong > correct) return 2
  if (correct >= 3 && streak >= 3) return 4
  if (correct >= 3 && correct > wrong * 2) return 4
  return 3
}

function strengthLabel(s: 1|2|3|4) {
  if (s===1) return { label:'Sehr schwach', bg:'rgba(239,68,68,0.15)', color:'#ef4444' }
  if (s===2) return { label:'Schwach',      bg:'rgba(168,85,247,0.15)', color:'#a855f7' }
  if (s===3) return { label:'Mittel',       bg:'rgba(0,229,200,0.15)', color:'#8892a8' }
  return           { label:'Stark',         bg:'rgba(74,222,128,0.15)', color:'#4ade80' }
}

interface ErrorEntry { id:string; card_id:string; typed:string; correct:string; created_at:string }
interface Pattern { key:string; count:number; example:string }

function findPatterns(errors: ErrorEntry[]): Pattern[] {
  const map: Record<string,{count:number,example:string}> = {}
  for (const e of errors) {
    const t = e.typed.toLowerCase().trim()
    const c = e.correct.toLowerCase().trim()
    if (t === c || !t || !c) continue
    // Transposition detection (e.g. ou→uo)
    for (let i = 0; i < Math.min(t.length, c.length) - 1; i++) {
      if (t[i] !== c[i] && t[i+1] !== undefined && c[i+1] !== undefined) {
        const tp = t[i] + t[i+1], cp = c[i] + c[i+1]
        if (tp !== cp && tp.split('').sort().join('') === cp.split('').sort().join('')) {
          const key = `"${cp}" → du schreibst "${tp}"`
          map[key] = { count:(map[key]?.count||0)+1, example:`${e.correct} (du: ${e.typed})` }
          break
        }
      }
    }
    // Missing/extra letters
    if (Math.abs(t.length - c.length) === 1) {
      const key = t.length < c.length ? 'Buchstabe vergessen' : 'Buchstabe zu viel'
      map[key] = { count:(map[key]?.count||0)+1, example:`${e.correct} (du: ${e.typed})` }
    }
    // Wrong single char
    if (t.length === c.length) {
      for (let i = 0; i < t.length; i++) {
        if (t[i] !== c[i]) {
          const key = `"${c[i]}" → du schreibst "${t[i]}"`
          map[key] = { count:(map[key]?.count||0)+1, example:`${e.correct} (du: ${e.typed})` }
          break
        }
      }
    }
  }
  return Object.entries(map)
    .map(([key,v]) => ({key, count:v.count, example:v.example}))
    .sort((a,b) => b.count - a.count)
    .slice(0, 8)
}

function getHint(typed: string, correct: string): string {
  const t = typed.toLowerCase().trim(), c = correct.toLowerCase().trim()
  if (t === c) return ''
  for (let i = 0; i < Math.min(t.length, c.length) - 1; i++) {
    if (t[i] !== c[i] && t[i+1] !== undefined && c[i+1] !== undefined) {
      const tp = t[i]+t[i+1], cp = c[i]+c[i+1]
      if (tp !== cp && tp.split('').sort().join('') === cp.split('').sort().join(''))
        return `💡 Tipp: Du schreibst "${cp}" oft als "${tp}"`
    }
  }
  if (t.length < c.length) return `💡 Ein Buchstabe fehlt — achte auf "${correct}"`
  if (t.length > c.length) return `💡 Ein Buchstabe zu viel — richtig: "${correct}"`
  return `💡 Richtig: "${correct}"`
}

type View = 'sets' | 'cards' | 'quiz' | 'weak_select' | 'patterns'
type QuizMode = 'normal' | 'weak'

export default function VocabPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [view, setView] = useState<View>('sets')
  const [sets, setSets] = useState<VocabSet[]>([])
  const [activeSet, setActiveSet] = useState<VocabSet|null>(null)
  const [cards, setCards] = useState<VocabCard[]>([])
  const [allCards, setAllCards] = useState<VocabCard[]>([])
  const [progress, setProgress] = useState<Record<string, VocabProgress & {streak:number}>>({})
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])

  // Quiz state
  const [quizQueue, setQuizQueue] = useState<VocabCard[]>([])
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizMode, setQuizMode] = useState<QuizMode>('normal')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<'correct'|'wrong'|null>(null)
  const [hint, setHint] = useState('')
  const [sessionStats, setSessionStats] = useState({correct:0, wrong:0})

  // UI state
  const [showNewSet, setShowNewSet] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [newSetIcon, setNewSetIcon] = useState('📝')
  const [newCardDe, setNewCardDe] = useState('')
  const [newCardEn, setNewCardEn] = useState('')
  const [newCardSyn, setNewCardSyn] = useState('')
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<{de:string,en:string}[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string|null>(null)
  const [weakSource, setWeakSource] = useState<'all'|string>('all')

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      supabase.from('profiles').select('workspace_id').eq('id',data.user.id).single()
        .then(({data:p}) => { if (p) { setWorkspaceId(p.workspace_id); loadAll(data.user.id, p.workspace_id) } })
    })
  },[router])

  async function loadAll(uid: string, wid: string) {
    const [{data:setsData}, {data:cardsData}, {data:progData}, {data:errData}] = await Promise.all([
      supabase.from('vocab_sets').select('*').eq('workspace_id',wid).order('created_at',{ascending:false}),
      supabase.from('vocab_cards').select('*, vocab_sets!inner(workspace_id)').eq('vocab_sets.workspace_id',wid),
      supabase.from('vocab_progress').select('*').eq('user_id',uid),
      supabase.from('vocab_errors').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(300)
    ])
    setSets(setsData||[])
    setAllCards(cardsData||[])
    const progMap: Record<string,any> = {}
    ;(progData||[]).forEach((p:any) => { progMap[p.card_id] = {...p, streak: p.streak||0} })
    setProgress(progMap)
    setErrors(errData||[])
    setPatterns(findPatterns(errData||[]))
  }

  async function loadCards(setId: string) {
    const {data} = await supabase.from('vocab_cards').select('*').eq('set_id',setId)
    setCards(data||[])
  }

  // --- CRUD ---
  async function createSet() {
    if (!newSetName.trim()||!userId) return
    await supabase.from('vocab_sets').insert({name:newSetName,icon:newSetIcon,color:C.tealLight,workspace_id:workspaceId,created_by:userId,description:''})
    setNewSetName('');setShowNewSet(false);loadAll(userId,workspaceId)
  }

  async function deleteSet(id:string) {
    await supabase.from('vocab_sets').delete().eq('id',id)
    setConfirmDelete(null);loadAll(userId,workspaceId)
  }

  async function deleteCard(id:string) {
    await supabase.from('vocab_cards').delete().eq('id',id)
    setConfirmDelete(null)
    if (activeSet) loadCards(activeSet.id)
    loadAll(userId,workspaceId)
  }

  async function createCard() {
    if (!newCardDe.trim()||!newCardEn.trim()||!activeSet) return
    const synonyms = newCardSyn.split(',').map(s=>s.trim()).filter(Boolean)
    await supabase.from('vocab_cards').insert({set_id:activeSet.id,word_de:newCardDe,word_en:newCardEn,synonyms,example_sentence:''})
    setNewCardDe('');setNewCardEn('');setNewCardSyn('');setShowNewCard(false)
    loadCards(activeSet.id);loadAll(userId,workspaceId)
  }

  function parseImport(raw:string) {
    const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean)
    const parsed:{de:string,en:string}[] = []
    for (const line of lines) {
      for (const sep of [/\s*=\s*/,/\s*;\s*/,/\t/,/\s{2,}/]) {
        const parts = line.split(sep)
        if (parts.length>=2) { parsed.push({de:parts[0].trim(),en:parts.slice(1).join(' ').trim()}); break }
      }
    }
    setImportPreview(parsed)
  }

  async function importCards() {
    if (!importPreview.length||!activeSet) return
    setImportLoading(true)
    await supabase.from('vocab_cards').insert(importPreview.map(p=>({set_id:activeSet.id,word_de:p.de,word_en:p.en,synonyms:[],example_sentence:''})))
    setImportText('');setImportPreview([]);setShowImport(false)
    loadCards(activeSet.id);loadAll(userId,workspaceId);setImportLoading(false)
  }

  // --- QUIZ ---
  function startQuiz(mode: QuizMode, source: VocabCard[]) {
    if (!source.length) return
    // For weak mode: sort by strength ascending so weakest come first, then shuffle within groups
    let pool = [...source]
    if (mode==='weak') {
      pool.sort((a,b) => {
        const sa = getStrength(a.id), sb = getStrength(b.id)
        return sa - sb + (Math.random()-0.5)*0.5
      })
    } else {
      pool.sort(()=>Math.random()-0.5)
    }
    setQuizQueue(pool);setQuizIdx(0);setAnswer('');setResult(null);setHint('')
    setSessionStats({correct:0,wrong:0});setQuizMode(mode);setView('quiz')
  }

  function getStrength(cardId: string): 1|2|3|4 {
    const p = progress[cardId]
    if (!p) return 3
    return calcStrength(p.correct||0, p.wrong||0, p.streak||0)
  }

  function isWeak(cardId: string) {
    const s = getStrength(cardId)
    const p = progress[cardId]
    return p && (p.correct+p.wrong)>0 && s<=2
  }

  async function checkAnswer() {
    const card = quizQueue[quizIdx]
    const clean = (s:string) => s.trim().toLowerCase()
    const ok = clean(answer)===clean(card.word_en) || (card.synonyms||[]).some((s:string)=>clean(answer)===clean(s))
    setResult(ok?'correct':'wrong')
    setSessionStats(prev=>({correct:prev.correct+(ok?1:0),wrong:prev.wrong+(ok?0:1)}))

    if (!ok) setHint(getHint(answer, card.word_en))
    else setHint('')

    // Save error
    if (!ok && userId) {
      await supabase.from('vocab_errors').insert({
        user_id: userId, card_id: card.id,
        typed: answer.trim(), correct: card.word_en
      })
    }

    // Update progress
    if (userId) {
      const p = progress[card.id]
      const newCorrect = (p?.correct||0) + (ok?1:0)
      const newWrong = (p?.wrong||0) + (ok?0:1)
      const newStreak = ok ? (p?.streak||0)+1 : 0
      const newStrength = calcStrength(newCorrect, newWrong, newStreak)
      await supabase.from('vocab_progress').upsert({
        user_id:userId, card_id:card.id,
        correct:newCorrect, wrong:newWrong,
        strength:newStrength, streak:newStreak,
        last_seen:new Date().toISOString()
      })
      setProgress(prev=>({...prev,[card.id]:{...p,user_id:userId,card_id:card.id,correct:newCorrect,wrong:newWrong,strength:newStrength,streak:newStreak,last_seen:new Date().toISOString()}}))
    }
  }

  function nextCard() {
    if (quizIdx+1>=quizQueue.length) {
      loadAll(userId,workspaceId)
      setView(activeSet?'cards':'sets')
    } else {
      setQuizIdx(i=>i+1);setAnswer('');setResult(null);setHint('')
    }
  }

  // --- Computed ---
  const weakAll = allCards.filter(c=>isWeak(c.id))
  const icons = ['📝','📚','💼','✈️','🏥','💻','🎯','🌍','🗣️','⭐']

  // --- UI helpers ---
  const Topbar = ({onBack,title,right}:{onBack:()=>void,title:string,right?:React.ReactNode}) => (
    <div style={{background:'#111827',borderBottom:'1px solid #2a3050',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:'#00e5c8',fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
      <span style={{color:'#e8ecf4',fontSize:'15px',fontWeight:700,flex:1}}>{title}</span>
      {right}
    </div>
  )

  const ConfirmModal = ({label,onConfirm}:{label:string,onConfirm:()=>void}) => (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'1rem'}}>
      <div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:'14px',padding:'1.5rem',maxWidth:'320px',width:'100%'}}>
        <div style={{fontWeight:700,fontSize:'16px',marginBottom:'6px',color:C.text}}>Wirklich löschen?</div>
        <div style={{fontSize:'14px',color:C.text2,marginBottom:'1.25rem'}}>„{label}"</div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={onConfirm} style={{flex:1,padding:'10px',background:C.danger,color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:600}}>Löschen</button>
          <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:'10px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'8px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  // ===================== QUIZ VIEW =====================
  if (view==='quiz'&&quizQueue.length>0) {
    const card = quizQueue[quizIdx]
    const total = quizQueue.length
    const sl = strengthLabel(getStrength(card.id))
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        <Topbar onBack={()=>{loadAll(userId,workspaceId);setView(activeSet?'cards':'sets')}}
          title={quizMode==='weak'?'🎯 Schwäche-Trainer':'Quiz'}
          right={<span style={{fontSize:'12px',color:C.teal,fontWeight:600}}>{quizIdx+1}/{total}</span>}
        />
        <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          {/* Progress bar */}
          <div style={{height:'4px',background:C.border,borderRadius:'2px',marginBottom:'1rem'}}>
            <div style={{height:'100%',background:quizMode==='weak'?C.danger:'#00e5c8',borderRadius:'2px',width:`${(quizIdx/total)*100}%`,transition:'width 0.3s'}}></div>
          </div>
          {/* Stats */}
          <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
            <div style={{flex:1,background:C.ok,border:`1px solid #4ade80`,borderRadius:'8px',padding:'7px',textAlign:'center',fontSize:'13px',color:C.okDark,fontWeight:600}}>✓ {sessionStats.correct}</div>
            <div style={{flex:1,background:C.dangerLight,border:`1px solid ${C.danger}`,borderRadius:'8px',padding:'7px',textAlign:'center',fontSize:'13px',color:C.danger,fontWeight:600}}>✗ {sessionStats.wrong}</div>
          </div>
          {/* Card */}
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'14px',padding:'2rem',textAlign:'center',marginBottom:'1rem'}}>
            <div style={{fontSize:'11px',color:C.text2,marginBottom:'8px',fontWeight:500,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Wie heißt das auf Englisch?</div>
            <div style={{fontSize:'28px',fontWeight:700,color:'#00e5c8',marginBottom:'10px'}}>{card.word_de}</div>
            <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'20px',background:sl.bg,color:sl.color,fontWeight:600}}>{sl.label}</span>
          </div>
          {/* Input */}
          {result===null?(
            <div>
              <input value={answer} onChange={e=>setAnswer(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&answer.trim()&&checkAnswer()}
                placeholder="Englische Übersetzung..." autoFocus
                style={{width:'100%',padding:'13px',border:`1.5px solid ${C.border}`,borderRadius:'10px',fontSize:'16px',marginBottom:'10px',background:C.sand,outline:'none'}} />
              <button onClick={checkAnswer} disabled={!answer.trim()}
                style={{width:'100%',padding:'13px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>
                Prüfen
              </button>
            </div>
          ):(
            <div>
              <div style={{padding:'1rem',borderRadius:'10px',marginBottom:'10px',
                background:result==='correct'?C.ok:C.dangerLight,
                border:`1.5px solid ${result==='correct'?'#4ade80':C.danger}`,
                color:result==='correct'?C.okDark:C.danger,fontSize:'15px',lineHeight:'1.6'}}>
                {result==='correct'?'✓ Richtig!':`✗ Falsch — Richtig: "${card.word_en}"`}
                {card.synonyms?.length>0&&<div style={{fontSize:'12px',marginTop:'4px',opacity:0.8}}>Auch akzeptiert: {card.synonyms.join(', ')}</div>}
                {hint&&result==='wrong'&&(
                  <div style={{marginTop:'10px',padding:'8px 10px',background:'rgba(255,255,255,0.1)',borderRadius:'6px',fontSize:'12px',fontWeight:600}}>{hint}</div>
                )}
              </div>
              <button onClick={nextCard}
                style={{width:'100%',padding:'13px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>
                {quizIdx+1>=total?'Fertig ✓':'Weiter →'}
              </button>
            </div>
          )}
        </div>
        <BottomNav />
      </div>
    )
  }

  // ===================== WEAK SELECT VIEW =====================
  if (view==='weak_select') {
    const weakSets = sets.filter(s=>allCards.some(c=>c.set_id===s.id&&isWeak(c.id)))
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        <Topbar onBack={()=>setView('sets')} title="🎯 Schwäche-Trainer" />
        <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          <div style={{fontSize:'13px',color:C.text2,marginBottom:'1rem',lineHeight:'1.6'}}>
            Wähle ob du alle schwachen Karten oder nur die eines bestimmten Sets üben willst.
          </div>
          {/* All weak */}
          <div onClick={()=>startQuiz('weak', weakAll)}
            style={{background:C.dangerLight,border:`1.5px solid ${C.danger}`,borderRadius:'12px',padding:'1rem',marginBottom:'8px',cursor:'pointer',display:'flex',alignItems:'center',gap:'12px'}}>
            <div style={{fontSize:'28px'}}>🌍</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:C.danger,fontSize:'15px'}}>Alle schwachen Karten</div>
              <div style={{fontSize:'12px',color:C.danger,opacity:0.8,marginTop:'2px'}}>{weakAll.length} Karten aus allen Sets</div>
            </div>
            <div style={{color:C.danger,fontSize:'20px'}}>›</div>
          </div>
          {/* Per set */}
          {weakSets.length>0&&(
            <>
              <div style={{fontSize:'11px',color:C.text2,fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'1rem 0 0.5rem'}}>Oder nur ein Set:</div>
              {weakSets.map(s=>{
                const setWeak = allCards.filter(c=>c.set_id===s.id&&isWeak(c.id))
                return (
                  <div key={s.id} onClick={()=>startQuiz('weak', setWeak)}
                    style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'6px',cursor:'pointer',display:'flex',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'20px'}}>{s.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,color:C.text,fontSize:'14px'}}>{s.name}</div>
                      <div style={{fontSize:'12px',color:C.danger,marginTop:'2px',fontWeight:500}}>{setWeak.length} schwache Karten</div>
                    </div>
                    <div style={{color:C.text2,fontSize:'18px'}}>›</div>
                  </div>
                )
              })}
            </>
          )}
          {weakAll.length===0&&(
            <div style={{textAlign:'center',padding:'3rem',color:C.text2,fontSize:'14px'}}>
              <div style={{fontSize:'40px',marginBottom:'1rem'}}>🎉</div>
              Keine schwachen Karten — weiter so!
            </div>
          )}
        </div>
        <BottomNav />
      </div>
    )
  }

  // ===================== PATTERNS VIEW =====================
  if (view==='patterns') {
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        <Topbar onBack={()=>setView('sets')} title="📊 Deine Fehler-Muster" />
        <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          {patterns.length===0?(
            <div style={{textAlign:'center',padding:'3rem',color:C.text2,fontSize:'14px'}}>
              <div style={{fontSize:'40px',marginBottom:'1rem'}}>📊</div>
              Noch keine Daten — mache einige Quiz-Runden!
            </div>
          ):(
            <>
              <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'12px',overflow:'hidden',marginBottom:'1rem'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,fontWeight:700,color:'#00e5c8',fontSize:'14px'}}>
                  Häufigste Fehler-Muster
                </div>
                {patterns.map((p,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 16px',borderTop:i>0?`1px solid ${C.border}`:'none',background:i<3?C.dangerLight:'transparent'}}>
                    <div style={{width:'32px',height:'32px',borderRadius:'50%',background:i<3?C.danger:C.violet,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>{p.count}×</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',fontWeight:600,color:C.text}}>{p.key}</div>
                      <div style={{fontSize:'11px',color:C.text2,marginTop:'2px'}}>Bsp: {p.example}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{background:'rgba(0,229,200,0.15)',border:`1px solid #00b8a0`,borderRadius:'10px',padding:'12px 14px',fontSize:'13px',color:'#00e5c8',lineHeight:'1.6'}}>
                <strong>Tipp:</strong> Die rot markierten Muster kommen am häufigsten vor. Nutze den Schwäche-Trainer um gezielt diese Wörter zu üben.
              </div>
            </>
          )}
        </div>
        <BottomNav />
      </div>
    )
  }

  // ===================== CARDS VIEW =====================
  if (view==='cards'&&activeSet) {
    const setWeakCards = cards.filter(c=>isWeak(c.id))
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        {confirmDelete&&<ConfirmModal label={cards.find(c=>c.id===confirmDelete)?.word_de||''} onConfirm={()=>deleteCard(confirmDelete!)}/>}
        <Topbar onBack={()=>setView('sets')} title={`${activeSet.icon} ${activeSet.name}`}
          right={<span style={{fontSize:'12px',color:C.teal}}>{cards.length} Karten</span>}
        />
        <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          {/* Quiz buttons */}
          {cards.length>0&&(
            <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
              <button onClick={()=>startQuiz('normal',cards)}
                style={{flex:1,padding:'10px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
                ▶ Quiz ({cards.length})
              </button>
              {setWeakCards.length>0&&(
                <button onClick={()=>startQuiz('weak',setWeakCards)}
                  style={{flex:1,padding:'10px',background:C.dangerLight,border:`1.5px solid ${C.danger}`,color:C.danger,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
                  🎯 Schwache ({setWeakCards.length})
                </button>
              )}
            </div>
          )}
          {/* Add buttons */}
          <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
            <button onClick={()=>{setShowNewCard(!showNewCard);setShowImport(false)}}
              style={{flex:1,padding:'9px',background:C.card2,border:`1.5px solid ${C.border2}`,color:'#00e5c8',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
              + Einzeln
            </button>
            <button onClick={()=>{setShowImport(!showImport);setShowNewCard(false)}}
              style={{flex:1,padding:'9px',background:C.card2,border:`1.5px solid ${C.border2}`,color:'#00e5c8',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
              ⬆ Liste importieren
            </button>
          </div>
          {/* New card form */}
          {showNewCard&&(
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
              {[['Deutsch',newCardDe,setNewCardDe],['Englisch',newCardEn,setNewCardEn],['Synonyme (kommagetrennt, optional)',newCardSyn,setNewCardSyn]].map(([ph,val,set],i)=>(
                <input key={i} value={val as string} onChange={e=>(set as Function)(e.target.value)} placeholder={ph as string}
                  style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none'}} />
              ))}
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={createCard} style={{flex:1,padding:'9px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>Speichern</button>
                <button onClick={()=>setShowNewCard(false)} style={{flex:1,padding:'9px',background:C.card2,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
              </div>
            </div>
          )}
          {/* Import form */}
          {showImport&&(
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
              <div style={{fontSize:'12px',color:C.text2,marginBottom:'6px',lineHeight:'1.5'}}>
                Formate: <code style={{background:C.sand,padding:'1px 4px',borderRadius:'3px',fontSize:'11px'}}>Wort = word</code> <code style={{background:C.sand,padding:'1px 4px',borderRadius:'3px',fontSize:'11px'}}>Wort ; word</code>
              </div>
              <textarea value={importText} onChange={e=>{setImportText(e.target.value);parseImport(e.target.value)}}
                placeholder={'die Gelegenheit = opportunity\nverantwortlich = responsible'} rows={5}
                style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none',resize:'vertical' as const,fontFamily:'monospace'}} />
              {importPreview.length>0&&(
                <div style={{marginBottom:'8px',background:C.card2,borderRadius:'6px',padding:'6px 8px',maxHeight:'100px',overflowY:'auto'}}>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#00e5c8',marginBottom:'4px'}}>{importPreview.length} erkannt:</div>
                  {importPreview.map((p,i)=><div key={i} style={{fontSize:'11px',color:C.text2}}>{p.de} → {p.en}</div>)}
                </div>
              )}
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={importCards} disabled={!importPreview.length||importLoading}
                  style={{flex:1,padding:'9px',background:importPreview.length?'#00e5c8':'#3a4570',color:importPreview.length?'#0a0e1a':'#5a6478',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>
                  {importLoading?'...':`${importPreview.length} importieren`}
                </button>
                <button onClick={()=>{setShowImport(false);setImportText('');setImportPreview([])}}
                  style={{padding:'9px 14px',background:C.card2,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {/* Card list */}
          {cards.map(card=>{
            const p = progress[card.id]
            const sl = p&&(p.correct+p.wrong)>0 ? strengthLabel(getStrength(card.id)) : null
            return (
              <div key={card.id} style={{background:C.white,border:`1px solid ${isWeak(card.id)?C.danger:C.border}`,borderRadius:'8px',padding:'10px 12px',marginBottom:'6px',display:'flex',alignItems:'flex-start',gap:'8px'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:'14px',color:C.text}}>{card.word_de}</div>
                  <div style={{color:C.text2,fontSize:'12px',marginTop:'2px'}}>{card.word_en}</div>
                  {card.synonyms?.length>0&&<div style={{fontSize:'11px',color:C.text3,marginTop:'2px'}}>+ {card.synonyms.join(', ')}</div>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'5px',flexShrink:0}}>
                  {sl&&<span style={{fontSize:'10px',padding:'2px 6px',borderRadius:'20px',background:sl.bg,color:sl.color,fontWeight:600,whiteSpace:'nowrap' as const}}>{sl.label}</span>}
                  {p&&(p.correct+p.wrong)>0&&<span style={{fontSize:'10px',color:C.text2,whiteSpace:'nowrap' as const}}>✓{p.correct} ✗{p.wrong}</span>}
                  <button onClick={()=>setConfirmDelete(card.id)} style={{padding:'3px 7px',background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:'12px'}}>✕</button>
                </div>
              </div>
            )
          })}
          {cards.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Vokabeln. Füge deine erste Karte hinzu!</div>}
        </div>
        <BottomNav />
      </div>
    )
  }

  // ===================== SETS VIEW =====================
  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&<ConfirmModal label={sets.find(s=>s.id===confirmDelete)?.name||''} onConfirm={()=>deleteSet(confirmDelete!)}/>}
      <Topbar onBack={()=>router.push('/learn')} title="🗂 Vokabeln" />
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        {/* Stats row */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'1rem'}}>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',textAlign:'center'}}>
            <div style={{fontSize:'22px',fontWeight:700,color:C.primary}}>{allCards.length}</div>
            <div style={{fontSize:'11px',color:C.text2,marginTop:'2px'}}>Gesamt</div>
          </div>
          <div onClick={()=>weakAll.length>0&&setView('weak_select')}
            style={{background:weakAll.length>0?C.dangerLight:C.white,border:`1px solid ${weakAll.length>0?C.danger:C.border}`,borderRadius:'10px',padding:'12px',textAlign:'center',cursor:weakAll.length>0?'pointer':'default'}}>
            <div style={{fontSize:'22px',fontWeight:700,color:weakAll.length>0?C.danger:C.text}}>{weakAll.length}</div>
            <div style={{fontSize:'11px',color:weakAll.length>0?C.danger:C.text2,marginTop:'2px'}}>{weakAll.length>0?'🎯 Üben':'Schwach'}</div>
          </div>
          <div onClick={()=>setView('patterns')}
            style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',textAlign:'center',cursor:'pointer'}}>
            <div style={{fontSize:'22px',fontWeight:700,color:C.primary}}>{patterns.length}</div>
            <div style={{fontSize:'11px',color:C.text2,marginTop:'2px'}}>📊 Muster</div>
          </div>
        </div>

        {/* Weak banner */}
        {weakAll.length>0&&(
          <div onClick={()=>setView('weak_select')}
            style={{background:C.dangerLight,border:`1.5px solid ${C.danger}`,borderRadius:'12px',padding:'12px 16px',marginBottom:'1rem',cursor:'pointer',display:'flex',alignItems:'center',gap:'12px'}}>
            <div style={{fontSize:'24px'}}>🎯</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:C.danger,fontSize:'14px'}}>{weakAll.length} schwache Karten warten</div>
              <div style={{fontSize:'12px',color:C.danger,opacity:0.8,marginTop:'2px'}}>Jetzt gezielt die schwachen Karten üben</div>
            </div>
            <div style={{color:C.danger,fontSize:'20px'}}>›</div>
          </div>
        )}

        {/* New set */}
        <button onClick={()=>setShowNewSet(!showNewSet)}
          style={{width:'100%',padding:'10px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',marginBottom:'1rem'}}>
          + Neues Set erstellen
        </button>
        {showNewSet&&(
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
            <input value={newSetName} onChange={e=>setNewSetName(e.target.value)} placeholder="Name des Sets"
              style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none'}} />
            <div style={{display:'flex',gap:'5px',flexWrap:'wrap' as const,marginBottom:'8px'}}>
              {icons.map(ic=><button key={ic} onClick={()=>setNewSetIcon(ic)} style={{padding:'6px',fontSize:'18px',background:newSetIcon===ic?C.tealLight:C.white,border:`1px solid ${newSetIcon===ic?C.tealDark:C.border}`,borderRadius:'6px',cursor:'pointer'}}>{ic}</button>)}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={createSet} style={{flex:1,padding:'9px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>Erstellen</button>
              <button onClick={()=>setShowNewSet(false)} style={{flex:1,padding:'9px',background:C.card2,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
            </div>
          </div>
        )}

        {/* Set list */}
        {sets.map(s=>{
          const setCards = allCards.filter(c=>c.set_id===s.id)
          const setWeak = setCards.filter(c=>isWeak(c.id))
          const setDone = setCards.filter(c=>{ const p=progress[c.id]; return p&&(p.correct+p.wrong)>0 }).length
          return (
            <div key={s.id} style={{background:C.white,border:`1px solid ${setWeak.length>0?C.danger:C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'12px'}}>
              <div onClick={()=>{setActiveSet(s);setView('cards');loadCards(s.id)}} style={{display:'flex',alignItems:'center',gap:'10px',flex:1,cursor:'pointer'}}>
                <span style={{fontSize:'22px'}}>{s.icon||'📝'}</span>
                <div>
                  <div style={{fontWeight:600,color:C.text}}>{s.name}</div>
                  <div style={{fontSize:'11px',color:C.text2,marginTop:'2px',display:'flex',gap:'8px'}}>
                    <span>{setCards.length} Karten</span>
                    {setDone>0&&<span>{setDone} geübt</span>}
                    {setWeak.length>0&&<span style={{color:C.danger,fontWeight:600}}>⚠ {setWeak.length} schwach</span>}
                  </div>
                </div>
              </div>
              <button onClick={()=>setConfirmDelete(s.id)} style={{padding:'4px 8px',background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:'13px'}}>✕</button>
            </div>
          )
        })}
        {sets.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Sets. Erstelle dein erstes Vokabel-Set!</div>}
      </div>
      <BottomNav />
    </div>
  )
}
