'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { VocabSet, VocabCard, VocabProgress } from '@/lib/types'

const C = { primary:'#1a3a4a',teal:'#ADD8E6',tealDark:'#7BB8CC',tealLight:'#E8F6FA',sand:'#f7f4f0',text:'#1a2c35',text2:'#5a7280',border:'#dde8ec',danger:'#e24b4a',dangerLight:'#fef0f0',white:'#fff',bg:'#edf4f7' }

type View = 'sets'|'cards'|'quiz'

export default function VocabPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [view, setView] = useState<View>('sets')
  const [sets, setSets] = useState<VocabSet[]>([])
  const [activeSet, setActiveSet] = useState<VocabSet|null>(null)
  const [cards, setCards] = useState<VocabCard[]>([])
  const [progress, setProgress] = useState<Record<string,VocabProgress>>({})
  const [quizQueue, setQuizQueue] = useState<VocabCard[]>([])
  const [quizIdx, setQuizIdx] = useState(0)
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

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id); loadSets(data.user.id)
    })
  },[router])

  async function loadSets(uid:string) {
    const {data:p} = await supabase.from('profiles').select('workspace_id').eq('id',uid).single()
    if (!p) return
    const {data} = await supabase.from('vocab_sets').select('*').eq('workspace_id',p.workspace_id).order('created_at',{ascending:false})
    setSets(data||[])
  }

  async function loadCards(setId:string) {
    const {data} = await supabase.from('vocab_cards').select('*').eq('set_id',setId)
    setCards(data||[])
    if (userId) {
      const {data:prog} = await supabase.from('vocab_progress').select('*').eq('user_id',userId).in('card_id',(data||[]).map((c:VocabCard)=>c.id))
      const map:Record<string,VocabProgress>={}
      ;(prog||[]).forEach((p:VocabProgress)=>{map[p.card_id]=p})
      setProgress(map)
    }
  }

  async function createSet() {
    if (!newSetName.trim()||!userId) return
    const {data:p} = await supabase.from('profiles').select('workspace_id').eq('id',userId).single()
    await supabase.from('vocab_sets').insert({name:newSetName,icon:newSetIcon,color:C.tealLight,workspace_id:p?.workspace_id,created_by:userId,description:''})
    setNewSetName('');setShowNewSet(false);loadSets(userId)
  }

  async function deleteSet(id:string) { await supabase.from('vocab_sets').delete().eq('id',id); setConfirmDelete(null); loadSets(userId) }
  async function deleteCard(id:string) { await supabase.from('vocab_cards').delete().eq('id',id); setConfirmDelete(null); if(activeSet) loadCards(activeSet.id) }

  async function createCard() {
    if (!newCardDe.trim()||!newCardEn.trim()||!activeSet) return
    const synonyms = newCardSyn.split(',').map(s=>s.trim()).filter(Boolean)
    await supabase.from('vocab_cards').insert({set_id:activeSet.id,word_de:newCardDe,word_en:newCardEn,synonyms,example_sentence:''})
    setNewCardDe('');setNewCardEn('');setNewCardSyn('');setShowNewCard(false);loadCards(activeSet.id)
  }

  function parseImport(raw: string) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed: {de:string,en:string}[] = []
    for (const line of lines) {
      // Try different separators: =, ;, tab, multiple spaces
      const separators = [/\s*=\s*/, /\s*;\s*/, /\t/, /\s{2,}/]
      let found = false
      for (const sep of separators) {
        const parts = line.split(sep)
        if (parts.length >= 2) {
          const de = parts[0].trim()
          const en = parts.slice(1).join(' ').trim()
          if (de && en) { parsed.push({de, en}); found = true; break }
        }
      }
      if (!found && line.includes(' ') && !line.includes('=') && !line.includes(';')) {
        // Last resort: split on first space
        const idx = line.indexOf(' ')
        const de = line.slice(0, idx).trim()
        const en = line.slice(idx).trim()
        if (de && en) parsed.push({de, en})
      }
    }
    setImportPreview(parsed)
  }

  async function importCards() {
    if (!importPreview.length || !activeSet) return
    setImportLoading(true)
    const toInsert = importPreview.map(p => ({set_id: activeSet.id, word_de: p.de, word_en: p.en, synonyms: [], example_sentence: ''}))
    await supabase.from('vocab_cards').insert(toInsert)
    setImportText(''); setImportPreview([]); setShowImport(false)
    loadCards(activeSet.id)
    setImportLoading(false)
  }

  function startQuiz() {
    const shuffled=[...cards].sort(()=>Math.random()-0.5)
    setQuizQueue(shuffled);setQuizIdx(0);setAnswer('');setResult(null);setStats({correct:0,wrong:0});setView('quiz')
  }

  function checkAnswer() {
    const card=quizQueue[quizIdx]
    const clean=(s:string)=>s.trim().toLowerCase()
    const ok=clean(answer)===clean(card.word_en)||(card.synonyms||[]).some((s:string)=>clean(answer)===clean(s))
    setResult(ok?'correct':'wrong')
    setStats(prev=>({correct:prev.correct+(ok?1:0),wrong:prev.wrong+(ok?0:1)}))
    if (userId) {
      const prog=progress[card.id]
      const nc=(prog?.correct||0)+(ok?1:0),nw=(prog?.wrong||0)+(ok?0:1)
      supabase.from('vocab_progress').upsert({user_id:userId,card_id:card.id,correct:nc,wrong:nw,strength:Math.min(5,Math.floor(nc/2)+1),last_seen:new Date().toISOString()})
    }
  }

  function nextCard() { if(quizIdx+1>=quizQueue.length){setView('cards');return}; setQuizIdx(i=>i+1);setAnswer('');setResult(null) }

  const icons=['📝','📚','💼','✈️','🏥','💻','🎯','🌍','🗣️','⭐']
  const topbar = (onBack:()=>void, title:string, right?:React.ReactNode) => (
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
        <div style={{fontSize:'14px',color:C.text2,marginBottom:'1.25rem'}}>„{label}" wird dauerhaft gelöscht.</div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={onConfirm} style={{flex:1,padding:'10px',background:C.danger,color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:600}}>Löschen</button>
          <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:'10px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'8px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  if (view==='quiz'&&quizQueue.length>0) {
    const card=quizQueue[quizIdx]
    return (
      <div style={{minHeight:'100vh',background:C.bg}}>
        {topbar(()=>setView('cards'),`Quiz: ${activeSet?.name}`,<span style={{fontSize:'13px',color:C.teal}}>{quizIdx+1}/{quizQueue.length}</span>)}
        <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
          <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
            <div style={{flex:1,background:'#f0faf0',border:'1px solid #90EE90',borderRadius:'8px',padding:'8px',textAlign:'center',fontSize:'13px',color:'#3a8a3a',fontWeight:600}}>✓ {stats.correct}</div>
            <div style={{flex:1,background:C.dangerLight,border:`1px solid ${C.danger}`,borderRadius:'8px',padding:'8px',textAlign:'center',fontSize:'13px',color:C.danger,fontWeight:600}}>✗ {stats.wrong}</div>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'2rem',textAlign:'center',marginBottom:'1rem'}}>
            <div style={{fontSize:'12px',color:C.text2,marginBottom:'8px'}}>Wie heißt das auf Englisch?</div>
            <div style={{fontSize:'28px',fontWeight:700,color:C.primary}}>{card.word_de}</div>
          </div>
          {result===null ? (
            <div>
              <input value={answer} onChange={e=>setAnswer(e.target.value)} onKeyDown={e=>e.key==='Enter'&&answer&&checkAnswer()} placeholder="Englische Übersetzung..." autoFocus style={{width:'100%',padding:'12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'16px',marginBottom:'8px',background:C.sand,outline:'none'}} />
              <button onClick={checkAnswer} disabled={!answer} style={{width:'100%',padding:'12px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>Prüfen</button>
            </div>
          ) : (
            <div>
              <div style={{padding:'1rem',borderRadius:'10px',marginBottom:'8px',background:result==='correct'?'#f0faf0':C.dangerLight,border:`1px solid ${result==='correct'?'#90EE90':C.danger}`,color:result==='correct'?'#3a8a3a':C.danger,fontSize:'15px'}}>
                {result==='correct'?'✓ Richtig!':`✗ Falsch. Richtig: "${card.word_en}"`}
                {card.synonyms?.length>0&&<div style={{fontSize:'12px',marginTop:'4px',opacity:0.8}}>Auch: {card.synonyms.join(', ')}</div>}
              </div>
              <button onClick={nextCard} style={{width:'100%',padding:'12px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>{quizIdx+1>=quizQueue.length?'Fertig':'Weiter →'}</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view==='cards'&&activeSet) return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&cards.find(c=>c.id===confirmDelete)&&<ConfirmModal label={cards.find(c=>c.id===confirmDelete)?.word_de||''} onConfirm={()=>deleteCard(confirmDelete!)}/>}
      {topbar(()=>setView('sets'),`${activeSet.icon} ${activeSet.name}`,<span style={{fontSize:'12px',color:C.teal}}>{cards.length} Karten</span>)}
      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        {cards.length>0&&<button onClick={startQuiz} style={{width:'100%',padding:'11px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer',marginBottom:'8px'}}>▶ Quiz starten ({cards.length} Karten)</button>}
        <div style={{display:'flex',gap:'8px',marginBottom:'1rem'}}>
          <button onClick={()=>{setShowNewCard(!showNewCard);setShowImport(false)}} style={{flex:1,padding:'9px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>+ Einzeln</button>
          <button onClick={()=>{setShowImport(!showImport);setShowNewCard(false)}} style={{flex:1,padding:'9px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>⬆ Liste importieren</button>
        </div>
        {showImport&&(
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
            <div style={{fontSize:'12px',color:C.text2,marginBottom:'6px',lineHeight:'1.5'}}>
              Füge deine Vokabelliste ein. Unterstützte Formate pro Zeile:<br/>
              <code style={{fontSize:'11px',background:C.sand,padding:'1px 4px',borderRadius:'3px'}}>Wort = word</code> &nbsp;
              <code style={{fontSize:'11px',background:C.sand,padding:'1px 4px',borderRadius:'3px'}}>Wort=word</code> &nbsp;
              <code style={{fontSize:'11px',background:C.sand,padding:'1px 4px',borderRadius:'3px'}}>Wort ; word</code> &nbsp;
              <code style={{fontSize:'11px',background:C.sand,padding:'1px 4px',borderRadius:'3px'}}>Wort;word</code>
            </div>
            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); parseImport(e.target.value) }}
              placeholder={'die Gelegenheit = opportunity\nverantwortlich = responsible\ndie Herausforderung ; challenge'}
              rows={6}
              style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none',resize:'vertical',lineHeight:'1.6',fontFamily:'monospace'}}
            />
            {importPreview.length>0&&(
              <div style={{marginBottom:'8px'}}>
                <div style={{fontSize:'11px',fontWeight:600,color:C.primary,marginBottom:'5px'}}>{importPreview.length} Vokabeln erkannt:</div>
                <div style={{maxHeight:'120px',overflowY:'auto',background:C.sand,borderRadius:'6px',padding:'6px 8px'}}>
                  {importPreview.map((p,i)=>(
                    <div key={i} style={{fontSize:'12px',padding:'3px 0',borderBottom:i<importPreview.length-1?`1px solid ${C.border}`:'none',display:'flex',gap:'8px'}}>
                      <span style={{color:C.text,fontWeight:500,minWidth:'80px'}}>{p.de}</span>
                      <span style={{color:C.text2}}>→</span>
                      <span style={{color:C.accent||C.primary}}>{p.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={importCards} disabled={importPreview.length===0||importLoading} style={{flex:1,padding:'9px',background:importPreview.length>0?C.primary:'#ccc',color:'#fff',border:'none',borderRadius:'7px',cursor:importPreview.length>0?'pointer':'default',fontWeight:600,fontSize:'13px'}}>
                {importLoading?'Importiere...`':`${importPreview.length} Karten importieren`}
              </button>
              <button onClick={()=>{setShowImport(false);setImportText('');setImportPreview([])}} style={{padding:'9px 14px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2,fontSize:'13px'}}>Abbrechen</button>
            </div>
          </div>
        )}
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
        {cards.map(card=>{const p=progress[card.id]; return (
          <div key={card.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'8px',padding:'10px 12px',marginBottom:'6px',display:'flex',alignItems:'flex-start',gap:'8px'}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:'14px',color:C.text}}>{card.word_de}</div>
              <div style={{color:C.text2,fontSize:'12px',marginTop:'2px'}}>{card.word_en}</div>
              {card.synonyms?.length>0&&<div style={{fontSize:'11px',color:'#aaa',marginTop:'2px'}}>+ {card.synonyms.join(', ')}</div>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
              {p&&<><span style={{fontSize:'10px',background:'#f0faf0',color:'#3a8a3a',padding:'2px 6px',borderRadius:'20px',fontWeight:600}}>✓{p.correct}</span><span style={{fontSize:'10px',background:C.dangerLight,color:C.danger,padding:'2px 6px',borderRadius:'20px',fontWeight:600}}>✗{p.wrong}</span></>}
              <button onClick={()=>setConfirmDelete(card.id)} style={{padding:'3px 7px',background:'none',border:'none',cursor:'pointer',color:'#ccc',fontSize:'12px'}}>✕</button>
            </div>
          </div>
        )})}
        {cards.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Vokabeln. Füge deine erste Karte hinzu!</div>}
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&sets.find(s=>s.id===confirmDelete)&&<ConfirmModal label={sets.find(s=>s.id===confirmDelete)?.name||''} onConfirm={()=>deleteSet(confirmDelete!)}/>}
      {topbar(()=>router.push('/dashboard'),'🗂 Vokabel-Sets')}
      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <button onClick={()=>setShowNewSet(!showNewSet)} style={{width:'100%',padding:'10px',background:C.white,border:`1.5px solid ${C.tealDark}`,color:C.primary,borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',marginBottom:'1rem'}}>+ Neues Set erstellen</button>
        {showNewSet&&(
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
            <input value={newSetName} onChange={e=>setNewSetName(e.target.value)} placeholder="Name des Sets" style={{width:'100%',padding:'9px 11px',border:`1.5px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none'}} />
            <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'8px'}}>
              {icons.map(ic=><button key={ic} onClick={()=>setNewSetIcon(ic)} style={{padding:'6px',fontSize:'18px',background:newSetIcon===ic?C.tealLight:C.white,border:`1px solid ${newSetIcon===ic?C.tealDark:C.border}`,borderRadius:'6px',cursor:'pointer'}}>{ic}</button>)}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={createSet} style={{flex:1,padding:'9px',background:C.primary,color:'#fff',border:'none',borderRadius:'7px',cursor:'pointer',fontWeight:600}}>Erstellen</button>
              <button onClick={()=>setShowNewSet(false)} style={{flex:1,padding:'9px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'7px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
            </div>
          </div>
        )}
        {sets.map(s=>(
          <div key={s.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'8px',padding:'12px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'12px'}}>
            <div onClick={()=>{setActiveSet(s);setView('cards');loadCards(s.id)}} style={{display:'flex',alignItems:'center',gap:'10px',flex:1,cursor:'pointer'}}>
              <span style={{fontSize:'22px'}}>{s.icon||'📝'}</span>
              <div><div style={{fontWeight:600,color:C.text}}>{s.name}</div>{s.description&&<div style={{fontSize:'12px',color:C.text2}}>{s.description}</div>}</div>
            </div>
            <button onClick={()=>setConfirmDelete(s.id)} style={{padding:'4px 8px',background:'none',border:'none',cursor:'pointer',color:'#ccc',fontSize:'13px'}}>✕</button>
          </div>
        ))}
        {sets.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Sets. Erstelle dein erstes Vokabel-Set!</div>}
      </div>
    </div>
  )
}
