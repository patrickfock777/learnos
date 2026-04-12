'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { Note, Folder, VocabSet } from '@/lib/types'
import BottomNav from '@/app/components/BottomNav'

function detectType(text: string): { type: 'vocab' | 'link' | 'note', meta: Record<string, any> } {
  const trimmed = text.trim()
  if (/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(trimmed)) {
    return { type: 'link', meta: { linkType: 'youtube', url: trimmed } }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'link', meta: { linkType: 'web', url: trimmed } }
  }
  const vocabMatch = trimmed.match(/^(.+?)\s*[=\-:]\s*(.+)$/)
  if (vocabMatch && vocabMatch[1].split(' ').length <= 4 && vocabMatch[2].split(' ').length <= 4) {
    return { type: 'vocab', meta: { word1: vocabMatch[1].trim(), word2: vocabMatch[2].trim() } }
  }
  return { type: 'note', meta: {} }
}

const typeStyles = {
  note:  { icon: '📝', label: 'Notiz',  color: '#00e5c8', bg: 'rgba(0,229,200,0.1)', border: 'rgba(0,229,200,0.3)' },
  vocab: { icon: '🗂', label: 'Vokabel', color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)' },
  link:  { icon: '🔗', label: 'Link',    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' },
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
    setNotes(n || []); setFolders(f || []); setVocabSets(vs || [])
  }

  async function addNote() {
    if (!input.trim() || !userId || saving) return
    setSaving(true)
    const { type, meta } = detectType(input)
    await supabase.from('notes').insert({ content: input.trim(), type, metadata: meta, workspace_id: workspaceId, created_by: userId })
    setInput(''); setSaving(false); loadData(userId)
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
    await supabase.from('texts').insert({ title: actionNote.content.slice(0, 60), content: actionNote.content, folder_id: selectedFolder, workspace_id: workspaceId, created_by: userId, language: 'en', questions: [], vocabulary: [] })
    await supabase.from('notes').update({ status: 'processed' }).eq('id', actionNote.id)
    setActionNote(null); setActionType(null); setSelectedFolder(null); setProcessing(false); loadData(userId)
  }

  async function moveToVocab() {
    if (!actionNote || !selectedSet || processing) return
    setProcessing(true)
    const meta = actionNote.metadata || {}
    await supabase.from('vocab_cards').insert({ set_id: selectedSet, word_en: meta.word1 || actionNote.content, word_de: meta.word2 || '', synonyms: [], example_sentence: '' })
    await supabase.from('notes').update({ status: 'processed' }).eq('id', actionNote.id)
    setActionNote(null); setActionType(null); setSelectedSet(null); setProcessing(false); loadData(userId)
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
    <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#e8ecf4', letterSpacing: '-0.5px' }}>Quick Capture</h1>
            <p style={{ fontSize: '13px', color: '#5a6478', marginTop: '2px' }}>
              {inboxCount > 0 ? `${inboxCount} Einträge im Eingang` : 'Dein Eingangskorb ist leer'}
            </p>
          </div>
          <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #00e5c8, #a855f7)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚡</div>
        </div>

        {/* Input Card */}
        <div style={{ background: '#141a2e', border: '1px solid #2a3050', borderRadius: '16px', padding: '14px', marginBottom: '16px' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
            placeholder="Notiz, Vokabel (house = Haus), oder Link..."
            rows={2}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #2a3050', borderRadius: '10px', fontSize: '15px', background: '#0a0e1a', color: '#e8ecf4', outline: 'none', resize: 'none', lineHeight: '1.5', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            {input.trim() && (
              <span style={{ fontSize: '11px', color: typeStyles[preview.type].color, background: typeStyles[preview.type].bg, border: `1px solid ${typeStyles[preview.type].border}`, padding: '3px 10px', borderRadius: '8px', fontWeight: 600 }}>
                {typeStyles[preview.type].icon} {typeStyles[preview.type].label}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={addNote}
              disabled={!input.trim() || saving}
              style={{ padding: '8px 20px', background: input.trim() ? 'linear-gradient(135deg, #00e5c8, #00b8a0)' : '#2a3050', color: input.trim() ? '#0a0e1a' : '#5a6478', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              {saving ? '...' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto' }}>
          {([['all', 'Alle', notes.length], ['note', '📝 Notizen', notes.filter(n => n.type === 'note').length], ['vocab', '🗂 Vokabeln', notes.filter(n => n.type === 'vocab').length], ['link', '🔗 Links', notes.filter(n => n.type === 'link').length]] as [typeof filter, string, number][]).map(([val, label, count]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{ padding: '6px 14px', background: filter === val ? 'rgba(0,229,200,0.15)' : '#141a2e', color: filter === val ? '#00e5c8' : '#5a6478', border: `1px solid ${filter === val ? 'rgba(0,229,200,0.3)' : '#2a3050'}`, borderRadius: '10px', fontSize: '12px', cursor: 'pointer', fontWeight: filter === val ? 600 : 400, whiteSpace: 'nowrap' }}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Notes list */}
      <div className="page-content" style={{ maxWidth: '600px', margin: '0 auto', padding: '0 16px' }}>
        {filtered.map(note => {
          const ts = typeStyles[note.type]
          const isProcessed = note.status === 'processed'
          const isAction = actionNote?.id === note.id

          return (
            <div key={note.id} style={{ background: '#141a2e', border: `1.5px solid ${isAction ? 'rgba(0,229,200,0.4)' : '#2a3050'}`, borderRadius: '12px', padding: '12px 14px', marginBottom: '8px', opacity: isProcessed ? 0.4 : 1, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', background: ts.bg, border: `1px solid ${ts.border}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{ts.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: '#e8ecf4', lineHeight: '1.5', wordBreak: 'break-word' }}>
                    {note.type === 'vocab' && note.metadata?.word1 ? (
                      <><span style={{ color: '#a855f7', fontWeight: 600 }}>{note.metadata.word1}</span> <span style={{ color: '#5a6478' }}>=</span> <span style={{ fontWeight: 600 }}>{note.metadata.word2}</span></>
                    ) : note.type === 'link' ? (
                      <span style={{ color: '#fbbf24', fontSize: '13px' }}>{note.metadata?.url || note.content}</span>
                    ) : note.content}
                  </div>
                  <div style={{ fontSize: '11px', color: '#3a4458', marginTop: '4px' }}>
                    {new Date(note.created_at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {isProcessed && <span style={{ color: '#4ade80', marginLeft: '8px', fontWeight: 600 }}>verarbeitet</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {!isProcessed && (
                    <button onClick={() => { setActionNote(isAction ? null : note); setActionType(null) }} style={{ padding: '4px 8px', background: isAction ? 'rgba(0,229,200,0.15)' : 'transparent', border: `1px solid ${isAction ? 'rgba(0,229,200,0.3)' : '#2a3050'}`, borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: isAction ? '#00e5c8' : '#5a6478' }}>
                      {isAction ? '✕' : '···'}
                    </button>
                  )}
                  <button onClick={() => deleteNote(note.id)} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#2a3050', fontSize: '14px' }}>✕</button>
                </div>
              </div>

              {/* Action panel */}
              {isAction && !isProcessed && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #2a3050' }}>
                  {!actionType && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => setActionType('library')} style={{ padding: '8px 14px', background: 'rgba(0,229,200,0.1)', border: '1px solid rgba(0,229,200,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#00e5c8', fontWeight: 600 }}>
                        📖 Bibliothek
                      </button>
                      {note.type === 'vocab' && (
                        <button onClick={() => setActionType('vocab')} style={{ padding: '8px 14px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#a855f7', fontWeight: 600 }}>
                          🗂 Vokabel-Set
                        </button>
                      )}
                      {note.type === 'link' && note.metadata?.linkType === 'youtube' && (
                        <button onClick={() => sendToYoutube()} style={{ padding: '8px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#fbbf24', fontWeight: 600 }}>
                          ▶ YouTube
                        </button>
                      )}
                    </div>
                  )}
                  {actionType === 'library' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={selectedFolder || ''} onChange={e => setSelectedFolder(e.target.value || null)} style={{ flex: 1, padding: '8px 10px', border: '1px solid #2a3050', borderRadius: '8px', fontSize: '12px', background: '#0a0e1a', color: '#e8ecf4' }}>
                        <option value="">Kein Ordner</option>
                        {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                      </select>
                      <button onClick={moveToLibrary} disabled={processing} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #00e5c8, #00b8a0)', color: '#0a0e1a', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        {processing ? '...' : 'OK'}
                      </button>
                    </div>
                  )}
                  {actionType === 'vocab' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={selectedSet || ''} onChange={e => setSelectedSet(e.target.value || null)} style={{ flex: 1, padding: '8px 10px', border: '1px solid #2a3050', borderRadius: '8px', fontSize: '12px', background: '#0a0e1a', color: '#e8ecf4' }}>
                        <option value="">Set wählen...</option>
                        {vocabSets.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                      </select>
                      <button onClick={moveToVocab} disabled={!selectedSet || processing} style={{ padding: '8px 16px', background: selectedSet ? 'linear-gradient(135deg, #a855f7, #8b5cf6)' : '#2a3050', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        {processing ? '...' : 'OK'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#5a6478' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📥</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#8892a8', marginBottom: '6px' }}>Eingangskorb leer</div>
            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>Tippe oben eine Notiz, Vokabel oder einen Link ein.</div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
