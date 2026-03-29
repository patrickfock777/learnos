'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { LernText, Folder } from '@/lib/types'

type View = 'list' | 'read' | 'new' | 'edit'
type AiLang = 'improve_en' | 'de_to_en' | 'en_to_de'
type AiLength = 'shorter' | 'same' | 'longer'

const C = {
  primary:'#1a3a4a', teal:'#ADD8E6', tealDark:'#7BB8CC', tealLight:'#E8F6FA',
  accent:'#2a6478', sand:'#f7f4f0', text:'#1a2c35', text2:'#5a7280', border:'#dde8ec',
  danger:'#e24b4a', dangerLight:'#fef0f0', white:'#fff', bg:'#edf4f7'
}

const topbar = (onBack:()=>void, title:string, right?:React.ReactNode) => (
  <div style={{background:C.primary,padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',maxWidth:'600px',margin:'0 auto'}}>
    <button onClick={onBack} style={{background:'none',border:'none',color:C.teal,fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
    <span style={{color:'#fff',fontSize:'15px',fontWeight:700,flex:1}}>{title}</span>
    {right}
  </div>
)

export default function LibraryPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [view, setView] = useState<View>('list')
  const [texts, setTexts] = useState<LernText[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [activeText, setActiveText] = useState<LernText | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editFolderField, setEditFolderField] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{id:string,type:'text'|'folder',name:string}|null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [editFolderIcon, setEditFolderIcon] = useState('📁')
  const [showAiOptions, setShowAiOptions] = useState(false)
  const [aiLang, setAiLang] = useState<AiLang>('improve_en')
  const [aiLength, setAiLength] = useState<AiLength>('same')
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [dragFolderId, setDragFolderId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [addingFolderUnder, setAddingFolderUnder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderIcon, setNewFolderIcon] = useState('📁')
  const folderIcons = ['📁','📚','💼','✈️','🎯','🌍','🏥','💻','⭐','📝','📡','🛒']

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id); loadData(data.user.id)
    })
  },[router])

  async function loadData(uid:string) {
    const {data:profile} = await supabase.from('profiles').select('workspace_id').eq('id',uid).single()
    const wid = profile?.workspace_id; setWorkspaceId(wid||'')
    const [{data:t},{data:f}] = await Promise.all([
      supabase.from('texts').select('*').eq('workspace_id',wid).order('created_at',{ascending:false}),
      supabase.from('folders').select('*').eq('workspace_id',wid).order('name')
    ])
    setTexts(t||[]); setFolders(f||[])
  }

  async function saveText() {
    if (!title.trim()||!content.trim()||!userId) return
    if (view==='edit'&&activeText) {
      await supabase.from('texts').update({title,content,folder_id:editFolderField}).eq('id',activeText.id)
      setActiveText(prev=>prev?{...prev,title,content,folder_id:editFolderField}:null)
    } else {
      await supabase.from('texts').insert({title,content,folder_id:activeFolder,workspace_id:workspaceId,created_by:userId,language:'en',questions:[],vocabulary:[]})
    }
    setTitle('');setContent('');setView('list');loadData(userId)
  }

  async function deleteText(id:string) {
    await supabase.from('texts').delete().eq('id',id)
    setConfirmDelete(null);setView('list');loadData(userId)
  }

  async function deleteFolder(id:string) {
    // Move all children to parent
    const folder = folders.find(f=>f.id===id)
    const children = folders.filter(f=>f.parent_id===id)
    for (const child of children) {
      await supabase.from('folders').update({parent_id:folder?.parent_id||null}).eq('id',child.id)
    }
    await supabase.from('texts').update({folder_id:folder?.parent_id||null}).eq('folder_id',id)
    await supabase.from('folders').delete().eq('id',id)
    setConfirmDelete(null)
    if (activeFolder===id) setActiveFolder(null)
    loadData(userId)
  }

  async function createFolder(parentId:string|null) {
    if (!newFolderName.trim()||!workspaceId) return
    await supabase.from('folders').insert({name:newFolderName,icon:newFolderIcon,workspace_id:workspaceId,color:C.tealLight,parent_id:parentId})
    setNewFolderName('');setNewFolderIcon('📁');setAddingFolderUnder(null);loadData(userId)
    if (parentId) setExpandedFolders(prev=>new Set([...prev,parentId]))
  }

  async function renameFolder() {
    if (!editingFolder||!editFolderName.trim()) return
    await supabase.from('folders').update({name:editFolderName,icon:editFolderIcon}).eq('id',editingFolder)
    setEditingFolder(null);setEditFolderName('');loadData(userId)
  }

  async function handleFolderDrop(targetId:string|null) {
    if (!dragFolderId||dragFolderId===targetId) { setDragFolderId(null);setDragOverId(null);return }
    // Prevent dropping into own child
    const isChild = (checkId:string):boolean => {
      const children = folders.filter(f=>f.parent_id===checkId)
      return children.some(c=>c.id===targetId||isChild(c.id))
    }
    if (targetId&&isChild(dragFolderId)) { setDragFolderId(null);setDragOverId(null);return }
    await supabase.from('folders').update({parent_id:targetId}).eq('id',dragFolderId)
    setDragFolderId(null);setDragOverId(null)
    if (targetId) setExpandedFolders(prev=>new Set([...prev,targetId]))
    loadData(userId)
  }

  async function aiAction() {
    if (!activeText) return
    setAiLoading(true);setAiResult(null)
    try {
      const langPrompts = {
        improve_en:`Improve this English text to professional Business English. ${aiLength==='shorter'?'Make it about 30% shorter.':aiLength==='longer'?'Make it about 30% longer.':'Keep the same length.'}`,
        de_to_en:`Translate this German text to professional Business English. ${aiLength==='shorter'?'Make it shorter.':aiLength==='longer'?'Make it longer.':'Keep the same length.'}`,
        en_to_de:`Translate this English text to professional German. ${aiLength==='shorter'?'Mache es kürzer.':aiLength==='longer'?'Mache es länger.':'Gleiche Länge.'}`
      }
      const res = await fetch('/api/improve-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:activeText.content,mode:'custom',prompt:langPrompts[aiLang]})})
      const {result} = await res.json()
      setAiResult(result);setShowAiOptions(false)
    } catch { alert('KI nicht verfügbar.') }
    setAiLoading(false)
  }

  async function acceptAiResult() {
    if (!activeText||!aiResult) return
    const field = aiLang==='en_to_de'?'content_translated':'content_improved'
    await supabase.from('texts').update({[field]:aiResult}).eq('id',activeText.id)
    setActiveText(prev=>prev?{...prev,[field]:aiResult}:null)
    setAiResult(null)
  }

  function speak(text:string) {
    if (speaking){window.speechSynthesis.cancel();setSpeaking(false);return}
    const u=new SpeechSynthesisUtterance(text)
    u.lang=aiLang==='en_to_de'?'de-DE':'en-GB';u.rate=0.9
    u.onend=()=>setSpeaking(false)
    setSpeaking(true);window.speechSynthesis.speak(u)
  }

  function openEdit() {
    if (!activeText) return
    setTitle(activeText.title);setContent(activeText.content)
    setEditFolderField(activeText.folder_id||null);setView('edit')
  }

  function toggleFolder(id:string) {
    setExpandedFolders(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  }

  const getChildren = (parentId:string|null) => folders.filter(f=>f.parent_id===parentId)

  const AddFolderInline = ({parentId}:{parentId:string|null}) => (
    <div style={{padding:'6px 8px',background:C.tealLight,borderRadius:'6px',margin:'4px 0'}}>
      <input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createFolder(parentId)} placeholder="Ordner-Name..." autoFocus style={{width:'100%',padding:'4px 7px',border:`1px solid ${C.tealDark}`,borderRadius:'4px',fontSize:'12px',marginBottom:'5px',background:C.white,outline:'none'}} />
      <div style={{display:'flex',gap:'3px',flexWrap:'wrap',marginBottom:'5px'}}>
        {folderIcons.map(ic=><button key={ic} onClick={()=>setNewFolderIcon(ic)} style={{padding:'2px 4px',fontSize:'13px',background:newFolderIcon===ic?C.teal:'none',border:'none',borderRadius:'3px',cursor:'pointer'}}>{ic}</button>)}
      </div>
      <div style={{display:'flex',gap:'5px'}}>
        <button onClick={()=>createFolder(parentId)} style={{flex:1,padding:'4px',background:C.primary,color:'#fff',border:'none',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontWeight:600}}>Erstellen</button>
        <button onClick={()=>{setAddingFolderUnder(null);setNewFolderName('');setNewFolderIcon('📁')}} style={{flex:1,padding:'4px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
      </div>
    </div>
  )

  const FolderRow = ({f,depth=0}:{f:Folder,depth?:number}) => {
    const children = getChildren(f.id)
    const isExpanded = expandedFolders.has(f.id)
    const isActive = activeFolder===f.id
    const isEditing = editingFolder===f.id
    const isDragOver = dragOverId===f.id
    const textCount = texts.filter(t=>t.folder_id===f.id).length

    return (
      <div
        onDragOver={e=>{e.preventDefault();setDragOverId(f.id)}}
        onDrop={()=>handleFolderDrop(f.id)}
        onDragLeave={()=>setDragOverId(null)}
        style={{background:isDragOver?C.tealLight:'none',borderRadius:'4px',transition:'background 0.1s'}}
      >
        {isEditing ? (
          <div style={{padding:'5px 8px',paddingLeft:`${8+depth*14}px`,background:C.tealLight}}>
            <input value={editFolderName} onChange={e=>setEditFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&renameFolder()} autoFocus style={{width:'100%',padding:'4px 6px',border:`1px solid ${C.tealDark}`,borderRadius:'4px',fontSize:'11px',marginBottom:'4px',background:C.white,outline:'none'}} />
            <div style={{display:'flex',gap:'3px',flexWrap:'wrap',marginBottom:'4px'}}>
              {folderIcons.map(ic=><button key={ic} onClick={()=>setEditFolderIcon(ic)} style={{padding:'2px',fontSize:'12px',background:editFolderIcon===ic?C.teal:'none',border:'none',borderRadius:'3px',cursor:'pointer'}}>{ic}</button>)}
            </div>
            <div style={{display:'flex',gap:'4px'}}>
              <button onClick={renameFolder} style={{flex:1,padding:'3px',background:C.primary,color:'#fff',border:'none',borderRadius:'3px',fontSize:'10px',cursor:'pointer',fontWeight:600}}>OK</button>
              <button onClick={()=>setEditingFolder(null)} style={{flex:1,padding:'3px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'3px',fontSize:'10px',cursor:'pointer',color:C.text2}}>Abbruch</button>
            </div>
          </div>
        ) : (
          <div
            draggable
            onDragStart={()=>setDragFolderId(f.id)}
            onDragEnd={()=>{setDragFolderId(null);setDragOverId(null)}}
            style={{paddingLeft:`${6+depth*14}px`,paddingRight:'4px',paddingTop:'5px',paddingBottom:'5px',display:'flex',alignItems:'center',gap:'3px',cursor:'pointer',color:isActive?C.primary:C.text2,background:isActive?C.tealLight:'none',borderLeft:`2px solid ${isActive?C.tealDark:'transparent'}`,fontSize:'12px',fontWeight:isActive?600:400}}
          >
            <span onClick={()=>children.length>0&&toggleFolder(f.id)} style={{fontSize:'9px',color:'#bbb',width:'10px',flexShrink:0,cursor:children.length>0?'pointer':'default'}}>
              {children.length>0?(isExpanded?'▾':'›'):''}
            </span>
            <span onClick={()=>setActiveFolder(f.id)} style={{fontSize:'13px'}}>{f.icon}</span>
            <span onClick={()=>setActiveFolder(f.id)} style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
            {textCount>0&&<span style={{fontSize:'9px',color:'#bbb'}}>{textCount}</span>}
            <div style={{display:'flex',gap:'1px',opacity:0.6}}>
              <button onClick={e=>{e.stopPropagation();setAddingFolderUnder(addingFolderUnder===f.id?null:f.id);setNewFolderName('');if(!expandedFolders.has(f.id))toggleFolder(f.id)}} title="Unterordner erstellen" style={{background:'none',border:'none',cursor:'pointer',fontSize:'10px',color:C.tealDark,padding:'1px 2px',lineHeight:1}}>+</button>
              <button onClick={e=>{e.stopPropagation();setEditingFolder(f.id);setEditFolderName(f.name);setEditFolderIcon(f.icon||'📁')}} title="Umbenennen" style={{background:'none',border:'none',cursor:'pointer',fontSize:'10px',color:'#888',padding:'1px 2px',lineHeight:1}}>✏</button>
              <button onClick={e=>{e.stopPropagation();setConfirmDelete({id:f.id,type:'folder',name:f.name})}} title="Löschen" style={{background:'none',border:'none',cursor:'pointer',fontSize:'10px',color:'#bbb',padding:'1px 2px',lineHeight:1}}>✕</button>
            </div>
          </div>
        )}
        {addingFolderUnder===f.id&&(
          <div style={{paddingLeft:`${14+depth*14}px`,paddingRight:'6px'}}>
            <AddFolderInline parentId={f.id}/>
          </div>
        )}
        {isExpanded&&children.map(child=><FolderRow key={child.id} f={child} depth={depth+1}/>)}
      </div>
    )
  }

  const filtered = texts.filter(t=>!activeFolder||t.folder_id===activeFolder)

  const ConfirmModal = () => (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'1rem'}}>
      <div style={{background:C.white,borderRadius:'14px',padding:'1.5rem',maxWidth:'320px',width:'100%'}}>
        <div style={{fontWeight:700,fontSize:'16px',marginBottom:'6px',color:C.text}}>Wirklich löschen?</div>
        <div style={{fontSize:'14px',color:C.text2,marginBottom:'6px'}}>„{confirmDelete?.name}"</div>
        {confirmDelete?.type==='folder'&&<div style={{fontSize:'12px',color:C.text2,marginBottom:'1rem',background:C.tealLight,padding:'8px',borderRadius:'6px'}}>Unterordner werden in den übergeordneten Ordner verschoben. Texte bleiben erhalten.</div>}
        {confirmDelete?.type==='text'&&<div style={{marginBottom:'1rem'}}></div>}
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={()=>confirmDelete?.type==='folder'?deleteFolder(confirmDelete.id):deleteText(confirmDelete!.id)} style={{flex:1,padding:'10px',background:C.danger,color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:600}}>Löschen</button>
          <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:'10px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'8px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  const AiOptionsPanel = () => (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'12px',marginBottom:'1rem'}}>
      <div style={{fontSize:'11px',fontWeight:700,color:C.primary,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>KI-Optionen</div>
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'11px',color:C.text2,marginBottom:'5px',fontWeight:600}}>Sprache / Modus</div>
        {([['improve_en','🇬🇧 Englisch verbessern'],['de_to_en','🇩🇪→🇬🇧 Deutsch → Englisch'],['en_to_de','🇬🇧→🇩🇪 Englisch → Deutsch']] as [AiLang,string][]).map(([val,label])=>(
          <label key={val} style={{display:'flex',alignItems:'center',gap:'7px',cursor:'pointer',fontSize:'13px',color:C.text,marginBottom:'4px'}}>
            <input type="radio" checked={aiLang===val} onChange={()=>setAiLang(val)} style={{accentColor:C.primary}} />
            {label}
          </label>
        ))}
      </div>
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'11px',color:C.text2,marginBottom:'5px',fontWeight:600}}>Länge</div>
        <div style={{display:'flex',gap:'6px'}}>
          {([['shorter','Kürzer'],['same','Gleich'],['longer','Länger']] as [AiLength,string][]).map(([val,label])=>(
            <button key={val} onClick={()=>setAiLength(val)} style={{flex:1,padding:'6px',border:`1.5px solid ${aiLength===val?C.tealDark:C.border}`,background:aiLength===val?C.tealLight:C.white,borderRadius:'6px',fontSize:'12px',cursor:'pointer',color:aiLength===val?C.primary:C.text2,fontWeight:aiLength===val?600:400}}>{label}</button>
          ))}
        </div>
      </div>
      <button onClick={aiAction} disabled={aiLoading} style={{width:'100%',padding:'9px',background:C.primary,color:'#fff',border:'none',borderRadius:'7px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:aiLoading?0.7:1}}>
        {aiLoading?'KI arbeitet...':'✨ Ausführen'}
      </button>
    </div>
  )

  if (view==='read'&&activeText) return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&<ConfirmModal/>}
      {topbar(()=>{setView('list');window.speechSynthesis?.cancel();setSpeaking(false);setShowAiOptions(false);setAiResult(null)},activeText.title,
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={openEdit} style={{padding:'5px 10px',background:C.tealLight,border:`1px solid ${C.tealDark}`,borderRadius:'6px',fontSize:'12px',cursor:'pointer',color:C.primary,fontWeight:600}}>Bearbeiten</button>
          <button onClick={()=>setConfirmDelete({id:activeText.id,type:'text',name:activeText.title})} style={{padding:'5px 10px',background:C.dangerLight,border:`1px solid ${C.danger}`,borderRadius:'6px',fontSize:'12px',cursor:'pointer',color:C.danger,fontWeight:600}}>Löschen</button>
        </div>
      )}
      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <div style={{display:'flex',gap:'8px',marginBottom:'1rem',flexWrap:'wrap' as const}}>
          <button onClick={()=>speak(activeText.content)} style={{padding:'7px 14px',background:speaking?C.teal:C.white,border:`1.5px solid ${speaking?C.tealDark:C.border}`,borderRadius:'7px',fontSize:'13px',cursor:'pointer',color:speaking?C.primary:C.text,fontWeight:500}}>{speaking?'⏸ Stop':'▶ Vorlesen'}</button>
          <button onClick={()=>{setShowAiOptions(!showAiOptions);setAiResult(null)}} style={{padding:'7px 14px',background:showAiOptions?C.tealLight:C.white,border:`1.5px solid ${showAiOptions?C.tealDark:C.border}`,borderRadius:'7px',fontSize:'13px',cursor:'pointer',color:showAiOptions?C.primary:C.text,fontWeight:500}}>✨ KI-Optionen</button>
        </div>
        {showAiOptions&&<AiOptionsPanel/>}
        {aiResult&&(
          <div style={{background:C.tealLight,border:`1.5px solid ${C.tealDark}`,borderRadius:'10px',padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'11px',color:C.accent,fontWeight:700,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>KI-Ergebnis — Freigabe erforderlich</div>
            <p style={{fontSize:'15px',lineHeight:'1.8',color:C.primary,whiteSpace:'pre-wrap',marginBottom:'12px'}}>{aiResult}</p>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={acceptAiResult} style={{flex:1,padding:'9px',background:C.primary,color:'#fff',border:'none',borderRadius:'7px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>✓ Übernehmen</button>
              <button onClick={()=>setAiResult(null)} style={{flex:1,padding:'9px',background:C.sand,border:`1px solid ${C.border}`,borderRadius:'7px',fontSize:'13px',cursor:'pointer',color:C.text2}}>✕ Verwerfen</button>
            </div>
          </div>
        )}
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:'10px',padding:'1.25rem',marginBottom:'1rem'}}>
          <p style={{fontSize:'15px',lineHeight:'1.8',whiteSpace:'pre-wrap',color:C.text}}>{activeText.content}</p>
        </div>
        {activeText.content_improved&&(
          <div style={{background:'#f0faf0',border:'1.5px solid #90EE90',borderRadius:'10px',padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'11px',color:'#3a8a3a',fontWeight:700,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Verbesserte Version</div>
            <p style={{fontSize:'15px',lineHeight:'1.8',color:'#1a3a1a',whiteSpace:'pre-wrap'}}>{activeText.content_improved}</p>
          </div>
        )}
        {activeText.content_translated&&(
          <div style={{background:C.tealLight,border:`1.5px solid ${C.tealDark}`,borderRadius:'10px',padding:'1.25rem'}}>
            <div style={{fontSize:'11px',color:C.accent,fontWeight:700,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Übersetzung</div>
            <p style={{fontSize:'15px',lineHeight:'1.8',color:C.primary,whiteSpace:'pre-wrap'}}>{activeText.content_translated}</p>
          </div>
        )}
      </div>
    </div>
  )

  if (view==='new'||view==='edit') return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {topbar(()=>setView(view==='edit'?'read':'list'),view==='edit'?'Text bearbeiten':'Neuer Text')}
      <div style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titel" style={{width:'100%',padding:'9px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',marginBottom:'8px',background:C.sand,outline:'none'}} />
        <select value={(view==='edit'?editFolderField:activeFolder)||''} onChange={e=>view==='edit'?setEditFolderField(e.target.value||null):setActiveFolder(e.target.value||null)} style={{width:'100%',padding:'9px 12px',border:`1.5px solid ${C.border}`,borderRadius:'8px',fontSize:'14px',marginBottom:'8px',color:C.text,background:C.sand}}>
          <option value="">Kein Ordner</option>
          {folders.map(f=><option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
        </select>
        <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Text eingeben..." rows={12} style={{width:'100%',padding:'12px',border:`1.5px solid ${C.border}`,borderRadius:'10px',fontSize:'15px',lineHeight:'1.7',resize:'vertical' as const,marginBottom:'8px',background:C.sand,outline:'none'}} />
        <button onClick={saveText} disabled={!title.trim()||!content.trim()} style={{width:'100%',padding:'12px',background:C.primary,color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
          {view==='edit'?'Änderungen speichern':'Speichern'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&<ConfirmModal/>}
      {topbar(()=>router.push('/dashboard'),'📖 Bibliothek',
        <button onClick={()=>setView('new')} style={{padding:'6px 12px',background:C.teal,color:C.primary,border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:700,cursor:'pointer'}}>+ Text</button>
      )}
      <div style={{maxWidth:'600px',margin:'0 auto',display:'flex',height:'calc(100vh - 50px)'}}>
        {/* Sidebar */}
        <div style={{width:'150px',background:C.sand,borderRight:`1px solid ${C.border}`,overflowY:'auto',flexShrink:0}}>
          <div style={{padding:'8px 10px 4px',fontSize:'9px',fontWeight:700,color:'#bbb',letterSpacing:'0.07em',textTransform:'uppercase' as const,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            Ordner
            <button onClick={()=>setAddingFolderUnder(addingFolderUnder==='root'?null:'root')} style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:C.tealDark,fontWeight:700,padding:0}} title="Neuer Root-Ordner">+</button>
          </div>
          {addingFolderUnder==='root'&&<div style={{padding:'0 8px 6px'}}><AddFolderInline parentId={null}/></div>}

          {/* Alle Texte */}
          <div
            onDragOver={e=>{e.preventDefault();setDragOverId('root')}}
            onDrop={()=>handleFolderDrop(null)}
            onDragLeave={()=>setDragOverId(null)}
            onClick={()=>setActiveFolder(null)}
            style={{padding:'5px 8px 5px 10px',fontSize:'12px',cursor:'pointer',color:!activeFolder?C.primary:C.text2,background:!activeFolder?C.tealLight:dragOverId==='root'?'#e0f0e0':'none',borderLeft:`2px solid ${!activeFolder?C.tealDark:'transparent'}`,display:'flex',alignItems:'center',gap:'5px',fontWeight:!activeFolder?600:400}}
          >
            <span>📁</span><span style={{flex:1}}>Alle</span><span style={{fontSize:'9px',color:'#aaa'}}>{texts.length}</span>
          </div>

          {/* Folder tree */}
          {getChildren(null).map(f=><FolderRow key={f.id} f={f} depth={0}/>)}
        </div>

        {/* Main content */}
        <div style={{flex:1,overflowY:'auto',padding:'10px'}}>
          {filtered.map(t=>(
            <div key={t.id} onClick={()=>{setActiveText(t);setView('read')}} style={{display:'flex',alignItems:'flex-start',gap:'8px',padding:'10px',border:`1px solid ${C.border}`,borderRadius:'8px',marginBottom:'6px',background:C.white,cursor:'pointer'}}>
              <div style={{width:'6px',height:'6px',borderRadius:'50%',background:C.tealDark,marginTop:'6px',flexShrink:0}}></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'13px',fontWeight:600,color:C.text}}>{t.title}</div>
                <div style={{fontSize:'11px',color:'#888',marginTop:'2px',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{t.content}</div>
                <div style={{fontSize:'10px',color:'#bbb',marginTop:'3px',display:'flex',gap:'6px'}}>
                  <span>{new Date(t.created_at).toLocaleDateString('de-AT')}</span>
                  {t.content_improved&&<span style={{color:'#5ab85a',fontWeight:600}}>verbessert</span>}
                  {t.content_translated&&<span style={{color:C.accent,fontWeight:600}}>übersetzt</span>}
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();setConfirmDelete({id:t.id,type:'text',name:t.title})}} style={{padding:'3px 7px',background:'none',border:'none',cursor:'pointer',color:'#ccc',fontSize:'12px',flexShrink:0}}>✕</button>
            </div>
          ))}
          {filtered.length===0&&<div style={{textAlign:'center',padding:'2rem',color:C.text2,fontSize:'14px'}}>Noch keine Texte in diesem Ordner.</div>}
        </div>
      </div>
    </div>
  )
}
