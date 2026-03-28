'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { LernText, Folder } from '@/lib/types'

type View = 'list' | 'read' | 'new'

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
  const [aiLoading, setAiLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderIcon, setNewFolderIcon] = useState('📁')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      loadData(data.user.id)
    })
  }, [router])

  async function loadData(uid: string) {
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', uid).single()
    const wid = profile?.workspace_id
    setWorkspaceId(wid || '')
    const [{ data: t }, { data: f }] = await Promise.all([
      supabase.from('texts').select('*').eq('workspace_id', wid).order('created_at', { ascending: false }),
      supabase.from('folders').select('*').eq('workspace_id', wid).order('name')
    ])
    setTexts(t || []); setFolders(f || [])
  }

  async function saveText() {
    if (!title.trim() || !content.trim() || !userId) return
    await supabase.from('texts').insert({ title, content, folder_id: activeFolder, workspace_id: workspaceId, created_by: userId, language: 'en', questions: [], vocabulary: [] })
    setTitle(''); setContent(''); setView('list'); loadData(userId)
  }

  async function deleteText(id: string) {
    await supabase.from('texts').delete().eq('id', id)
    setConfirmDelete(null)
    if (view === 'read') setView('list')
    loadData(userId)
  }

  async function deleteFolder(id: string) {
    await supabase.from('folders').delete().eq('id', id)
    setConfirmDelete(null)
    if (activeFolder === id) setActiveFolder(null)
    loadData(userId)
  }

  async function createFolder() {
    if (!newFolderName.trim() || !workspaceId) return
    await supabase.from('folders').insert({ name: newFolderName, icon: newFolderIcon, workspace_id: workspaceId, color: '#E6F1FB' })
    setNewFolderName(''); setShowNewFolder(false); loadData(userId)
  }

  async function aiImprove(mode: 'improve' | 'translate') {
    if (!activeText) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/improve-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: activeText.content, mode }) })
      const { result } = await res.json()
      const field = mode === 'translate' ? 'content_translated' : 'content_improved'
      await supabase.from('texts').update({ [field]: result }).eq('id', activeText.id)
      setActiveText(prev => prev ? { ...prev, [field]: result } : null)
    } catch { alert('KI nicht verfügbar.') }
    setAiLoading(false)
  }

  function speak(text: string) {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-GB'; u.rate = 0.9
    u.onend = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }

  const filtered = texts.filter(t => !activeFolder || t.folder_id === activeFolder)
  const folderIcons = ['📁','📚','💼','✈️','🎯','🌍','🏥','💻','⭐','📝']

  const ConfirmModal = ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', maxWidth: '320px', width: '100%' }}>
        <div style={{ fontWeight: 500, marginBottom: '8px' }}>Wirklich löschen?</div>
        <div style={{ fontSize: '14px', color: '#6b6b67', marginBottom: '1.25rem' }}>„{label}" wird dauerhaft gelöscht.</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onConfirm} style={{ flex: 1, padding: '10px', background: '#E24B4A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Löschen</button>
          <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '8px', cursor: 'pointer', color: '#6b6b67' }}>Abbrechen</button>
        </div>
      </div>
    </div>
  )

  if (view === 'read' && activeText) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
        {confirmDelete && <ConfirmModal label={activeText.title} onConfirm={() => deleteText(activeText.id)} />}
        <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => { setView('list'); window.speechSynthesis?.cancel(); setSpeaking(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
          <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeText.title}</span>
          <button onClick={() => setConfirmDelete(activeText.id)} style={{ padding: '6px 12px', background: '#FCEBEB', border: '0.5px solid #E24B4A', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#791F1F' }}>Löschen</button>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button onClick={() => speak(activeText.content)} style={{ padding: '8px 14px', background: speaking ? '#E6F1FB' : '#fff', border: `0.5px solid ${speaking ? '#378ADD' : '#e5e5e2'}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: speaking ? '#0C447C' : '#1a1a18' }}>
              {speaking ? '⏸ Stop' : '▶ Vorlesen'}
            </button>
            <button onClick={() => aiImprove('improve')} disabled={aiLoading} style={{ padding: '8px 14px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>✨ Verbessern</button>
            <button onClick={() => aiImprove('translate')} disabled={aiLoading} style={{ padding: '8px 14px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>🌐 Übersetzen</button>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: '15px', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{activeText.content}</p>
          </div>
          {aiLoading && <div style={{ textAlign: 'center', padding: '1rem', color: '#6b6b67', fontSize: '14px' }}>KI arbeitet...</div>}
          {activeText.content_improved && (
            <div style={{ background: '#EAF3DE', border: '0.5px solid #639922', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '11px', color: '#27500A', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verbesserte Version</div>
              <p style={{ fontSize: '15px', lineHeight: '1.8', color: '#27500A', whiteSpace: 'pre-wrap' }}>{activeText.content_improved}</p>
            </div>
          )}
          {activeText.content_translated && (
            <div style={{ background: '#E6F1FB', border: '0.5px solid #378ADD', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ fontSize: '11px', color: '#0C447C', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Übersetzung</div>
              <p style={{ fontSize: '15px', lineHeight: '1.8', color: '#0C447C', whiteSpace: 'pre-wrap' }}>{activeText.content_translated}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === 'new') {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
        <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
          <span style={{ fontWeight: 500 }}>Neuer Text</span>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel" style={{ width: '100%', padding: '10px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
          <select value={activeFolder || ''} onChange={e => setActiveFolder(e.target.value || null)} style={{ width: '100%', padding: '10px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }}>
            <option value="">Kein Ordner</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
          </select>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Text eingeben..." rows={12} style={{ width: '100%', padding: '12px', border: '0.5px solid #e5e5e2', borderRadius: '12px', fontSize: '15px', lineHeight: '1.7', resize: 'vertical', marginBottom: '8px' }} />
          <button onClick={saveText} disabled={!title.trim() || !content.trim()} style={{ width: '100%', padding: '12px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>Speichern</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7' }}>
      {confirmDelete && folders.find(f => f.id === confirmDelete) && (
        <ConfirmModal label={folders.find(f => f.id === confirmDelete)?.name || ''} onConfirm={() => deleteFolder(confirmDelete!)} />
      )}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e2', padding: '1rem', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <span style={{ fontWeight: 500, fontSize: '17px' }}>📖 Bibliothek</span>
        <button onClick={() => setView('new')} style={{ marginLeft: 'auto', padding: '7px 14px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>+ Text</button>
      </div>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        {/* Folder bar */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => setActiveFolder(null)} style={{ padding: '5px 12px', background: !activeFolder ? '#E6F1FB' : '#fff', border: `0.5px solid ${!activeFolder ? '#378ADD' : '#e5e5e2'}`, borderRadius: '20px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', color: !activeFolder ? '#0C447C' : '#6b6b67', fontWeight: !activeFolder ? 500 : 400 }}>Alle ({texts.length})</button>
          {folders.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: activeFolder === f.id ? '#E6F1FB' : '#fff', border: `0.5px solid ${activeFolder === f.id ? '#378ADD' : '#e5e5e2'}`, borderRadius: '20px', padding: '5px 8px 5px 12px' }}>
              <span onClick={() => setActiveFolder(f.id)} style={{ fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', color: activeFolder === f.id ? '#0C447C' : '#6b6b67' }}>{f.icon} {f.name}</span>
              <button onClick={() => setConfirmDelete(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#6b6b67', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
          ))}
          <button onClick={() => setShowNewFolder(!showNewFolder)} style={{ padding: '5px 10px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', color: '#6b6b67' }}>+ Ordner</button>
        </div>
        {showNewFolder && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ordner-Name" style={{ width: '100%', padding: '9px', border: '0.5px solid #e5e5e2', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {folderIcons.map(ic => <button key={ic} onClick={() => setNewFolderIcon(ic)} style={{ padding: '6px', fontSize: '16px', background: newFolderIcon === ic ? '#E6F1FB' : '#fff', border: `0.5px solid ${newFolderIcon === ic ? '#378ADD' : '#e5e5e2'}`, borderRadius: '6px', cursor: 'pointer' }}>{ic}</button>)}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={createFolder} style={{ flex: 1, padding: '9px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Erstellen</button>
              <button onClick={() => setShowNewFolder(false)} style={{ flex: 1, padding: '9px', background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '8px', cursor: 'pointer', color: '#6b6b67' }}>Abbrechen</button>
            </div>
          </div>
        )}
        {filtered.map(t => (
          <div key={t.id} style={{ background: '#fff', border: '0.5px solid #e5e5e2', borderRadius: '12px', padding: '1rem', marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div onClick={() => { setActiveText(t); setView('read') }} style={{ flex: 1, cursor: 'pointer' }}>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>{t.title}</div>
              <div style={{ fontSize: '13px', color: '#6b6b67', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.content}</div>
              <div style={{ fontSize: '11px', color: '#6b6b67', marginTop: '6px', display: 'flex', gap: '8px' }}>
                <span>{new Date(t.created_at).toLocaleDateString('de-AT')}</span>
                {t.content_improved && <span style={{ color: '#27500A' }}>✓ verbessert</span>}
                {t.content_translated && <span style={{ color: '#0C447C' }}>✓ übersetzt</span>}
              </div>
            </div>
            <button onClick={() => { setConfirmDelete(t.id); setActiveText(t) }} style={{ padding: '5px 10px', background: '#FCEBEB', border: '0.5px solid #E24B4A', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#791F1F', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#6b6b67', fontSize: '14px' }}>Noch keine Texte. Füge deinen ersten Lerntext hinzu!</div>}
      </div>
    </div>
  )
}
