'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { VocabSet, VocabCard, VocabProgress } from '@/lib/types'

const C = { primary:'#1a3a4a',teal:'#ADD8E6',tealDark:'#7BB8CC',tealLight:'#E8F6FA',accent:'#2a6478',sand:'#f7f4f0',text:'#1a2c35',text2:'#5a7280',border:'#dde8ec',danger:'#e24b4a',dangerLight:'#fef0f0',white:'#fff',bg:'#edf4f7',warn:'#FAEEDA',warnDark:'#BA7517' }

type View = 'sets'|'cards'|'quiz'|'weak'|'errors'
type QuizMode = 'normal'|'weak_set'|'weak_all'

interface ErrorEntry { id:string; card_id:string; typed_answer:string; correct_answer:string; created_at:string }
interface ErrorPattern { pattern:string; count:number; example:string }

function analyzeErrors(errors: ErrorEntry[]): ErrorPattern[] {
  const patterns: Record<string,{count:number,example:string}> = {}
  for (const e of errors) {
    const typed = e.typed_answer.toLowerCase()
    const correct = e.correct_answer.toLowerCase()
    if (typed === correct) continue
    // Find character-level differences
    for (let i = 0; i < Math.min(typed.length, correct.length); i++) {
      if (typed[i] !== correct[i]) {
        // Look for transpositions (ou->uo etc)
        if (i+1 < typed.length && i+1 < correct.length) {
          const typedPair = typed[i]+typed[i+1]
          const correctPair = correct[i]+correct[i+1]
          if (typedPair !== correctPair && typedPair.split('').sort().join('') === correctPair.split('').sort().join('')) {
            const key = `"${correctPair}" schreibst du als "${typedPair}"`
            patterns[key] = { count: (patterns[key]?.count||0)+1, example: `${e.correct_answer} → ${e.typed_answer}` }
          }
        }
        // Single char substitution
        if (typed.length === correct.length) {
          const key = `"${correct[i]}" schreibst du als "${typed[i]}"`
          patterns[key] = { count: (patterns[key]?.count||0)+1, example: `${e.correct_answer} → ${e.typed_answer}` }
        }
        break
      }
    }
    // Length differences
    if (typed.length !== correct.length) {
      const key = typed.length < correct.length ? `Buchstaben vergessen (${e.correct_answer})` : `Buchstaben zu viel (${e.typed_answer})`
      patterns[key] = { count: (patterns[key]?.count||0)+1, example: `${e.correct_answer} → ${e.typed_answer}` }
    }
  }
  return Object.entries(patterns)
    .map(([pattern,v]) => ({pattern, count:v.count, example:v.example}))
    .filter(p => p.count >= 1)
    .sort((a,b) => b.count - a.count)
    .slice(0,10)
}

function getStrengthColor(s:number) {
  if (s<=1) return {bg:'#FCEBEB',text:'#791F1F',label:'Sehr schwach'}
  if (s<=2) return {bg:'#FAEEDA',text:'#633806',label:'Schwach'}
  if (s<=3) return {bg:'#f7f4f0',text:'#5a7280',label:'Mittel'}
  if (s<=4) return {bg:'#EAF3DE',text:'#27500A',label:'Gut'}
  return {bg:'#E1F5EE',text:'#085041',label:'Sehr gut'}
}

export default function VocabPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [view, setView] = useState<View>('sets')
  const [sets, setSets] = useState<VocabSet[]>([])
  const [activeSet, setActiveSet] = useState<VocabSet|null>(null)
  const [cards, setCards] = useState<VocabCard[]>([])
  const [allCards, setAllCards] = useState<VocabCard[]>([])
  const [progress, setProgress] = useState<Record<string,VocabProgress>>({})
  const [quizQueue, setQuizQueue] = useState<VocabCard[]>([])
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizMode, setQuizMode] = useState<QuizMode>('normal')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<'correct'|'wrong'|null>(null)
  const [showNewSet, setShowNewSet] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<{de:string,en:string}[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [newSetIcon, setNewSetIcon] = useState('📝')
  const [newCardDe, setNewCardDe] = useState('')
  const [newCardEn, setNewCardEn] = useState('')
  const [newCardSyn, setNewCardSyn] = useState('')
  const [stats, setStats] = useState({correct:0,wrong:0})
  const [confirmDelete, setConfirmDelete] = useState<string|null>(null)
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [patterns, setPatterns] = useState<ErrorPattern[]>([])
  const [weakCards, setWeakCards] = useState<VocabCard[]>([])
  const [currentError, setCurrentError] = useState<string|null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      supabase.from('profiles').select('workspace_id').eq('id',data.user.id).single().then(({data:p}) => {
        if (p) { setWorkspaceId(p.workspace_id); loadSets(data.user.id, p.workspace_id) }
      })
    })
  },[router])

  async function loadSets(uid:string, wid:string) {
    const {data} = await supabase.from('vocab_sets').select('*').eq('workspace_id',wid).order('created_at',{ascending:false})
    setSets(data||[])
    loadAllProgress(uid, wid)
  }

  async function loadAllProgress(uid:string, wid:string) {
    const {data:setData} = await supabase.from('vocab_sets').select('id').eq('workspace_id',wid)
    if (!setData?.length) return
    const setIds = setData.map(s=>s.id)
    const {data:cardData} = await supabase.from('vocab_cards').select('*').in('set_id',setIds)
    setAllCards(cardData||[])
    if (cardData?.length) {
      const {data:prog} = await supabase.from('vocab_progress').select('*').eq('user_id',uid).in('card_id',cardData.map(c=>c.id))
      const map:Record<string,VocabProgress>={}
      ;(prog||[]).forEach((p:VocabProgress)=>{map[p.card_id]=p})
      setProgress(map)
      const weak = cardData.filter(c=>{ const p=map[c.id]; return !p||(p.strength<=2) })
      setWeakCards(weak)
    }
    const {data:errData} = await supabase.from('vocab_errors').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(200)
    setErrors(errData||[])
    setPatterns(analyzeErrors(errData||[]))
  }

  async function loadCards(setId:string) {
    const {data} = await supabase.from('vocab_cards').select('*').eq('set_id',setId)
    setCards(data||[])
  }

  async function createSet() {
    if (!newSetName.trim()||!userId) return
    await supabase.from('vocab_sets').insert({name:newSetName,icon:newSetIcon,color:C.tealLight,workspace_id:workspaceId,created_by:userId,description:''})
    setNewSetName('');setShowNewSet(false);loadSets(userId,workspaceId)
  }

  async function deleteSet(id:string) { await supabase.from('vocab_sets').delete().eq('id',id); setConfirmDelete(null); loadSets(userId,workspaceId) }
  async function deleteCard(id:string) { await supabase.from('vocab_cards').delete().eq('id',id); setConfirmDelete(null); if(activeSet) loadCards(activeSet.id); loadAllProgress(userId,workspaceId) }

  async function createCard() {
    if (!newCardDe.trim()||!newCardEn.trim()||!activeSet) return
    const synonyms = newCardSyn.split(',').map(s=>s.trim()).filter(Boolean)
    await supabase.from('vocab_cards').insert({set_id:activeSet.id,word_de:newCardDe,word_en:newCardEn,synonyms,example_sentence:''})
    setNewCardDe('');setNewCardEn('');setNewCardSyn('');setShowNewCard(false)
    loadCards(activeSet.id);loadAllProgress(userId,workspaceId)
  }

  function parseImport(raw:string) {
    const lines=raw.split('\n').map(l=>l.trim()).filter(Boolean)
    const parsed:{de:string,en:string}[]=[]
    for (const line of lines) {
      const separators=[/\s*=\s*/,/\s*;\s*/,/\t/,/\s{2,}/]
      let found=false
      for (const sep of separators) {
        const parts=line.split(sep)
        if (parts.length>=2) {
          const de=parts[0].trim(),en=parts.slice(1).join(' ').trim()
          if (de&&en) {parsed.push({de,en});found=true;break}
        }
      }
      if (!found&&line.includes(' ')) {
        const idx=line.indexOf(' ')
        const de=line.slice(0,idx).trim(),en=line.slice(idx).trim()
        if (de&&en) parsed.push({de,en})
      }
    }
    setImportPreview(parsed)
  }

  async function importCards() {
    if (!importPreview.length||!activeSet) return
    setImportLoading(true)
    await supabase.from('vocab_cards').insert(importPreview.map(p=>({set_id:activeSet.id,word_de:p.de,word_en:p.en,synonyms:[],example_sentence:''})))
    setImportText('');setImportPreview([]);setShowImport(false)
    loadCards(activeSet.id);loadAllProgress(userId,workspaceId)
    setImportLoading(false)
  }

  function startQuiz(mode:QuizMode, sourceCards?:VocabCard[]) {
    let pool:VocabCard[]
    if (mode==='weak_all') pool=[...weakCards]
    else if (mode==='weak_set') pool=cards.filter(c=>{const p=progress[c.id];return !p||(p.strength<=2)})
    else pool=sourceCards||[...cards]
    if (!pool.length) return
    setQuizQueue(pool.sort(()=>Math.random()-0.5))
    setQuizIdx(0);setAnswer('');setResult(null);setCurrentError(null)
    setStats({correct:0,wrong:0});setQuizMode(mode);setView('quiz')
  }

  function checkAnswer() {
    const card=quizQueue[quizIdx]
    const clean=(s:string)=>s.trim().toLowerCase()
    const ok=clean(answer)===clean(card.word_en)||(card.synonyms||[]).some((s:string)=>clean(answer)===clean(s))
    setResult(ok?'correct':'wrong')
    setStats(prev=>({correct:prev.correct+(ok?1:0),wrong:prev.wrong+(ok?0:1)}))

    // Track error pattern
    if (!ok) {
      const hint = getErrorHint(answer, card.word_en)
      setCurrentError(hint)
      supabase.from('vocab_errors').insert({user_id:userId,card_id:card.id,typed_answer:answer.trim(),correct_answer:card.word_en})
    } else {
      setCurrentError(null)
    }

    if (userId) {
      const prog=progress[card.id]
      const nc=(prog?.correct||0)+(ok?1:0),nw=(prog?.wrong||0)+(ok?0:1)
      const newStrength = ok
        ? Math.min(5, (prog?.strength||1)+1)
        : Math.max(1, (prog?.strength||3)-1)
      supabase.from('vocab_progress').upsert({user_id:userId,card_id:card.id,correct:nc,wrong:nw,strength:newStrength,last_seen:new Date().toISOString()})
      setProgress(prev=>({...prev,[card.id]:{...prog,user_id:userId,card_id:card.id,correct:nc,wrong:nw,strength:newStrength,last_seen:new Date().toISOString()}}))
    }
  }

  function getErrorHint(typed:string, correct:string):string {
    const t=typed.toLowerCase().trim(), c=correct.toLowerCase().trim()
    if (t===c) return ''
    // Check transpositions
    for (let i=0;i<Math.min(t.length,c.length)-1;i++) {
      if (t[i]!==c[i]) {
        const tPair=t[i]+(t[i+1]||''), cPair=c[i]+(c[i+1]||'')
        if (tPair!==cPair && tPair.split('').sort().join('')===cPair.split('').sort().join('')) {
          return `Tipp: Du schreibst "${cPair}" oft als "${tPair}"`
        }
        break
      }
    }
    if (t.length < c.length) return `Tipp: Ein Buchstabe fehlt — Richtig: "${correct}"`
    if (t.length > c.length) return `Tipp: Ein Buchstabe zu viel — Richtig: "${correct}"`
    return `Richtig: "${correct}"`
  }

  function nextCard() {
    if (quizIdx+1>=quizQueue.length) {
      loadAllProgress(userId,workspaceId)
      setView(activeSet?'cards':'sets')
      return
    }
    setQuizIdx(i=>i+1);setAnswer('');setResult(null);setCurrentError(null)
  }

  const icons=['📝','📚','💼','✈️','🏥','💻','🎯','🌍','🗣️','⭐']

  const topbar=(onBack:()=>void,title:string,right?:React.ReactNode)=>(
    <div style={{background:C.primary,padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:C.teal,fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
      <span style={{color:'#fff',fontSize:'15px',fontWeight:700,flex:1}}>{title}</span>
      {right}
    </div>
  )

  const ConfirmModal=({label,onConfirm}:{label:string,onConfirm:()=>void})=>(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'1rem'}}>
      <div style={{background:C.white,borderRadius:'14px',padding:'1.5rem',maxWidth:'320px',width:'100%'}}>
        <div style={{fontWeight:700,fontSize:'16px',marginBottom:'6px'}}>Wirklich löschen?</div>
        <div style={{fontSize:'14px',color:C.text2,marginBottom:'1.25rem'}}>„{label}"</div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={onConfirm} style={{flex:1,padding:'10px',background:C.danger,color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:600}}>Löschen</button>
          <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:'10px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'8px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  // QUIZ VIEW
  if (view==='quiz'&&quizQueue.length>0) {
    const card=quizQueue[quizIdx]
    const modeLabel = quizMode==='weak_all'?'🎯 Schwache Karten (alle)':quizMode==='weak_set'?'🎯 Schwache Karten (Set)':'Quiz'
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        {topbar(()=>{setView(activeSet?'cards':'sets');loadAllProgress(userId,workspaceId)},modeLabel,
          <span style={{fontSize:'13px',color:C.teal}}>{quizIdx+1}/{quizQueue.length}</span>
        )}
        <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
            <div style={{flex:1,background:'#f0faf0',border:'1px solid #90EE90',borderRadius:'8px',padding:'8px',textAlign:'center',fontSize:'13px',color:'#3a8a3a',fontWeight:600}}>✓ {stats.correct}</div>
            <div style={{flex:1,background:C.dangerLight,border:`1px solid ${C.danger}`,borderRadius:'8px',padding:'8px',textAlign:'center',fontSize:'13px',color:C.danger,fontWeight:600}}>✗ {stats.wrong}</div>
          </div>

          {/* Progress bar */}
          <div style={{height:'3px',background:C.border,borderRadius:'2px',marginBottom:'1rem'}}>
            <div style={{height:'100%',background:C.tealDark,borderRadius:'2px',width:`${((quizIdx)/quizQueue.length)*100}%`,transition:'width 0.3s'}}></div>
          </div>

          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'2rem',textAlign:'center',marginBottom:'1rem'}}>
            <div style={{fontSize:'12px',color:C.text2,marginBottom:'8px',fontWeight:500}}>Wie heißt das auf Englisch?</div>
            <div style={{fontSize:'28px',fontWeight:700,color:C.primary}}>{card.word_de}</div>
            {progress[card.id]&&(
              <div style={{marginTop:'8px'}}>
                {(() => { const sc=getStrengthColor(progress[card.id]?.strength||1); return <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'20px',background:sc.bg,color:sc.text,fontWeight:600}}>{sc.label}</span> })()}
              </div>
            )}
          </div>

          {result===null?(
            <div>
              <input value={answer} onChange={e=>setAnswer(e.target.value)} onKeyDown={e=>e.key==='Enter'&&answer&&checkAnswer()} placeholder="Englische Übersetzung..." autoFocus style={{width:'100%',padding:'12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'16px',marginBottom:'8px',background:C.sand,outline:'none'}} />
              <button onClick={checkAnswer} disabled={!answer} style={{width:'100%',padding:'12px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>Prüfen</button>
            </div>
          ):(
            <div>
              <div style={{padding:'1rem',borderRadius:'10px',marginBottom:'8px',background:result==='correct'?'#f0faf0':C.dangerLight,border:`1px solid ${result==='correct'?'#90EE90':C.danger}`,color:result==='correct'?'#3a8a3a':C.danger,fontSize:'15px'}}>
                {result==='correct'?'✓ Richtig!':`✗ Falsch — Richtig: "${card.word_en}"`}
                {card.synonyms?.length>0&&<div style={{fontSize:'12px',marginTop:'4px',opacity:0.8}}>Auch: {card.synonyms.join(', ')}</div>}
                {currentError&&result==='wrong'&&(
                  <div style={{fontSize:'12px',marginTop:'8px',padding:'6px 10px',background:'rgba(255,255,255,0.5)',borderRadius:'6px',fontWeight:500}}>
                    💡 {currentError}
                  </div>
                )}
              </div>
              <button onClick={nextCard} style={{width:'100%',padding:'12px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>{quizIdx+1>=quizQueue.length?'Fertig':'Weiter →'}</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ERRORS VIEW
  if (view==='errors') return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {topbar(()=>setView('sets'),'📊 Fehler-Analyse')}
      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        {patterns.length===0?(
          <div style={{textAlign:'center',padding:'3rem',color:C.text2,fontSize:'14px'}}>
            Noch keine Fehler-Muster — mache mehr Quiz-Runden!
          </div>
        ):(
          <>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'1.25rem',marginBottom:'1rem'}}>
              <div style={{fontSize:'13px',fontWeight:700,color:C.primary,marginBottom:'12px'}}>Deine häufigsten Fehler-Muster</div>
              {patterns.map((p,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderTop:i>0?`1px solid ${C.border}`:'none'}}>
                  <div style={{width:'28px',height:'28px',borderRadius:'50%',background:i<3?C.dangerLight:C.warn,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:i<3?C.danger:C.warnDark,flexShrink:0}}>{p.count}×</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:600,color:C.text}}>{p.pattern}</div>
                    <div style={{fontSize:'11px',color:C.text2,marginTop:'2px'}}>Beispiel: {p.example}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:C.tealLight,border:`1px solid ${C.tealDark}`,borderRadius:'10px',padding:'1rem',fontSize:'13px',color:C.accent,lineHeight:'1.6'}}>
              <strong>Tipp:</strong> Konzentriere dich auf die rot markierten Muster — diese kommen am häufigsten vor. Der Schwäche-Quiz hilft dir gezielt diese Karten zu üben.
            </div>
          </>
        )}
      </div>
    </div>
  )

  // CARDS VIEW
  if (view==='cards'&&activeSet) {
    const setWeakCount = cards.filter(c=>{const p=progress[c.id];return !p||(p.strength<=2)}).length
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        {confirmDelete&&cards.find(c=>c.id===confirmDelete)&&<ConfirmModal label={cards.find(c=>c.id===confirmDelete)?.word_de||''} onConfirm={()=>deleteCard(confirmDelete!)}/>}
        {topbar(()=>setView('sets'),`${activeSet.icon} ${activeSet.name}`,<span style={{fontSize:'12px',color:C.teal}}>{cards.length} Karten</span>)}
        <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          {cards.length>0&&(
            <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
              <button onClick={()=>startQuiz('normal')} style={{flex:1,padding:'10px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>▶ Quiz ({cards.length})</button>
              {setWeakCount>0&&<button onClick={()=>startQuiz('weak_set')} style={{flex:1,padding:'10px',background:C.dangerLight,border:`1.5px solid ${C.danger}`,color:C.danger,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>🎯 Schwache ({setWeakCount})</button>}
            </div>
          )}
          <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
            <button onClick={()=>setShowNewCard(!showNewCard)} style={{flex:1,padding:'9px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>+ Einzeln</button>
            <button onClick={()=>{setShowImport(!showImport);setShowNewCard(false)}} style={{flex:1,padding:'9px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>⬆ Importieren</button>
          </div>

          {showNewCard&&(
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
              {['Deutsch','Englisch','Synonyme (kommagetrennt, optional)'].map((ph,i)=>{
                const vals=[newCardDe,newCardEn,newCardSyn];const sets=[setNewCardDe,setNewCardEn,setNewCardSyn]
                return <input key={i} value={vals[i]} onChange={e=>sets[i](e.target.value)} placeholder={ph} style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none'}} />
              })}
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={createCard} style={{flex:1,padding:'9px',background:C.primary,color:'#fff',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>Speichern</button>
                <button onClick={()=>setShowNewCard(false)} style={{flex:1,padding:'9px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
              </div>
            </div>
          )}

          {showImport&&(
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
              <div style={{fontSize:'12px',color:C.text2,marginBottom:'6px',lineHeight:'1.5'}}>
                Formate: <code style={{background:C.sand,padding:'1px 4px',borderRadius:'3px',fontSize:'11px'}}>Wort = word</code> <code style={{background:C.sand,padding:'1px 4px',borderRadius:'3px',fontSize:'11px'}}>Wort;word</code>
              </div>
              <textarea value={importText} onChange={e=>{setImportText(e.target.value);parseImport(e.target.value)}} placeholder={'die Gelegenheit = opportunity\nverantwortlich = responsible'} rows={5} style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none',resize:'vertical' as const,fontFamily:'monospace'}} />
              {importPreview.length>0&&(
                <div style={{marginBottom:'8px',background:C.sand,borderRadius:'6px',padding:'6px 8px',maxHeight:'100px',overflowY:'auto'}}>
                  <div style={{fontSize:'11px',fontWeight:600,color:C.primary,marginBottom:'4px'}}>{importPreview.length} erkannt:</div>
                  {importPreview.map((p,i)=><div key={i} style={{fontSize:'11px',color:C.text2,padding:'1px 0'}}>{p.de} → {p.en}</div>)}
                </div>
              )}
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={importCards} disabled={!importPreview.length||importLoading} style={{flex:1,padding:'9px',background:importPreview.length?C.primary:'#ccc',color:'#fff',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>{importLoading?'...`':`${importPreview.length} importieren`}</button>
                <button onClick={()=>{setShowImport(false);setImportText('');setImportPreview([])}} style={{padding:'9px 14px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
              </div>
            </div>
          )}

          {cards.map(card=>{
            const p=progress[card.id]
            const sc=p?getStrengthColor(p.strength):null
            return (
              <div key={card.id} style={{background:C.white,border:`1px solid ${p&&p.strength<=2?C.danger:C.border}`,borderRadius:'8px',padding:'10px 12px',marginBottom:'6px',display:'flex',alignItems:'flex-start',gap:'8px'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:'14px',color:C.text}}>{card.word_de}</div>
                  <div style={{color:C.text2,fontSize:'12px',marginTop:'2px'}}>{card.word_en}</div>
                  {card.synonyms?.length>0&&<div style={{fontSize:'11px',color:'#aaa',marginTop:'2px'}}>+ {card.synonyms.join(', ')}</div>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'5px',flexShrink:0}}>
                  {sc&&<span style={{fontSize:'10px',padding:'2px 6px',borderRadius:'20px',background:sc.bg,color:sc.text,fontWeight:600}}>{sc.label}</span>}
                  {p&&<span style={{fontSize:'10px',color:C.text2}}>✓{p.correct} ✗{p.wrong}</span>}
                  <button onClick={()=>setConfirmDelete(card.id)} style={{padding:'3px 7px',background:'none',border:'none',cursor:'pointer',color:'#ccc',fontSize:'12px'}}>✕</button>
                </div>
              </div>
            )
          })}
          {cards.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Vokabeln.</div>}
        </div>
      </div>
    )
  }

  // SETS VIEW
  const totalWeak = weakCards.length
  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&sets.find(s=>s.id===confirmDelete)&&<ConfirmModal label={sets.find(s=>s.id===confirmDelete)?.name||''} onConfirm={()=>deleteSet(confirmDelete!)}/>}
      {topbar(()=>router.push('/dashboard'),'🗂 Vokabeln')}
      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>

        {/* Stats row */}
        <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
          <div style={{flex:1,background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',textAlign:'center'}}>
            <div style={{fontSize:'22px',fontWeight:700,color:C.primary}}>{allCards.length}</div>
            <div style={{fontSize:'11px',color:C.text2}}>Vokabeln gesamt</div>
          </div>
          <div style={{flex:1,background:totalWeak>0?C.dangerLight:C.white,border:`1px solid ${totalWeak>0?C.danger:C.border}`,borderRadius:'10px',padding:'12px',textAlign:'center',cursor:totalWeak>0?'pointer':'default'}} onClick={()=>totalWeak>0&&startQuiz('weak_all')}>
            <div style={{fontSize:'22px',fontWeight:700,color:totalWeak>0?C.danger:C.text}}>{totalWeak}</div>
            <div style={{fontSize:'11px',color:totalWeak>0?C.danger:C.text2}}>{totalWeak>0?'🎯 Jetzt üben':'Schwache Karten'}</div>
          </div>
          <div style={{flex:1,background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',textAlign:'center',cursor:'pointer'}} onClick={()=>setView('errors')}>
            <div style={{fontSize:'22px',fontWeight:700,color:C.primary}}>{patterns.length}</div>
            <div style={{fontSize:'11px',color:C.text2}}>📊 Fehler-Muster</div>
          </div>
        </div>

        {/* Weak cards banner */}
        {totalWeak>0&&(
          <div onClick={()=>startQuiz('weak_all')} style={{background:C.dangerLight,border:`1.5px solid ${C.danger}`,borderRadius:'10px',padding:'12px 16px',marginBottom:'1rem',cursor:'pointer',display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{fontSize:'24px'}}>🎯</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:C.danger,fontSize:'14px'}}>{totalWeak} schwache Karten warten auf dich</div>
              <div style={{fontSize:'12px',color:C.danger,opacity:0.8,marginTop:'2px'}}>Diese Karten hast du öfter falsch — jetzt gezielt üben!</div>
            </div>
            <div style={{color:C.danger,fontSize:'18px'}}>›</div>
          </div>
        )}

        <button onClick={()=>setShowNewSet(!showNewSet)} style={{width:'100%',padding:'10px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',marginBottom:'1rem'}}>+ Neues Set erstellen</button>

        {showNewSet&&(
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
            <input value={newSetName} onChange={e=>setNewSetName(e.target.value)} placeholder="Name des Sets" style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none'}} />
            <div style={{display:'flex',gap:'5px',flexWrap:'wrap' as const,marginBottom:'8px'}}>
              {icons.map(ic=><button key={ic} onClick={()=>setNewSetIcon(ic)} style={{padding:'6px',fontSize:'18px',background:newSetIcon===ic?C.tealLight:C.white,border:`1px solid ${newSetIcon===ic?C.tealDark:C.border}`,borderRadius:'6px',cursor:'pointer'}}>{ic}</button>)}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={createSet} style={{flex:1,padding:'9px',background:C.primary,color:'#fff',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>Erstellen</button>
              <button onClick={()=>setShowNewSet(false)} style={{flex:1,padding:'9px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
            </div>
          </div>
        )}

        {sets.map(s=>{
          const setCardCount=allCards.filter(c=>c.set_id===s.id).length
          const setWeakCount=allCards.filter(c=>c.set_id===s.id&&(()=>{const p=progress[c.id];return !p||p.strength<=2})()).length
          return (
            <div key={s.id} style={{background:C.white,border:`1px solid ${setWeakCount>0?C.danger:C.border}`,borderRadius:'8px',padding:'12px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'12px'}}>
              <div onClick={()=>{setActiveSet(s);setView('cards');loadCards(s.id)}} style={{display:'flex',alignItems:'center',gap:'10px',flex:1,cursor:'pointer'}}>
                <span style={{fontSize:'22px'}}>{s.icon||'📝'}</span>
                <div>
                  <div style={{fontWeight:600,color:C.text}}>{s.name}</div>
                  <div style={{fontSize:'11px',color:C.text2,marginTop:'1px'}}>
                    {setCardCount} Karten
                    {setWeakCount>0&&<span style={{color:C.danger,fontWeight:600}}> · {setWeakCount} schwach</span>}
                  </div>
                </div>
              </div>
              <button onClick={()=>setConfirmDelete(s.id)} style={{padding:'4px 8px',background:'none',border:'none',cursor:'pointer',color:'#ccc',fontSize:'13px'}}>✕</button>
            </div>
          )
        })}
        {sets.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Sets.</div>}
      </div>
    </div>
  )
}
