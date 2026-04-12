import { NextRequest, NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (res.ok) {
      const data = await res.json()
      if (data.title) return data.title
    }
  } catch {}
  return 'YouTube Video'
}

async function fetchTranscript(videoId: string): Promise<{text:string, title:string} | null> {
  try {
    const title = await fetchVideoTitle(videoId)

    // Try English first, then any language
    let items
    try {
      items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
    } catch {
      try {
        items = await YoutubeTranscript.fetchTranscript(videoId)
      } catch {
        return null
      }
    }

    if (!items || items.length === 0) return null

    const text = items.map(i => i.text).join(' ')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&#39;/g,"'").replace(/&quot;/g,'"')
      .replace(/\s+/g, ' ').trim()

    return text.length > 100 ? { text, title } : null
  } catch (e) {
    console.error('Transcript fetch error:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url, language = 'en', focus = '', transcript: pastedTranscript, videoTitle: pastedTitle } = await req.json()

    // If transcript was pasted directly, skip YouTube fetching
    if (pastedTranscript) {
      const truncated = pastedTranscript.length > 10000 ? pastedTranscript.slice(0, 10000) + '...' : pastedTranscript
      const videoTitle = pastedTitle || 'YouTube Video'

      const langInstruction = language === 'de'
        ? 'Erstelle eine strukturierte Zusammenfassung auf DEUTSCH.'
        : 'Create a structured summary in ENGLISH.'

      const focusInstruction = focus.trim()
        ? `\n\nIMPORTANT FOCUS: "${focus}" - Filter and structure the summary with this focus. Add a specific section with concrete takeaways.`
        : ''

      const prompt = `You are summarizing a YouTube video transcript. ${langInstruction}${focusInstruction}

Video title: "${videoTitle}"

Transcript:
${truncated}

Create a clear summary with intro, 5-8 key points as paragraphs, and conclusion. Respond ONLY with JSON:
{"title":"suggested title","summary":"full summary text"}`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await response.json()
      const raw = data.content[0].text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(raw)
      return NextResponse.json({ videoId: '', videoTitle, suggestedTitle: result.title, summary: result.summary, transcriptLength: pastedTranscript.length })
    }

    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Ungültige YouTube URL. Bitte kopiere die vollständige URL aus dem Browser.' }, { status: 400 })
    }

    const transcriptData = await fetchTranscript(videoId)
    if (!transcriptData) {
      return NextResponse.json({
        error: 'Keine Untertitel gefunden. Mögliche Gründe: Das Video hat keine automatischen Untertitel, ist privat, oder YouTube blockiert den Zugriff gerade. Versuche ein anderes Video.'
      }, { status: 404 })
    }

    const { text: transcript, title: videoTitle } = transcriptData
    const truncated = transcript.length > 10000 ? transcript.slice(0, 10000) + '...' : transcript

    const langInstruction = language === 'de'
      ? 'Erstelle eine strukturierte Zusammenfassung auf DEUTSCH.'
      : 'Create a structured summary in ENGLISH.'

    const focusInstruction = focus.trim()
      ? `\n\nIMPORTANT FOCUS: The user specifically wants you to focus on: "${focus}"\nFilter and structure the summary with this focus in mind. Add a specific section with concrete takeaways related to this focus.`
      : ''

    const prompt = `You are summarizing a YouTube video transcript. ${langInstruction}${focusInstruction}

Video title: "${videoTitle}"

Transcript:
${truncated}

Create a clear, well-structured summary with:
1. A brief intro (2-3 sentences what the video is about)
2. The 5-8 most important key points as clear paragraphs
${focus ? `3. A section "Key Takeaways for: ${focus}" with concrete actionable points\n4.` : '3.'} A brief conclusion

Write in flowing prose, professional tone. Respond ONLY with JSON (no markdown):
{"title":"suggested title for this summary","summary":"the full summary text"}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    if (!data.content?.[0]?.text) {
      return NextResponse.json({ error: 'KI Fehler. Bitte versuche es erneut.' }, { status: 500 })
    }

    const raw = data.content[0].text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(raw)

    return NextResponse.json({
      videoId,
      videoTitle,
      suggestedTitle: result.title,
      summary: result.summary,
      transcriptLength: transcript.length
    })
  } catch (e) {
    console.error('YouTube summary error:', e)
    return NextResponse.json({ error: 'Unerwarteter Fehler. Bitte versuche es erneut.' }, { status: 500 })
  }
}
