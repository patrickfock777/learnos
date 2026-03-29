'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { LernText, Folder } from '@/lib/types'

type View = 'list' | 'read' | 'new' | 'edit'

const C = {
  primary:'#1a3a4a', teal:'#ADD8E6', tealDark:'#7BB8CC', tealLight:'#E8F6FA',
  accent:'#2a6478', sand:'#f7f4f0', text:'#1a2c35', text2:'#5a7280', border:'#dde8ec',
  danger:'#e24b4a', dangerLight:'#fef0f0', white:'#fff', bg:'#edf4f7'
}

const topbar = (onBack: () => void, title: string, right?: React.ReactNode) => (
  <div style={{ background: C.primary, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '600px', margin: '0 auto' }}>
    <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.teal, fontSize: '18px', cursor: 'pointer', fontWeight: 600 }}>←</button>
    <span style={{ color: '#fff', fontSize: '15px', fontWeight: 700, flex: 1 }}>{title}</span>
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
  const [editFolder, setEditFolder] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderIcon, setNewFolderIcon] = useState('📁')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id); loadData(data.user.id)
    })
  }, [router])

  async function loadData(uid: string) {
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', uid).single()
    const wid = profile?.workspace_id; setWorkspaceId(wid || '')
    const [{ data: t }, { data: f }] = await Promise.all([
      supabase.from('texts').select('*').eq('workspace_id', wid).order('created_at', { ascending: false }),
      supabase.from('folders').select('*').eq('workspace_id', wid).order('name')
    ])
    setTexts(t || []); setFolders(f || [])
  }

  async function saveText() {
    if (!title.trim() || !content.trim() || !userId) return
    if (view === 'edit' && activeText) {
      await supabase.from('texts').update({ title, content, folder_id: editFolder }).eq('id', activeText.id)
      setActiveText(prev => prev ? { ...prev, title, content, folder_id: editFolder } : null)
    } else {
      await supabase.from('texts').insert({ title, content, folder_id: activeFolder, workspace_id: workspaceId, created_by: userId, language: 'en', questions: [], vocabulary: [] })
    }
    setTitle(''); setContent(''); setView('list'); loadData(userId)
  }

  async function deleteText(id: string) {
    await supabase.from('texts').delete().eq('id', id)
    setConfirmDelete(null); setView('list'); loadData(userId)
  }

  async function deleteFolder(id: string) {
    await supabase.from('folders').delete().eq('id', id)
    setConfirmDelete(null)
    if (activeFolder === id) setActiveFolder(null)
    loadData(userId)
  }

  async function createFolder() {
    if (!newFolderName.trim() || !workspaceId) return
    await supabase.from('folders').insert({ name: newFolderName, icon: newFolderIcon, workspace_id: workspaceId, color: C.tealLight })
    setNewFolderName(''); setShowNewFolder(false); loadData(userId)
  }

  async function aiAction(mode: 'improve' | 'translate') {
    if (!activeText) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/improve-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: activeText.content, mode }) })
      const { result } = await res.json()
      const field = mode === 'translate' ? 'content_translated' : 'content_improved'
      await supabase.from('texts').update({ [field]: result }).eq('id', activeText.id)
      setActiveText(prev => prev ? { ...prev, [field]: result } : null)
    } catch { alert('KI nicht verfügbar. Bitte API Key prüfen.') }
    setAiLoading(false)
  }

  function speak(text: string) {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-GB'; u.rate = 0.9
    u.onend = () => setSpeaking(false)
    setSpeaking(true); window.speechSynthesis.speak(u)
  }

  function openEdit() {
    if (!activeText) return
    setTitle(activeText.title); setContent(activeText.content)
    setEditFolder(activeText.folder_id || null); setView('edit')
  }

  const filtered = texts.filter(t => !activeFolder || t.folder_id === activeFolder)
  const folderIcons = ['📁','📚','💼','✈️','🎯','🌍','🏥','💻','⭐','📝','📡','🛒']

  const confirmLabel = confirmDelete ? (texts.find(t => t.id === confirmDelete)?.title || folders.find(f => f.id === confirmDelete)?.name || '') : ''
  const confirmIsFolder = confirmDelete ? !!folders.find(f => f.id === confirmDelete) : false

  const inp = (val: string, set: (v:string)=>void, ph: string, multi?: boolean) => {
    const base: React.CSSProperties = { width: '100%', padding: '9px 12px', border: `1.5px solid ${C.border}`, borderRadius: '8px', fontSize: '14px', marginBottom: '8px', color: C.text, background: C.sand, outline: 'none' }
    return multi
      ? <textarea value={val} onChange={e => set(e.target.value)} placeholder={ph} rows={12} style={{ ...base, resize: 'vertical', lineHeight: '1.7' }} />
      : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={base} />
  }

  const ConfirmModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div style={{ background: C.white, borderRadius: '14px', padding: '1.5rem', maxWidth: '320px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px', color: C.text }}>Wirklich löschen?</div>
        <div style={{ fontSize: '14px', color: C.text2, marginBottom: '1.25rem' }}>„{confirmLabel}" wird dauerhaft gelöscht.</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => confirmIsFolder ? deleteFolder(confirmDelete!) : deleteText(confirmDelete!)} style={{ flex: 1, padding: '10px', background: C.danger, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Löschen</button>
          <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', background: C.sand, border: `1px solid ${C.border}`, borderRadius: '8px', cursor: 'pointer', color: C.text2 }}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  if (view === 'read' && activeText) return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {confirmDelete && <ConfirmModal />}
      {topbar(() => { setView('list'); window.speechSynthesis?.cancel(); setSpeaking(false) }, activeText.title,
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={openEdit} style={{ padding: '5px 10px', background: C.tealLight, border: `1px solid ${C.tealDark}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: C.primary, fontWeight: 600 }}>Bearbeiten</button>
          <button onClick={() => setConfirmDelete(activeText.id)} style={{ padding: '5px 10px', background: C.dangerLight, border: `1px solid ${C.danger}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: C.danger, fontWeight: 600 }}>Löschen</button>
        </div>
      )}
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => speak(activeText.content)} style={{ padding: '7px 14px', background: speaking ? C.teal : C.white, border: `1.5px solid ${speaking ? C.tealDark : C.border}`, borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: speaking ? C.primary : C.text, fontWeight: 500 }}>{speaking ? '⏸ Stop' : '▶ Vorlesen'}</button>
          <button onClick={() => aiAction('improve')} disabled={aiLoading} style={{ padding: '7px 14px', background: C.white, border: `1.5px solid ${C.border}`, borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: C.text }}>✨ Verbessern</button>
          <button onClick={() => aiAction('translate')} disabled={aiLoading} style={{ padding: '7px 14px', background: C.white, border: `1.5px solid ${C.border}`, borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: C.text }}>🌐 Übersetzen</button>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '15px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: C.text }}>{activeText.content}</p>
        </div>
        {aiLoading && <div style={{ textAlign: 'center', padding: '1rem', color: C.text2, fontSize: '14px' }}>KI arbeitet...</div>}
        {activeText.content_improved && (
          <div style={{ background: '#f0faf0', border: '1.5px solid #90EE90', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '11px', color: '#3a8a3a', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verbesserte Version</div>
            <p style={{ fontSize: '15px', lineHeight: '1.8', color: '#1a3a1a', whiteSpace: 'pre-wrap' }}>{activeText.content_improved}</p>
          </div>
        )}
        {activeText.content_translated && (
          <div style={{ background: C.tealLight, border: `1.5px solid ${C.tealDark}`, borderRadius: '10px', padding: '1.25rem' }}>
            <div style={{ fontSize: '11px', color: C.accent, fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Übersetzung</div>
            <p style={{ fontSize: '15px', lineHeight: '1.8', color: C.primary, whiteSpace: 'pre-wrap' }}>{activeText.content_translated}</p>
          </div>
        )}
      </div>
    </div>
  )

  if (view === 'new' || view === 'edit') return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {topbar(() => setView(view === 'edit' ? 'read' : 'list'), view === 'edit' ? 'Text bearbeiten' : 'Neuer Text')}
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        {inp(title, setTitle, 'Titel')}
        <select value={(view === 'edit' ? editFolder : activeFolder) || ''} onChange={e => view === 'edit' ? setEditFolder(e.target.value || null) : setActiveFolder(e.target.value || null)} style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${C.border}`, borderRadius: '8px', fontSize: '14px', marginBottom: '8px', color: C.text, background: C.sand }}>
          <option value="">Kein Ordner</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
        </select>
        {inp(content, setContent, 'Text eingeben...', true)}
        <button onClick={saveText} disabled={!title.trim() || !content.trim()} style={{ width: '100%', padding: '12px', background: C.primary, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          {view === 'edit' ? 'Änderungen speichern' : 'Speichern'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {confirmDelete && <ConfirmModal />}
      {topbar(() => router.push('/dashboard'), '📖 Bibliothek',
        <button onClick={() => setView('new')} style={{ padding: '6px 12px', background: C.teal, color: C.primary, border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>+ Text</button>
      )}
      <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', height: 'calc(100vh - 50px)' }}>
        {/* Sidebar */}
        <div style={{ width: '130px', background: C.sand, borderRight: `1px solid ${C.border}`, padding: '8px 0', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#bbb', padding: '6px 10px 3px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Ordner</div>
          <div onClick={() => setActiveFolder(null)} style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: !activeFolder ? C.primary : C.text2, background: !activeFolder ? C.tealLight : 'none', borderLeft: `2px solid ${!activeFolder ? C.tealDark : 'transparent'}`, display: 'flex', alignItems: 'center', gap: '5px', fontWeight: !activeFolder ? 600 : 400 }}>
            <span style={{ fontSize: '12px' }}>📁</span> Alle
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#aaa' }}>{texts.length}</span>
          </div>
          {folders.map(f => (
            <div key={f.id} onClick={() => setActiveFolder(f.id)} style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: activeFolder === f.id ? C.primary : C.text2, background: activeFolder === f.id ? C.tealLight : 'none', borderLeft: `2px solid ${activeFolder === f.id ? C.tealDark : 'transparent'}`, display: 'flex', alignItems: 'center', gap: '5px', fontWeight: activeFolder === f.id ? 600 : 400 }}>
              <span style={{ fontSize: '12px' }}>{f.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
              <span style={{ fontSize: '9px', color: '#bbb', flexShrink: 0 }}>{texts.filter(t => t.folder_id === f.id).length}</span>
            </div>
          ))}
          <div onClick={() => setShowNewFolder(!showNewFolder)} style={{ padding: '6px 10px', fontSize: '11px', cursor: 'pointer', color: C.tealDark, fontWeight: 500, marginTop: '4px' }}>+ Ordner</div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {showNewFolder && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ordner-Name" style={{ width: '100%', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: '7px', fontSize: '13px', marginBottom: '8px', background: C.sand, outline: 'none' }} />
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {folderIcons.map(ic => <button key={ic} onClick={() => setNewFolderIcon(ic)} style={{ padding: '5px', fontSize: '15px', background: newFolderIcon === ic ? C.tealLight : C.white, border: `1px solid ${newFolderIcon === ic ? C.tealDark : C.border}`, borderRadius: '5px', cursor: 'pointer' }}>{ic}</button>)}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={createFolder} style={{ flex: 1, padding: '8px', background: C.primary, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Erstellen</button>
                <button onClick={() => setShowNewFolder(false)} style={{ flex: 1, padding: '8px', background: C.sand, border: `1px solid ${C.border}`, borderRadius: '7px', cursor: 'pointer', color: C.text2, fontSize: '13px' }}>Abbrechen</button>
              </div>
            </div>
          )}
          {filtered.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', border: `1px solid ${C.border}`, borderRadius: '8px', marginBottom: '6px', background: C.white, cursor: 'pointer' }}
              onClick={() => { setActiveText(t); setView('read') }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.tealDark, marginTop: '6px', flexShrink: 0 }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{t.title}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.content}</div>
                <div style={{ fontSize: '10px', color: '#bbb', marginTop: '3px', display: 'flex', gap: '6px' }}>
                  <span>{new Date(t.created_at).toLocaleDateString('de-AT')}</span>
                  {t.content_improved && <span style={{ color: '#5ab85a', fontWeight: 600 }}>verbessert</span>}
                  {t.content_translated && <span style={{ color: C.accent, fontWeight: 600 }}>übersetzt</span>}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); setConfirmDelete(t.id); setActiveText(t) }} style={{ padding: '3px 7px', background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '12px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: C.text2, fontSize: '14px' }}>Noch keine Texte in diesem Ordner.</div>}
        </div>
      </div>
    </div>
  )
}
