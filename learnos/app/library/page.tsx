'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { LernText, Folder } from '@/lib/types'
import BottomNav from '@/app/components/BottomNav'

type View = 'list' | 'read' | 'new' | 'edit'
type AiLang = 'improve_en' | 'improve_de' | 'de_to_en' | 'en_to_de'
type AiLength = 'shorter' | 'same' | 'longer'

const C = {
  bg:'#0a0e1a', card:'#141a2e', card2:'#1c2340', border:'#2a3050', border2:'#3a4570',
  text:'#e8ecf4', text2:'#8892a8', text3:'#5a6478',
  cyan:'#00e5c8', cyan2:'#00b8a0', cyanGlow:'rgba(0,229,200,0.15)',
  violet:'#a855f7', violet2:'#8b5cf6', violetGlow:'rgba(168,85,247,0.15)',
  danger:'#ef4444', dangerGlow:'rgba(239,68,68,0.15)',
  green:'#4ade80', greenGlow:'rgba(74,222,128,0.15)',
  topbar:'#111827',
}

const topbar = (onBack:()=>void, title:string, right?:React.ReactNode) => (
  <div style={{background:C.topbar,borderBottom:`1px solid ${C.border}`,padding:'14px 16px',display:'flex',alignItems:'center',gap:'12px',maxWidth:'600px',margin:'0 auto',position:'sticky',top:0,zIndex:50}}>
    <button onClick={onBack} style={{background:'none',border:'none',color:C.cyan,fontSize:'18px',cursor:'pointer',fontWeight:600}}>←</button>
    <span style={{color:C.text,fontSize:'16px',fontWeight:700,flex:1,letterSpacing:'-0.3px'}}>{title}</span>
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
  const [showSidebar, setShowSidebar] = useState(false)
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

  async function deleteText(id:string) { await supabase.from('texts').delete().eq('id',id); setConfirmDelete(null);setView('list');loadData(userId) }

  async function deleteFolder(id:string) {
    const folder = folders.find(f=>f.id===id)
    for (const child of folders.filter(f=>f.parent_id===id)) { await supabase.from('folders').update({parent_id:folder?.parent_id||null}).eq('id',child.id) }
    await supabase.from('texts').update({folder_id:folder?.parent_id||null}).eq('folder_id',id)
    await supabase.from('folders').delete().eq('id',id)
    setConfirmDelete(null); if (activeFolder===id) setActiveFolder(null); loadData(userId)
  }

  async function createFolder(parentId:string|null) {
    if (!newFolderName.trim()||!workspaceId) return
    await supabase.from('folders').insert({name:newFolderName,icon:newFolderIcon,workspace_id:workspaceId,color:C.cyanGlow,parent_id:parentId})
    setNewFolderName('');setNewFolderIcon('📁');setAddingFolderUnder(null);loadData(userId)
    if (parentId) setExpandedFolders(prev=>{const n=new Set(prev);n.add(parentId);return n})
  }

  async function renameFolder() {
    if (!editingFolder||!editFolderName.trim()) return
    await supabase.from('folders').update({name:editFolderName,icon:editFolderIcon}).eq('id',editingFolder)
    setEditingFolder(null);setEditFolderName('');loadData(userId)
  }

  async function handleFolderDrop(targetId:string|null) {
    if (!dragFolderId||dragFolderId===targetId) { setDragFolderId(null);setDragOverId(null);return }
    const isChild = (checkId:string):boolean => folders.filter(f=>f.parent_id===checkId).some(c=>c.id===targetId||isChild(c.id))
    if (targetId&&isChild(dragFolderId)) { setDragFolderId(null);setDragOverId(null);return }
    await supabase.from('folders').update({parent_id:targetId}).eq('id',dragFolderId)
    setDragFolderId(null);setDragOverId(null)
    if (targetId) setExpandedFolders(prev=>{const n=new Set(prev);n.add(targetId);return n})
    loadData(userId)
  }

  async function aiAction() {
    if (!activeText) return; setAiLoading(true);setAiResult(null)
    try {
      const langPrompts = { improve_en:`Improve this English text to professional Business English. ${aiLength==='shorter'?'Make it about 30% shorter.':aiLength==='longer'?'Make it about 30% longer.':'Keep the same length.'}`, improve_de:`Verbessere diesen deutschen Text zu professionellem Geschäftsdeutsch. ${aiLength==='shorter'?'Mache ihn etwa 30% kürzer.':aiLength==='longer'?'Mache ihn etwa 30% länger.':'Behalte die gleiche Länge.'}`, de_to_en:`Translate this German text to professional Business English. ${aiLength==='shorter'?'Make it shorter.':aiLength==='longer'?'Make it longer.':'Keep the same length.'}`, en_to_de:`Translate this English text to professional German. ${aiLength==='shorter'?'Mache es kürzer.':aiLength==='longer'?'Mache es länger.':'Gleiche Länge.'}` }
      const res = await fetch('/api/improve-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:activeText.content,mode:'custom',prompt:langPrompts[aiLang]})})
      const {result} = await res.json(); setAiResult(result);setShowAiOptions(false)
    } catch { alert('KI nicht verfügbar.') }
    setAiLoading(false)
  }

  async function acceptAiResult() {
    if (!activeText||!aiResult) return
    const field = (aiLang==='en_to_de'||aiLang==='improve_de')?'content_translated':'content_improved'
    await supabase.from('texts').update({[field]:aiResult}).eq('id',activeText.id)
    setActiveText(prev=>prev?{...prev,[field]:aiResult}:null); setAiResult(null)
  }

  function speak(text:string) {
    if (speaking){window.speechSynthesis.cancel();setSpeaking(false);return}
    const u=new SpeechSynthesisUtterance(text); u.lang=(aiLang==='en_to_de'||aiLang==='improve_de')?'de-DE':'en-GB';u.rate=0.9
    u.onend=()=>setSpeaking(false); setSpeaking(true);window.speechSynthesis.speak(u)
  }

  function openEdit() { if (!activeText) return; setTitle(activeText.title);setContent(activeText.content);setEditFolderField(activeText.folder_id||null);setView('edit') }
  function toggleFolder(id:string) { setExpandedFolders(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n}) }
  const getChildren = (parentId:string|null) => folders.filter(f=>f.parent_id===parentId)

  const AddFolderInline = ({parentId}:{parentId:string|null}) => (
    <div style={{padding:'8px 10px',background:C.card2,borderRadius:'8px',margin:'4px 0',border:`1px solid ${C.border}`}}>
      <input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createFolder(parentId)} placeholder="Ordner-Name..." autoFocus style={{width:'100%',padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:'6px',fontSize:'13px',marginBottom:'6px',background:C.bg,color:C.text,outline:'none'}} />
      <div style={{display:'flex',gap:'4px',flexWrap:'wrap',marginBottom:'6px'}}>
        {folderIcons.map(ic=><button key={ic} onClick={()=>setNewFolderIcon(ic)} style={{padding:'3px 5px',fontSize:'14px',background:newFolderIcon===ic?C.cyanGlow:'none',border:newFolderIcon===ic?'1px solid rgba(0,229,200,0.3)':'1px solid transparent',borderRadius:'4px',cursor:'pointer'}}>{ic}</button>)}
      </div>
      <div style={{display:'flex',gap:'6px'}}>
        <button onClick={()=>createFolder(parentId)} style={{flex:1,padding:'6px',background:`linear-gradient(135deg, ${C.cyan}, ${C.cyan2})`,color:C.bg,border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:700}}>Erstellen</button>
        <button onClick={()=>{setAddingFolderUnder(null);setNewFolderName('');setNewFolderIcon('📁')}} style={{flex:1,padding:'6px',background:C.card,border:`1px solid ${C.border}`,borderRadius:'6px',fontSize:'12px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
      </div>
    </div>
  )

  const FolderRow = ({f,depth=0}:{f:Folder,depth?:number}) => {
    const children = getChildren(f.id); const isExpanded = expandedFolders.has(f.id); const isActive = activeFolder===f.id
    const isEditing = editingFolder===f.id; const isDragOver = dragOverId===f.id; const textCount = texts.filter(t=>t.folder_id===f.id).length
    return (
      <div onDragOver={e=>{e.preventDefault();setDragOverId(f.id)}} onDrop={()=>handleFolderDrop(f.id)} onDragLeave={()=>setDragOverId(null)} style={{background:isDragOver?C.cyanGlow:'none',borderRadius:'6px',transition:'background 0.15s'}}>
        {isEditing ? (
          <div style={{padding:'8px 10px',paddingLeft:`${10+depth*16}px`,background:C.card2,borderRadius:'6px',margin:'2px 0'}}>
            <input value={editFolderName} onChange={e=>setEditFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&renameFolder()} autoFocus style={{width:'100%',padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:'6px',fontSize:'13px',marginBottom:'6px',background:C.bg,color:C.text,outline:'none'}} />
            <div style={{display:'flex',gap:'4px',flexWrap:'wrap',marginBottom:'6px'}}>
              {folderIcons.map(ic=><button key={ic} onClick={()=>setEditFolderIcon(ic)} style={{padding:'3px 5px',fontSize:'14px',background:editFolderIcon===ic?C.cyanGlow:'none',border:editFolderIcon===ic?'1px solid rgba(0,229,200,0.3)':'1px solid transparent',borderRadius:'4px',cursor:'pointer'}}>{ic}</button>)}
            </div>
            <div style={{display:'flex',gap:'6px'}}>
              <button onClick={renameFolder} style={{flex:1,padding:'5px',background:`linear-gradient(135deg, ${C.cyan}, ${C.cyan2})`,color:C.bg,border:'none',borderRadius:'5px',fontSize:'11px',cursor:'pointer',fontWeight:700}}>OK</button>
              <button onClick={()=>setEditingFolder(null)} style={{flex:1,padding:'5px',background:C.card,border:`1px solid ${C.border}`,borderRadius:'5px',fontSize:'11px',cursor:'pointer',color:C.text2}}>Abbruch</button>
            </div>
          </div>
        ) : (
          <div draggable onDragStart={()=>setDragFolderId(f.id)} onDragEnd={()=>{setDragFolderId(null);setDragOverId(null)}}
            onClick={()=>{setActiveFolder(f.id);setShowSidebar(false)}}
            style={{paddingLeft:`${8+depth*16}px`,paddingRight:'6px',paddingTop:'10px',paddingBottom:'10px',display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',color:isActive?C.cyan:C.text2,background:isActive?C.cyanGlow:'none',borderLeft:`2px solid ${isActive?C.cyan:'transparent'}`,borderRadius:isActive?'0 6px 6px 0':'0',fontSize:'13px',fontWeight:isActive?600:400,transition:'all 0.15s'}}>
            <span onClick={e=>{e.stopPropagation();if(children.length>0)toggleFolder(f.id)}} style={{fontSize:'10px',color:C.text3,width:'14px',flexShrink:0,cursor:children.length>0?'pointer':'default',transition:'transform 0.15s',transform:isExpanded?'rotate(90deg)':'none',display:'inline-block'}}>
              {children.length>0?'›':''}
            </span>
            <span style={{fontSize:'16px'}}>{f.icon}</span>
            <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
            {textCount>0&&<span style={{fontSize:'10px',color:C.text3,background:C.card2,padding:'1px 6px',borderRadius:'8px'}}>{textCount}</span>}
            <div style={{display:'flex',gap:'2px',opacity:0.5}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setAddingFolderUnder(addingFolderUnder===f.id?null:f.id);setNewFolderName('');if(!expandedFolders.has(f.id))toggleFolder(f.id)}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:C.cyan,padding:'2px 3px',lineHeight:1}}>+</button>
              <button onClick={()=>{setEditingFolder(f.id);setEditFolderName(f.name);setEditFolderIcon(f.icon||'📁')}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:C.text3,padding:'2px 3px',lineHeight:1}}>✏</button>
              <button onClick={()=>setConfirmDelete({id:f.id,type:'folder',name:f.name})} style={{background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:C.text3,padding:'2px 3px',lineHeight:1}}>✕</button>
            </div>
          </div>
        )}
        {addingFolderUnder===f.id&&<div style={{paddingLeft:`${16+depth*16}px`,paddingRight:'8px'}}><AddFolderInline parentId={f.id}/></div>}
        {isExpanded&&children.map(child=><FolderRow key={child.id} f={child} depth={depth+1}/>)}
      </div>
    )
  }

  const filtered = texts.filter(t=>!activeFolder||t.folder_id===activeFolder)
  const activeFolderObj = activeFolder ? folders.find(f=>f.id===activeFolder) : null

  const ConfirmModal = () => (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'1rem'}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:'16px',padding:'1.5rem',maxWidth:'320px',width:'100%'}}>
        <div style={{fontWeight:700,fontSize:'16px',marginBottom:'6px',color:C.text}}>Wirklich löschen?</div>
        <div style={{fontSize:'14px',color:C.text2,marginBottom:'6px'}}>{confirmDelete?.name}</div>
        {confirmDelete?.type==='folder'&&<div style={{fontSize:'12px',color:C.text2,marginBottom:'1rem',background:C.cyanGlow,padding:'10px',borderRadius:'8px',border:'1px solid rgba(0,229,200,0.2)',lineHeight:'1.5'}}>Unterordner werden verschoben. Texte bleiben erhalten.</div>}
        {confirmDelete?.type==='text'&&<div style={{marginBottom:'1rem'}}/>}
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={()=>confirmDelete?.type==='folder'?deleteFolder(confirmDelete.id):deleteText(confirmDelete!.id)} style={{flex:1,padding:'10px',background:C.danger,color:'#fff',border:'none',borderRadius:'10px',cursor:'pointer',fontWeight:600}}>Löschen</button>
          <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:'10px',background:C.card2,border:`1px solid ${C.border}`,borderRadius:'10px',cursor:'pointer',color:C.text2}}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  const AiOptionsPanel = () => (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:'14px',padding:'14px',marginBottom:'1rem'}}>
      <div style={{fontSize:'11px',fontWeight:700,color:C.cyan,marginBottom:'10px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>KI-Optionen</div>
      <div style={{marginBottom:'12px'}}>
        <div style={{fontSize:'11px',color:C.text2,marginBottom:'6px',fontWeight:600}}>Sprache / Modus</div>
        {([['improve_en','🇬🇧 Englisch verbessern'],['improve_de','🇩🇪 Deutsch verbessern'],['de_to_en','🇩🇪→🇬🇧 Deutsch → Englisch'],['en_to_de','🇬🇧→🇩🇪 Englisch → Deutsch']] as [AiLang,string][]).map(([val,label])=>(
          <label key={val} style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'13px',color:C.text,marginBottom:'5px'}}>
            <input type="radio" checked={aiLang===val} onChange={()=>setAiLang(val)} style={{accentColor:C.cyan}} />{label}
          </label>
        ))}
      </div>
      <div style={{marginBottom:'12px'}}>
        <div style={{fontSize:'11px',color:C.text2,marginBottom:'6px',fontWeight:600}}>Länge</div>
        <div style={{display:'flex',gap:'6px'}}>
          {([['shorter','Kürzer'],['same','Gleich'],['longer','Länger']] as [AiLength,string][]).map(([val,label])=>(
            <button key={val} onClick={()=>setAiLength(val)} style={{flex:1,padding:'7px',border:`1.5px solid ${aiLength===val?'rgba(0,229,200,0.4)':C.border}`,background:aiLength===val?C.cyanGlow:C.card2,borderRadius:'8px',fontSize:'12px',cursor:'pointer',color:aiLength===val?C.cyan:C.text2,fontWeight:aiLength===val?600:400}}>{label}</button>
          ))}
        </div>
      </div>
      <button onClick={aiAction} disabled={aiLoading} style={{width:'100%',padding:'10px',background:`linear-gradient(135deg, ${C.cyan}, ${C.cyan2})`,color:C.bg,border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:700,cursor:'pointer',opacity:aiLoading?0.7:1}}>
        {aiLoading?'KI arbeitet...':'✨ Ausführen'}
      </button>
    </div>
  )

  if (view==='read'&&activeText) return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&<ConfirmModal/>}
      {topbar(()=>{setView('list');window.speechSynthesis?.cancel();setSpeaking(false);setShowAiOptions(false);setAiResult(null)},activeText.title,
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={openEdit} style={{padding:'6px 12px',background:C.cyanGlow,border:'1px solid rgba(0,229,200,0.3)',borderRadius:'8px',fontSize:'12px',cursor:'pointer',color:C.cyan,fontWeight:600}}>Bearbeiten</button>
          <button onClick={()=>setConfirmDelete({id:activeText.id,type:'text',name:activeText.title})} style={{padding:'6px 12px',background:C.dangerGlow,border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',fontSize:'12px',cursor:'pointer',color:C.danger,fontWeight:600}}>Löschen</button>
        </div>
      )}
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <div style={{display:'flex',gap:'8px',marginBottom:'1rem',flexWrap:'wrap' as const}}>
          <button onClick={()=>speak(activeText.content)} style={{padding:'8px 16px',background:speaking?C.cyanGlow:C.card,border:`1.5px solid ${speaking?'rgba(0,229,200,0.4)':C.border}`,borderRadius:'10px',fontSize:'13px',cursor:'pointer',color:speaking?C.cyan:C.text,fontWeight:500}}>{speaking?'⏸ Stop':'▶ Vorlesen'}</button>
          <button onClick={()=>{setShowAiOptions(!showAiOptions);setAiResult(null)}} style={{padding:'8px 16px',background:showAiOptions?C.violetGlow:C.card,border:`1.5px solid ${showAiOptions?'rgba(168,85,247,0.4)':C.border}`,borderRadius:'10px',fontSize:'13px',cursor:'pointer',color:showAiOptions?C.violet:C.text,fontWeight:500}}>✨ KI</button>
        </div>
        {showAiOptions&&<AiOptionsPanel/>}
        {aiResult&&(
          <div style={{background:C.violetGlow,border:'1.5px solid rgba(168,85,247,0.3)',borderRadius:'14px',padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'11px',color:C.violet,fontWeight:700,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>KI-Ergebnis</div>
            <p style={{fontSize:'15px',lineHeight:'1.8',color:C.text,whiteSpace:'pre-wrap',marginBottom:'12px'}}>{aiResult}</p>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={acceptAiResult} style={{flex:1,padding:'10px',background:`linear-gradient(135deg, ${C.violet}, ${C.violet2})`,color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>✓ Übernehmen</button>
              <button onClick={()=>setAiResult(null)} style={{flex:1,padding:'10px',background:C.card,border:`1px solid ${C.border}`,borderRadius:'10px',fontSize:'13px',cursor:'pointer',color:C.text2}}>✕ Verwerfen</button>
            </div>
          </div>
        )}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:'14px',padding:'1.25rem',marginBottom:'1rem'}}>
          <p style={{fontSize:'15px',lineHeight:'1.8',whiteSpace:'pre-wrap',color:C.text}}>{activeText.content}</p>
        </div>
        {activeText.content_improved&&(
          <div style={{background:C.greenGlow,border:'1.5px solid rgba(74,222,128,0.3)',borderRadius:'14px',padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'11px',color:C.green,fontWeight:700,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Verbesserte Version</div>
            <p style={{fontSize:'15px',lineHeight:'1.8',color:C.text,whiteSpace:'pre-wrap'}}>{activeText.content_improved}</p>
          </div>
        )}
        {activeText.content_translated&&(
          <div style={{background:C.cyanGlow,border:'1.5px solid rgba(0,229,200,0.3)',borderRadius:'14px',padding:'1.25rem'}}>
            <div style={{fontSize:'11px',color:C.cyan,fontWeight:700,marginBottom:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Übersetzung</div>
            <p style={{fontSize:'15px',lineHeight:'1.8',color:C.text,whiteSpace:'pre-wrap'}}>{activeText.content_translated}</p>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )

  if (view==='new'||view==='edit') return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {topbar(()=>setView(view==='edit'?'read':'list'),view==='edit'?'Text bearbeiten':'Neuer Text')}
      <div className="page-content" style={{maxWidth:'600px',margin:'0 auto',padding:'1rem'}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titel" style={{width:'100%',padding:'10px 14px',border:`1.5px solid ${C.border}`,borderRadius:'10px',fontSize:'15px',marginBottom:'10px',background:C.card,color:C.text,outline:'none'}} />
        <select value={(view==='edit'?editFolderField:activeFolder)||''} onChange={e=>view==='edit'?setEditFolderField(e.target.value||null):setActiveFolder(e.target.value||null)} style={{width:'100%',padding:'10px 14px',border:`1.5px solid ${C.border}`,borderRadius:'10px',fontSize:'14px',marginBottom:'10px',color:C.text,background:C.card}}>
          <option value="">Kein Ordner</option>
          {folders.map(f=><option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
        </select>
        <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Text eingeben..." rows={12} style={{width:'100%',padding:'14px',border:`1.5px solid ${C.border}`,borderRadius:'14px',fontSize:'15px',lineHeight:'1.7',resize:'vertical' as const,marginBottom:'10px',background:C.card,color:C.text,outline:'none'}} />
        <button onClick={saveText} disabled={!title.trim()||!content.trim()} style={{width:'100%',padding:'12px',background:`linear-gradient(135deg, ${C.cyan}, ${C.cyan2})`,color:C.bg,border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
          {view==='edit'?'Änderungen speichern':'Speichern'}
        </button>
      </div>
      <BottomNav/>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg}}>
      {confirmDelete&&<ConfirmModal/>}
      {showSidebar&&<div onClick={()=>setShowSidebar(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:80}}/>}

      {topbar(()=>router.push('/knowledge'),'📖 Bibliothek',
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={()=>setShowSidebar(!showSidebar)} style={{padding:'6px 10px',background:showSidebar?C.cyanGlow:C.card2,border:`1px solid ${showSidebar?'rgba(0,229,200,0.3)':C.border}`,borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer',color:showSidebar?C.cyan:C.text2}}>📁 Ordner</button>
          <button onClick={()=>setView('new')} style={{padding:'6px 12px',background:`linear-gradient(135deg, ${C.cyan}, ${C.cyan2})`,color:C.bg,border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:700,cursor:'pointer'}}>+ Text</button>
        </div>
      )}

      <div style={{maxWidth:'600px',margin:'0 auto',position:'relative'}}>
        {/* Slide-in sidebar */}
        <div style={{position:'fixed',left:0,top:0,bottom:0,width:'270px',background:C.card,borderRight:`1px solid ${C.border}`,overflowY:'auto',zIndex:90,transform:showSidebar?'translateX(0)':'translateX(-100%)',transition:'transform 0.25s ease',paddingTop:'60px',paddingBottom:'80px'}}>
          <div style={{padding:'12px 14px 6px',fontSize:'10px',fontWeight:700,color:C.text3,letterSpacing:'0.07em',textTransform:'uppercase' as const,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            Ordner
            <button onClick={()=>setAddingFolderUnder(addingFolderUnder==='root'?null:'root')} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',color:C.cyan,fontWeight:700,padding:0}}>+</button>
          </div>
          {addingFolderUnder==='root'&&<div style={{padding:'0 10px 8px'}}><AddFolderInline parentId={null}/></div>}
          <div onDragOver={e=>{e.preventDefault();setDragOverId('root')}} onDrop={()=>handleFolderDrop(null)} onDragLeave={()=>setDragOverId(null)}
            onClick={()=>{setActiveFolder(null);setShowSidebar(false)}}
            style={{padding:'10px 10px 10px 12px',fontSize:'13px',cursor:'pointer',color:!activeFolder?C.cyan:C.text2,background:!activeFolder?C.cyanGlow:dragOverId==='root'?C.cyanGlow:'none',borderLeft:`2px solid ${!activeFolder?C.cyan:'transparent'}`,display:'flex',alignItems:'center',gap:'6px',fontWeight:!activeFolder?600:400}}>
            <span>📁</span><span style={{flex:1}}>Alle Texte</span><span style={{fontSize:'10px',color:C.text3,background:C.card2,padding:'1px 6px',borderRadius:'8px'}}>{texts.length}</span>
          </div>
          {getChildren(null).map(f=><FolderRow key={f.id} f={f} depth={0}/>)}
        </div>

        {/* Main content */}
        <div className="page-content" style={{padding:'12px 16px'}}>
          {activeFolderObj && (
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px',padding:'10px 12px',background:C.card,borderRadius:'10px',border:`1px solid ${C.border}`}}>
              <span style={{fontSize:'16px'}}>{activeFolderObj.icon}</span>
              <span style={{fontSize:'14px',fontWeight:600,color:C.text}}>{activeFolderObj.name}</span>
              <span style={{fontSize:'11px',color:C.text3}}>({filtered.length})</span>
              <div style={{flex:1}}/>
              <button onClick={()=>setActiveFolder(null)} style={{background:'none',border:'none',color:C.cyan,cursor:'pointer',fontSize:'12px'}}>Alle anzeigen</button>
            </div>
          )}
          {filtered.map(t=>(
            <div key={t.id} onClick={()=>{setActiveText(t);setView('read')}} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'14px',border:`1px solid ${C.border}`,borderRadius:'12px',marginBottom:'8px',background:C.card,cursor:'pointer'}}>
              <div style={{width:'8px',height:'8px',borderRadius:'50%',background:C.cyan,marginTop:'6px',flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'14px',fontWeight:600,color:C.text}}>{t.title}</div>
                <div style={{fontSize:'12px',color:C.text3,marginTop:'3px',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{t.content}</div>
                <div style={{fontSize:'10px',color:C.text3,marginTop:'4px',display:'flex',gap:'8px'}}>
                  <span>{new Date(t.created_at).toLocaleDateString('de-AT')}</span>
                  {t.content_improved&&<span style={{color:C.green,fontWeight:600}}>verbessert</span>}
                  {t.content_translated&&<span style={{color:C.cyan,fontWeight:600}}>übersetzt</span>}
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();setConfirmDelete({id:t.id,type:'text',name:t.title})}} style={{padding:'4px 8px',background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:'13px',flexShrink:0}}>✕</button>
            </div>
          ))}
          {filtered.length===0&&<div style={{textAlign:'center',padding:'3rem',color:C.text3,fontSize:'14px'}}>Noch keine Texte{activeFolderObj?' in diesem Ordner':''}.</div>}
        </div>
      </div>
      <BottomNav/>
    </div>
  )
}
