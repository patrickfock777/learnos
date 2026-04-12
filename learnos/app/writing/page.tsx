'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { WritingSession } from '@/lib/types'
import BottomNav from '@/app/components/BottomNav'

const C = { primary:'#00e5c8',teal:'#00e5c8',tealDark:'#00b8a0',tealLight:'rgba(0,229,200,0.15)',sand:'#141a2e',text:'#e8ecf4',text2:'#8892a8',border:'#2a3050',danger:'#ef4444',dangerLight:'rgba(239,68,68,0.15)',white:'#141a2e',bg:'#0a0e1a',card2:'#1c2340',border2:'#3a4570',text3:'#5a6478',green:'#4ade80',greenGlow:'rgba(74,222,128,0.15)',violet:'#a855f7',violetGlow:'rgba(168,85,247,0.15)' }

type View = 'history'|'write'|'result'

export default function WritingPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [view, setView] = useState<View>('history')
  const [sessions, setSessions] = useState<WritingSession[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeSession, setActiveSession] = useState<WritingSession|null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id); loadSessions(data.user.id)
    })
  },[router])

  async function loadSessions(uid:string) {
    const {data} = await supabase.from('writing_sessions').select('*').eq('user_id',uid).order('created_at',{ascending:false})
    setSessions(data||[])
  }

  async function submitWriting() {
    if (!text.trim()||!userId) return
    setLoading(true)
    try {
      const res = await fetch('/api/improve-writing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})})
      const result = await res.json()
      const {data} = await supabase.from('writing_sessions').insert({user_id:userId,title:title||`Session ${new Date().toLocaleDateString('de-AT')}`,original_text:text,improved_text:result.improved,feedback:result.feedback,score:result.score}).select().single()
      if (data) {setActiveSession(data);setView('result')}
      loadSessions(userId)
    } catch { alert('KI nicht verfügbar.') }
    setLoading(false)
  }

  const scoreColor=(s:number)=>s>=80?'#4ade80':s>=60?'#a855f7':'#ef4444'
  const scoreBg=(s:number)=>s>=80?'rgba(74,222,128,0.15)':s>=60?'rgba(168,85,247,0.15)':'rgba(239,68,68,0.15)'

  const topbar=(onBack:()=>void,title:string,right?:React.ReactNode)=>(
    <div style={{background:'#111827',borderBottom:'1px solid #2a3050',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:'#00e5c8',fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
      <span style={{color:'#e8ecf4',fontSize:'15px',fontWeight:700,flex:1}}>{title}</span>
      {right}
    </div>
  )

  if (view==='result'&&activeSession) return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {topbar(()=>{setView('history');setText('');setTitle('')},'Ergebnis',
        activeSession.score!==null?<span style={{fontSize:'13px',fontWeight:600,padding:'4px 10px',borderRadius:'20px',background:scoreBg(activeSession.score),color:scoreColor(activeSession.score)}}>{activeSession.score}/100</span>:undefined
      )}
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'1.25rem',marginBottom:'1rem'}}>
          <div style={{fontSize:'11px',color:C.text2,fontWeight:700,marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Dein Original</div>
          <p style={{fontSize:'14px',lineHeight:'1.7',color:C.text2,whiteSpace:'pre-wrap'}}>{activeSession.original_text}</p>
        </div>
        {activeSession.improved_text&&(
          <div style={{background:'rgba(74,222,128,0.15)',border:'1.5px solid #4ade80',borderRadius:'10px',padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'11px',color:'#4ade80',fontWeight:700,marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.05em'}}>KI-Verbesserung</div>
            <p style={{fontSize:'14px',lineHeight:'1.7',color:'#e8ecf4',whiteSpace:'pre-wrap'}}>{activeSession.improved_text}</p>
          </div>
        )}
        {activeSession.feedback&&activeSession.feedback.length>0&&(
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'1.25rem'}}>
            <div style={{fontSize:'11px',color:C.text2,fontWeight:700,marginBottom:'12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Korrekturen ({activeSession.feedback.length})</div>
            {activeSession.feedback.map((f,i)=>(
              <div key={i} style={{borderTop:i>0?`1px solid ${C.border}`:'none',paddingTop:i>0?'10px':0,marginTop:i>0?'10px':0}}>
                <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px',flexWrap:'wrap'}}>
                  <span style={{fontSize:'12px',background:C.dangerLight,color:C.danger,padding:'2px 7px',borderRadius:'4px',fontWeight:600}}>✗ {f.error}</span>
                  <span style={{fontSize:'12px',color:C.text2}}>→</span>
                  <span style={{fontSize:'12px',background:'rgba(74,222,128,0.15)',color:'#4ade80',padding:'2px 7px',borderRadius:'4px',fontWeight:600}}>✓ {f.correction}</span>
                </div>
                <p style={{fontSize:'13px',color:C.text2,lineHeight:'1.5'}}>{f.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )

  if (view==='write') return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {topbar(()=>setView('history'),'Neuer Text')}
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titel (optional)" style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',marginBottom:'8px',background:C.sand,color:C.text,outline:'none'}} />
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Schreibe hier deinen englischen Text..." rows={10} style={{width:'100%',padding:'12px',border:`1.5px solid ${C.border}`,borderRadius:'10px',fontSize:'15px',lineHeight:'1.7',resize:'vertical',marginBottom:'8px',background:C.sand,color:C.text,outline:'none'}} />
        <button onClick={submitWriting} disabled={!text.trim()||loading} style={{width:'100%',padding:'12px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer',opacity:loading?0.7:1}}>
          {loading?'KI analysiert...':'✨ Verbessern & Feedback'}
        </button>
      </div>
      <BottomNav />
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      <div style={{background:'#111827',borderBottom:'1px solid #2a3050',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
        <button onClick={()=>router.push('/learn')} style={{background:'none',border:'none',color:'#00e5c8',fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
        <span style={{color:'#e8ecf4',fontSize:'15px',fontWeight:700,flex:1}}>✍️ Schreib-Trainer</span>
      </div>
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <button onClick={()=>setView('write')} style={{width:'100%',padding:'11px',background:'#00e5c8',color:'#0a0e1a',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer',marginBottom:'1rem'}}>+ Neuen Text schreiben</button>
        <div style={{fontSize:'12px',color:C.text2,marginBottom:'0.75rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Verlauf ({sessions.length})</div>
        {sessions.map(s=>(
          <div key={s.id} onClick={()=>{setActiveSession(s);setView('result')}} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'8px',padding:'12px',marginBottom:'6px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:'10px'}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:'14px',color:C.text,marginBottom:'4px'}}>{s.title}</div>
              <div style={{fontSize:'12px',color:C.text2,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{s.original_text}</div>
              <div style={{fontSize:'11px',color:C.text3,marginTop:'5px'}}>{new Date(s.created_at).toLocaleDateString('de-AT')}</div>
            </div>
            {s.score!==null&&<span style={{fontSize:'13px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:scoreBg(s.score),color:scoreColor(s.score),flexShrink:0}}>{s.score}</span>}
          </div>
        ))}
        {sessions.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Sessions. Schreibe deinen ersten Text!</div>}
      </div>
      <BottomNav />
    </div>
  )
}
