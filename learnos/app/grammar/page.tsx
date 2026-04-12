'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { GrammarSentence } from '@/lib/types'
import BottomNav from '@/app/components/BottomNav'

const C = { primary:'#00e5c8',teal:'#00e5c8',tealDark:'#00b8a0',tealLight:'rgba(0,229,200,0.15)',sand:'#141a2e',text:'#e8ecf4',text2:'#8892a8',border:'#2a3050',danger:'#ef4444',dangerLight:'rgba(239,68,68,0.15)',white:'#141a2e',bg:'#0a0e1a',card2:'#1c2340',border2:'#3a4570',text3:'#5a6478',green:'#4ade80',greenGlow:'rgba(74,222,128,0.15)',violet:'#a855f7' }

const TENSES = [
  {id:'simple_present',label:'Simple Present'},{id:'present_continuous',label:'Present Continuous'},
  {id:'simple_past',label:'Simple Past'},{id:'present_perfect',label:'Present Perfect'},
  {id:'past_continuous',label:'Past Continuous'},{id:'past_perfect',label:'Past Perfect'},
  {id:'will_future',label:'Will Future'},{id:'going_to_future',label:'Going to Future'},
]

export default function GrammarPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [sentences, setSentences] = useState<GrammarSentence[]>([])
  const [current, setCurrent] = useState<GrammarSentence|null>(null)
  const [selected, setSelected] = useState<string|null>(null)
  const [result, setResult] = useState<'correct'|'wrong'|null>(null)
  const [stats, setStats] = useState({correct:0,wrong:0,total:0})
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id); loadSentences(data.user.id)
    })
  },[router])

  async function loadSentences(uid:string) {
    setLoading(true)
    const {data:p} = await supabase.from('profiles').select('workspace_id').eq('id',uid).single()
    const {data} = await supabase.from('grammar_sentences').select('*').eq('workspace_id',p?.workspace_id||'').order('created_at',{ascending:false})
    const list=data||[]; setSentences(list)
    if (list.length>0) setCurrent(list[Math.floor(Math.random()*list.length)])
    setLoading(false)
  }

  async function generateMore() {
    if (!userId) return; setGenerating(true)
    try {
      const {data:p} = await supabase.from('profiles').select('workspace_id').eq('id',userId).single()
      const res = await fetch('/api/generate-grammar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tense:'mixed',difficulty:2})})
      const generated:GrammarSentence[] = await res.json()
      await supabase.from('grammar_sentences').insert(generated.map((s:GrammarSentence)=>({...s,workspace_id:p?.workspace_id,id:undefined})))
      loadSentences(userId)
    } catch { alert('KI nicht verfügbar.') }
    setGenerating(false)
  }

  function answer(tense:string) {
    if (result!==null||!current) return
    setSelected(tense)
    const ok=tense===current.tense
    setResult(ok?'correct':'wrong')
    setStats(prev=>({correct:prev.correct+(ok?1:0),wrong:prev.wrong+(ok?0:1),total:prev.total+1}))
    if (userId) supabase.from('grammar_progress').insert({user_id:userId,sentence_id:current.id,answered_tense:tense,was_correct:ok,answered_at:new Date().toISOString()})
  }

  function next() {
    const pool=sentences.filter(s=>s.id!==current?.id)
    if (pool.length===0) return
    setCurrent(pool[Math.floor(Math.random()*pool.length)])
    setSelected(null);setResult(null)
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      <div style={{background:'#111827',borderBottom:'1px solid #2a3050',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
        <button onClick={()=>router.push('/learn')} style={{background:'none',border:'none',color:'#00e5c8',fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
        <span style={{color:'#e8ecf4',fontSize:'15px',fontWeight:700,flex:1}}>🎯 Grammatik-Trainer</span>
        {stats.total>0&&<span style={{fontSize:'12px',color:'#00e5c8',fontWeight:600}}>{stats.correct}/{stats.total}</span>}
      </div>
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        {sentences.length===0&&!loading&&(
          <div style={{textAlign:'center',padding:'3rem 1rem'}}>
            <div style={{fontSize:'48px',marginBottom:'1rem'}}>🎯</div>
            <p style={{color:C.text2,marginBottom:'1.5rem',fontSize:'15px'}}>Noch keine Sätze — lass die KI Übungssätze generieren!</p>
            <button onClick={generateMore} disabled={generating} style={{padding:'12px 28px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
              {generating?'⏳ Generiere...':'✨ Sätze generieren'}
            </button>
          </div>
        )}
        {current&&(
          <div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'1.5rem',textAlign:'center',marginBottom:'1rem'}}>
              <div style={{fontSize:'12px',color:C.text2,marginBottom:'8px',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Welche Zeitform?</div>
              <div style={{fontSize:'19px',fontWeight:600,fontStyle:'italic',lineHeight:'1.5',color:'#00e5c8'}}>"{current.sentence}"</div>
              {current.signal_words?.length>0&&<div style={{fontSize:'12px',color:'#00b8a0',marginTop:'8px',fontWeight:500}}>Signalwörter: {current.signal_words.join(', ')}</div>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'1rem'}}>
              {TENSES.map(t=>{
                let bg=C.white,border=C.border,color=C.text,fw:number=400
                if (selected===t.id) { if(result==='correct'){bg='rgba(74,222,128,0.15)';border='#4ade80';color='#4ade80';fw=600} else {bg=C.dangerLight;border=C.danger;color=C.danger;fw=600} }
                else if (result!==null&&t.id===current.tense) {bg='rgba(74,222,128,0.15)';border='#4ade80';color='#4ade80';fw=600}
                return <button key={t.id} onClick={()=>answer(t.id)} disabled={result!==null} style={{padding:'11px 8px',background:bg,border:`1.5px solid ${border}`,borderRadius:'8px',fontSize:'13px',color,cursor:result!==null?'default':'pointer',fontWeight:fw}}>{t.label}</button>
              })}
            </div>
            {result&&(
              <div style={{background:result==='correct'?'rgba(74,222,128,0.15)':C.dangerLight,border:`1.5px solid ${result==='correct'?'#4ade80':C.danger}`,borderRadius:'10px',padding:'1rem',marginBottom:'1rem'}}>
                <div style={{fontWeight:700,marginBottom:'4px',color:result==='correct'?'#4ade80':C.danger}}>
                  {result==='correct'?'✓ Richtig!':`✗ Es ist: ${TENSES.find(t=>t.id===current.tense)?.label}`}
                </div>
                <p style={{fontSize:'13px',lineHeight:'1.5',color:result==='correct'?'#e8ecf4':C.danger}}>{current.explanation}</p>
              </div>
            )}
            {result&&<button onClick={next} style={{width:'100%',padding:'12px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Nächster Satz →</button>}
          </div>
        )}
        {sentences.length>0&&(
          <button onClick={generateMore} disabled={generating} style={{width:'100%',padding:'10px',background:C.white,border:`1px solid ${C.border}`,color:C.text2,borderRadius:'8px',fontSize:'13px',cursor:'pointer',marginTop:'1rem'}}>
            {generating?'⏳ Generiere...':'+ Neue Sätze generieren (KI)'}
          </button>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
