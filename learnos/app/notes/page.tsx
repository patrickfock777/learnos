'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { Note, Folder, VocabSet } from '@/lib/types'

const C = {
  primary:'#1a3a4a', teal:'#ADD8E6', tealDark:'#7BB8CC', tealLight:'#E8F6FA',
  accent:'#2a6478', sand:'#f7f4f0', text:'#1a2c35', text2:'#5a7280', border:'#dde8ec',
  danger:'#e24b4a', dangerLight:'#fef0f0', white:'#fff', bg:'#edf4f7',
  green:'#4ade80', greenLight:'#f0fdf4', greenBorder:'#86efac',
  yellow:'#facc15', yellowLight:'#fefce8', yellowBorder:'#fde68a',
  purple:'#a78bfa', purpleLight:'#f5f3ff', purpleBorder:'#c4b5fd'
}

function detectType(text: string): { type: 'vocab' | 'link' | 'note', meta: Record<string, any> } {
  const trimmed = text.trim()

  // YouTube link
  if (/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(trimmed)) {
    return { type: 'link', meta: { linkType: 'youtube', url: trimmed } }
  }

  // General link
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'link', meta: { linkType: 'web', url: trimmed } }
  }

  // Vocab: "word = word" or "word - word" or "word : word"
  const vocabMatch = trimmed.match(/^(.+?)\s*[=\-:]\s*(.+)$/)
  if (vocabMatch && vocabMatch[1].split(' ').length <= 4 && vocabMatch[2].split(' ').length <= 4) {
    return { type: 'vocab', meta: { word1: vocabMatch[1].trim(), word2: vocabMatch[2].trim() } }
  }

  return { type: 'note', meta: {} }
}

const typeConfig = {
  note:  { icon: '📝', label: 'Notiz',  bg: C.tealLight, border: C.tealDark },
  vocab: { icon: '🗂', label: 'Vokabel', bg: C.purpleLight, border: C.purpleBorder },
  link:  { icon: '🔗', label: 'Link',    bg: C.yellowLight, border: C.yellowBorder },
}

export default function NotesPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [userId, setUserId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [vocabSets, setVocabSets] = useState<VocabSet[]>([])
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState<'all' | 'note' | 'vocab' | 'link'>('all')
  const [saving, setSaving] = useState(false)
  const [actionNote, setActionNote] = useState<Note | null>(null)
  const [actionType, setActionType] = useState<'library' | 'vocab' | 'youtube' | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedSet, setSelectedSet] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

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
    const [{ data: n }, { data: f }, { data: vs }] = await Promise.all([
      supabase.from('notes').select('*').eq('workspace_id', wid).order('created_at', { ascending: false }),
      supabase.from('folders').select('*').eq('workspace_id', wid).order('name'),
      supabase.from('vocab_sets').select('*').eq('workspace_id', wid).order('name')
    ])
    setNotes(n || [])
    setFolders(f || [])
    setVocabSets(vs || [])
  }

  async function addNote() {
    if (!input.trim() || !userId || saving) return
    setSaving(true)
    const { type, meta } = detectType(input)
    await supabase.from('notes').insert({
      content: input.trim(),
      type,
      metadata: meta,
      workspace_id: workspaceId,
      created_by: userId
    })
    setInput('')
    setSaving(false)
    loadData(userId)
    inputRef.current?.focus()
  }

  async function deleteNote(id: string) {
    await supabase.from('notes').delete().eq('id', id)
    if (actionNote?.id === id) { setActionNote(null); setActionType(null) }
    loadData(userId)
  }

  async function moveToLibrary() {
    if (!actionNote || processing) return
    setProcessing(true)
    await supabase.from('texts').insert({
      title: actionNote.content.slice(0, 60),
      content: actionNote.content,
      folder_id: selectedFolder,
      workspace_id: workspaceId,
      created_by: userId,
      language: 'en',
      questions: [],
      vocabulary: []
    })
    await supabase.from('notes').update({ status: 'processed' }).eq('id', actionNote.id)
    setActionNote(null); setActionType(null); setSelectedFolder(null)
    setProcessing(false)
    loadData(userId)
  }

  async function moveToVocab() {
    if (!actionNote || !selectedSet || processing) return
    setProcessing(true)
    const meta = actionNote.metadata || {}
    await supabase.from('vocab_cards').insert({
      set_id: selectedSet,
      word_en: meta.word1 || actionNote.content,
      word_de: meta.word2 || '',
      synonyms: [],
      example_sentence: ''
    })
    await supabase.from('notes').update({ status: 'processed' }).eq('id', actionNote.id)
    setActionNote(null); setActionType(null); setSelectedSet(null)
    setProcessing(false)
    loadData(userId)
  }

  async function sendToYoutube() {
    if (!actionNote) return
    const url = actionNote.metadata?.url || actionNote.content
    await supabase.from('notes').update({ status: 'processed' }).eq('id', actionNote.id)
    router.push(`/youtube?url=${encodeURIComponent(url)}`)
  }

  const preview = detectType(input)
  const filtered = notes.filter(n => filter === 'all' || n.type === filter)
  const inboxCount = notes.filter(n => n.status === 'inbox').length

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Topbar */}
      <div style={{ background: C.primary, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '600px', margin: '0 auto' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: C.teal, fontSize: '18px', cursor: 'pointer', fontWeight: 600 }}>←</button>
        <span style={{ color: '#fff', fontSize: '15px', fontWeight: 700, flex: 1 }}>Quick Capture</span>
        {inboxCount > 0 && (
          <span style={{ background: C.teal, color: C.primary, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}>{inboxCount} offen</span>
        )}
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        {/* Input area */}
        <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: '12px', padding: '12px', marginBottom: '1rem' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
            placeholder="Notiz, Vokabel (house = Haus), oder YouTube-Link..."
            rows={2}
            style={{ width: '100%', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: '8px', fontSize: '14px', background: C.sand, outline: 'none', resize: 'none', lineHeight: '1.5', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            {input.trim() && (
              <span style={{ fontSize: '11px', color: C.text2, background: typeConfig[preview.type].bg, border: `1px solid ${typeConfig[preview.type].border}`, padding: '2px 8px', borderRadius: '6px' }}>
                {typeConfig[preview.type].icon} {typeConfig[preview.type].label}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={addNote}
              disabled={!input.trim() || saving}
              style={{ padding: '7px 16px', background: input.trim() ? C.primary : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? '...' : '+ Speichern'}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto' }}>
          {([['all', 'Alle', notes.length], ['note', '📝 Notizen', notes.filter(n => n.type === 'note').length], ['vocab', '🗂 Vokabeln', notes.filter(n => n.type === 'vocab').length], ['link', '🔗 Links', notes.filter(n => n.type === 'link').length]] as [typeof filter, string, number][]).map(([val, label, count]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{ padding: '6px 12px', background: filter === val ? C.primary : C.white, color: filter === val ? '#fff' : C.text2, border: `1px solid ${filter === val ? C.primary : C.border}`, borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: filter === val ? 600 : 400, whiteSpace: 'nowrap' }}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Notes list */}
        {filtered.map(note => {
          const tc = typeConfig[note.type]
          const isProcessed = note.status === 'processed'
          const isAction = actionNote?.id === note.id

          return (
            <div key={note.id} style={{ background: C.white, border: `1.5px solid ${isAction ? C.tealDark : C.border}`, borderRadius: '10px', padding: '10px 12px', marginBottom: '8px', opacity: isProcessed ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{tc.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: C.text, lineHeight: '1.5', wordBreak: 'break-word' }}>
                    {note.type === 'vocab' && note.metadata?.word1 ? (
                      <><strong>{note.metadata.word1}</strong> = {note.metadata.word2}</>
                    ) : note.type === 'link' && note.metadata?.url ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{note.metadata.url}</span>
                    ) : (
                      note.content
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: '#bbb', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>{new Date(note.created_at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    {isProcessed && <span style={{ color: C.green, fontWeight: 600 }}>verarbeitet</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {!isProcessed && (
                    <button
                      onClick={() => { setActionNote(isAction ? null : note); setActionType(null) }}
                      style={{ padding: '4px 8px', background: isAction ? C.tealLight : C.sand, border: `1px solid ${isAction ? C.tealDark : C.border}`, borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: C.text2 }}
                    >
                      {isAction ? '✕' : '...'}
                    </button>
                  )}
                  <button
                    onClick={() => deleteNote(note.id)}
                    style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '13px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Action panel */}
              {isAction && !isProcessed && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${C.border}` }}>
                  {!actionType && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => setActionType('library')} style={{ padding: '7px 12px', background: C.tealLight, border: `1px solid ${C.tealDark}`, borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: C.primary, fontWeight: 500 }}>
                        📖 In Bibliothek
                      </button>
                      {note.type === 'vocab' && (
                        <button onClick={() => setActionType('vocab')} style={{ padding: '7px 12px', background: C.purpleLight, border: `1px solid ${C.purpleBorder}`, borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#6d28d9', fontWeight: 500 }}>
                          🗂 Zu Vokabel-Set
                        </button>
                      )}
                      {note.type === 'link' && note.metadata?.linkType === 'youtube' && (
                        <button onClick={() => sendToYoutube()} style={{ padding: '7px 12px', background: C.yellowLight, border: `1px solid ${C.yellowBorder}`, borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#92400e', fontWeight: 500 }}>
                          ▶ YouTube zusammenfassen
                        </button>
                      )}
                    </div>
                  )}

                  {actionType === 'library' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={selectedFolder || ''} onChange={e => setSelectedFolder(e.target.value || null)} style={{ flex: 1, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: '7px', fontSize: '12px', background: C.sand }}>
                        <option value="">Kein Ordner</option>
                        {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                      </select>
                      <button onClick={moveToLibrary} disabled={processing} style={{ padding: '7px 14px', background: C.primary, color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        {processing ? '...' : 'Speichern'}
                      </button>
                    </div>
                  )}

                  {actionType === 'vocab' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={selectedSet || ''} onChange={e => setSelectedSet(e.target.value || null)} style={{ flex: 1, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: '7px', fontSize: '12px', background: C.sand }}>
                        <option value="">Set auswählen...</option>
                        {vocabSets.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                      </select>
                      <button onClick={moveToVocab} disabled={!selectedSet || processing} style={{ padding: '7px 14px', background: selectedSet ? '#6d28d9' : '#ccc', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        {processing ? '...' : 'Hinzufuegen'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: C.text2 }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📥</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Dein Eingangskorb ist leer</div>
            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
              Tippe oben eine Notiz, Vokabel oder einen Link ein.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
