'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { Folder } from '@/lib/types'

const C = {
  primary:'#1a3a4a', teal:'#ADD8E6', tealDark:'#7BB8CC', tealLight:'#E8F6FA',
  accent:'#2a6478', sand:'#f7f4f0', text:'#1a2c35', text2:'#5a7280', border:'#dde8ec',
  danger:'#e24b4a', dangerLight:'#fef0f0', white:'#fff', bg:'#edf4f7'
}

type Step = 'input' | 'loading' | 'preview' | 'saved'

export default function YoutubePage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  const [url, setUrl] = useState('')
  const [language, setLanguage] = useState<'en' | 'de'>('en')
  const [step, setStep] = useState<Step>('input')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{videoId:string,videoTitle:string,suggestedTitle:string,summary:string,transcriptLength:number}|null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string|null>(null)
  const [inputMode, setInputMode] = useState<'url'|'paste'>('url')
  const [pastedTranscript, setPastedTranscript] = useState('')
  const [saving, setSaving] = useState(false)
  const [focus, setFocus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      supabase.from('profiles').select('workspace_id').eq('id', data.user.id).single().then(({data:p}) => {
        if (!p) return
        setWorkspaceId(p.workspace_id)
        supabase.from('folders').select('*').eq('workspace_id', p.workspace_id).order('name').then(({data:f}) => setFolders(f||[]))
      })
    })
  },[router])

  async function summarize() {
    if (inputMode==='url'&&!url.trim()) return
    if (inputMode==='paste'&&!pastedTranscript.trim()) return
    setStep('loading'); setError('')
    try {
      const body = inputMode==='paste'
        ? {transcript: pastedTranscript, language, focus, videoTitle: url.trim()||'YouTube Video'}
        : {url, language, focus}
      const res = await fetch('/api/youtube-summary', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setStep('input'); return }
      setResult(data)
      setEditTitle(data.suggestedTitle)
      setEditSummary(data.summary)
      setStep('preview')
    } catch {
      setError('Verbindungsfehler. Bitte versuche es erneut.')
      setStep('input')
    }
  }

  async function saveToLibrary() {
    if (!editTitle.trim()||!editSummary.trim()||!userId) return
    setSaving(true)
    await supabase.from('texts').insert({
      title: editTitle,
      content: editSummary,
      folder_id: selectedFolder,
      workspace_id: workspaceId,
      created_by: userId,
      language: language,
      questions: [],
      vocabulary: []
    })
    setSaving(false)
    setStep('saved')
  }

  function reset() {
    setUrl(''); setStep('input'); setResult(null)
    setEditTitle(''); setEditSummary(''); setError('')
    setFocus(''); setPastedTranscript('')
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {/* Topbar */}
      <div style={{background:C.primary,padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
        <button onClick={()=>router.push('/dashboard')} style={{background:'none',border:'none',color:C.teal,fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
        <span style={{color:'#fff',fontSize:'15px',fontWeight:700,flex:1}}>▶ YouTube Zusammenfassen</span>
      </div>

      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>

        {/* INPUT STEP */}
        {step==='input'&&(
          <div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'1.25rem',marginBottom:'1rem'}}>
              <div style={{fontSize:'13px',color:C.text2,marginBottom:'12px',lineHeight:'1.6'}}>
                Füge eine YouTube URL ein oder kopiere den Transcript direkt aus YouTube.
              </div>

              {/* Mode toggle */}
              <div style={{display:'flex',gap:'0',marginBottom:'12px',border:`1px solid ${C.border}`,borderRadius:'8px',overflow:'hidden'}}>
                <button onClick={()=>setInputMode('url')} style={{flex:1,padding:'8px',background:inputMode==='url'?C.primary:C.white,color:inputMode==='url'?'#fff':C.text2,border:'none',fontSize:'13px',cursor:'pointer',fontWeight:inputMode==='url'?600:400}}>🔗 YouTube URL</button>
                <button onClick={()=>setInputMode('paste')} style={{flex:1,padding:'8px',background:inputMode==='paste'?C.primary:C.white,color:inputMode==='paste'?'#fff':C.text2,border:'none',fontSize:'13px',cursor:'pointer',fontWeight:inputMode==='paste'?600:400}}>📋 Transcript einfügen</button>
              </div>

              {inputMode==='url'?(
                <>
                  <input
                    value={url}
                    onChange={e=>setUrl(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&summarize()}
                    placeholder="https://www.youtube.com/watch?v=..."
                    style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',marginBottom:'10px',background:C.sand,outline:'none',fontFamily:'monospace'}}
                  />
                  <div style={{fontSize:'12px',color:C.text2,marginBottom:'10px',padding:'8px 10px',background:C.tealLight,borderRadius:'6px',lineHeight:'1.5'}}>
                    ⚠️ Funktioniert nur wenn YouTube den Zugriff erlaubt. Falls nicht, wechsle zu "Transcript einfügen".
                  </div>
                </>
              ):(
                <>
                  <div style={{fontSize:'12px',color:C.text2,marginBottom:'8px',padding:'10px',background:C.tealLight,borderRadius:'8px',lineHeight:'1.6'}}>
                    <strong>So geht's:</strong> YouTube Video öffnen → unter dem Video auf <strong>"..."</strong> klicken → <strong>"Transcript öffnen"</strong> → Text markieren → hier einfügen.
                    <br/><br/>
                    Optional: Videotitel unten eintragen.
                  </div>
                  <input
                    value={url}
                    onChange={e=>setUrl(e.target.value)}
                    placeholder="Videotitel (optional)"
                    style={{width:'100%',padding:'9px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'13px',marginBottom:'8px',background:C.sand,outline:'none'}}
                  />
                  <textarea
                    value={pastedTranscript}
                    onChange={e=>setPastedTranscript(e.target.value)}
                    placeholder="Transcript hier einfügen..."
                    rows={6}
                    style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'13px',marginBottom:'10px',background:C.sand,outline:'none',resize:'vertical' as const,lineHeight:'1.5'}}
                  />
                </>
              )}

              <div style={{marginBottom:'12px'}}>
                <div style={{fontSize:'11px',color:C.text2,marginBottom:'6px',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Zusammenfassung auf</div>
                <div style={{display:'flex',gap:'8px'}}>
                  {([['en','🇬🇧 Englisch'],['de','🇩🇪 Deutsch']] as ['en'|'de',string][]).map(([val,label])=>(
                    <button key={val} onClick={()=>setLanguage(val)} style={{flex:1,padding:'8px',border:`1.5px solid ${language===val?C.tealDark:C.border}`,background:language===val?C.tealLight:C.white,borderRadius:'7px',fontSize:'13px',cursor:'pointer',color:language===val?C.primary:C.text2,fontWeight:language===val?600:400}}>{label}</button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:'12px'}}>
                <div style={{fontSize:'11px',color:C.text2,marginBottom:'4px',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>
                  Fokus <span style={{fontWeight:400,textTransform:'none' as const}}>(optional)</span>
                </div>
                <textarea
                  value={focus}
                  onChange={e=>setFocus(e.target.value)}
                  placeholder={'z.B. "Fokus auf Verkaufsstrategien für DOOH"\noder "Was kann ich bei Grassfish konkret anwenden?"'}
                  rows={2}
                  style={{width:'100%',padding:'9px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'13px',background:C.sand,outline:'none',resize:'none' as const,lineHeight:'1.5',color:C.text}}
                />
              </div>
              {error&&<div style={{padding:'8px 12px',background:C.dangerLight,border:`1px solid ${C.danger}`,borderRadius:'7px',fontSize:'13px',color:C.danger,marginBottom:'10px'}}>{error}</div>}
              <button onClick={summarize} disabled={inputMode==='url'?!url.trim():!pastedTranscript.trim()} style={{width:'100%',padding:'11px',background:(inputMode==='url'?url.trim():pastedTranscript.trim())?C.primary:'#ccc',color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
                ✨ Zusammenfassen
              </button>
            </div>
            <div style={{background:C.tealLight,border:`1px solid ${C.tealDark}`,borderRadius:'10px',padding:'12px',fontSize:'12px',color:C.accent,lineHeight:'1.6'}}>
              <strong>Hinweis:</strong> Das Video benötigt automatische Untertitel (die meisten englischen und deutschen Videos haben diese). Falls keine verfügbar sind, erscheint eine Fehlermeldung.
            </div>
          </div>
        )}

        {/* LOADING STEP */}
        {step==='loading'&&(
          <div style={{textAlign:'center',padding:'3rem 1rem'}}>
            <div style={{fontSize:'40px',marginBottom:'1rem'}}>⏳</div>
            <div style={{fontSize:'16px',fontWeight:600,color:C.primary,marginBottom:'8px'}}>KI liest das Video...</div>
            <div style={{fontSize:'13px',color:C.text2}}>Untertitel werden geladen und zusammengefasst.</div>
            <div style={{marginTop:'1.5rem',height:'4px',background:C.border,borderRadius:'2px',overflow:'hidden'}}>
              <div style={{height:'100%',background:C.tealDark,borderRadius:'2px',width:'60%',animation:'progress 2s ease-in-out infinite'}}></div>
            </div>
            <style>{`@keyframes progress{0%{width:10%}50%{width:80%}100%{width:10%}}`}</style>
          </div>
        )}

        {/* PREVIEW STEP */}
        {step==='preview'&&result&&(
          <div>
            {/* Video info */}
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem',display:'flex',gap:'10px',alignItems:'center'}}>
              <img src={`https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`} alt="" style={{width:'80px',height:'45px',borderRadius:'6px',objectFit:'cover',flexShrink:0}} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'12px',fontWeight:600,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{result.videoTitle}</div>
                <div style={{fontSize:'11px',color:C.text2,marginTop:'2px'}}>~{Math.round(result.transcriptLength/5)} Wörter transkribiert</div>
              </div>
            </div>

            {/* Editable title */}
            <div style={{marginBottom:'8px'}}>
              <div style={{fontSize:'11px',color:C.text2,marginBottom:'4px',fontWeight:600}}>Titel</div>
              <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} style={{width:'100%',padding:'9px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',background:C.sand,outline:'none',fontWeight:600}} />
            </div>

            {/* Editable summary */}
            <div style={{marginBottom:'10px'}}>
              <div style={{fontSize:'11px',color:C.text2,marginBottom:'4px',fontWeight:600}}>Zusammenfassung <span style={{fontWeight:400}}>(kannst du bearbeiten)</span></div>
              <textarea value={editSummary} onChange={e=>setEditSummary(e.target.value)} rows={12} style={{width:'100%',padding:'12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',lineHeight:'1.7',resize:'vertical' as const,background:C.sand,outline:'none'}} />
            </div>

            {/* Folder selection */}
            <div style={{marginBottom:'12px'}}>
              <div style={{fontSize:'11px',color:C.text2,marginBottom:'4px',fontWeight:600}}>In Ordner speichern</div>
              <select value={selectedFolder||''} onChange={e=>setSelectedFolder(e.target.value||null)} style={{width:'100%',padding:'9px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',color:C.text,background:C.sand}}>
                <option value="">Kein Ordner</option>
                {folders.map(f=><option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
              </select>
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={saveToLibrary} disabled={saving||!editTitle.trim()} style={{flex:2,padding:'12px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer',opacity:saving?0.7:1}}>
                {saving?'Wird gespeichert...':'✓ In Bibliothek speichern'}
              </button>
              <button onClick={reset} style={{flex:1,padding:'12px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',cursor:'pointer',color:C.text2}}>
                Neu starten
              </button>
            </div>
          </div>
        )}

        {/* SAVED STEP */}
        {step==='saved'&&(
          <div style={{textAlign:'center',padding:'3rem 1rem'}}>
            <div style={{fontSize:'48px',marginBottom:'1rem'}}>✅</div>
            <div style={{fontSize:'18px',fontWeight:700,color:C.primary,marginBottom:'8px'}}>Gespeichert!</div>
            <div style={{fontSize:'14px',color:C.text2,marginBottom:'2rem'}}>Die Zusammenfassung wurde in deine Bibliothek hinzugefügt.</div>
            <div style={{display:'flex',gap:'8px',justifyContent:'center'}}>
              <button onClick={()=>router.push('/library')} style={{padding:'11px 20px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Zur Bibliothek</button>
              <button onClick={reset} style={{padding:'11px 20px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',cursor:'pointer',color:C.text2}}>Weiteres Video</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
