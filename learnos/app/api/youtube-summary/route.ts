import { NextRequest, NextResponse } from 'next/server'

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

async function fetchTranscript(videoUrl: string): Promise<{ text: string, title: string } | null> {
  try {
    const res = await fetch(
      `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&lang=en&text=true`,
      {
        headers: { 'x-api-key': process.env.SUPADATA_API_KEY! },
        signal: AbortSignal.timeout(15000)
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.content || data.content.length < 100) return null

    // Get video title via noembed
    let title = 'YouTube Video'
    try {
      const titleRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (titleRes.ok) {
        const titleData = await titleRes.json()
        if (titleData.title) title = titleData.title
      }
    } catch {}

    return { text: data.content, title }
  } catch {
    return null
  }
}

function buildPrompt(videoTitle: string, transcript: string, language: string, focus: string) {
  const truncated = transcript.length > 10000 ? transcript.slice(0, 10000) + '...' : transcript
  const langInstruction = language === 'de'
    ? 'Erstelle eine strukturierte Zusammenfassung auf DEUTSCH.'
    : 'Create a structured summary in ENGLISH.'
  const focusInstruction = focus.trim()
    ? `\n\nIMPORTANT FOCUS: The user specifically wants you to focus on: "${focus}"\nFilter and structure the summary with this focus in mind. Add a specific section with concrete takeaways related to this focus.`
    : ''

  return `You are summarizing a YouTube video transcript. ${langInstruction}${focusInstruction}

Video title: "${videoTitle}"

Transcript:
${truncated}

Create a clear, well-structured summary with:
1. A brief intro (2-3 sentences what the video is about)
2. The 5-8 most important key points as clear paragraphs
${focus ? `3. A section "Key Takeaways for: ${focus}" with concrete actionable points\n4.` : '3.'} A brief conclusion

Write in flowing prose, professional tone. Respond ONLY with JSON (no markdown):
{"title":"suggested title for this summary","summary":"the full summary text"}`
}

async function callClaude(prompt: string) {
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
  if (!data.content?.[0]?.text) return null
  const raw = data.content[0].text.replace(/```json|```/g, '').trim()
  return JSON.parse(raw)
}

export async function POST(req: NextRequest) {
  try {
    const { url, language = 'en', focus = '', transcript: pastedTranscript, videoTitle: pastedTitle } = await req.json()

    if (pastedTranscript) {
      const videoTitle = pastedTitle || 'YouTube Video'
      const prompt = buildPrompt(videoTitle, pastedTranscript, language, focus)
      const result = await callClaude(prompt)
      if (!result) return NextResponse.json({ error: 'KI Fehler. Bitte versuche es erneut.' }, { status: 500 })
      return NextResponse.json({ videoId: '', videoTitle, suggestedTitle: result.title, summary: result.summary, transcriptLength: pastedTranscript.length })
    }

    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Ungueltige YouTube URL.' }, { status: 400 })
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
    const transcriptData = await fetchTranscript(videoUrl)
    if (!transcriptData) {
      return NextResponse.json({
        error: 'TRANSCRIPT_NOT_FOUND',
        videoId,
        message: 'Transkript konnte nicht geladen werden. Das Video hat vermutlich keine Untertitel.'
      }, { status: 404 })
    }

    const { text: transcript, title: videoTitle } = transcriptData
    const prompt = buildPrompt(videoTitle, transcript, language, focus)
    const result = await callClaude(prompt)
    if (!result) return NextResponse.json({ error: 'KI Fehler. Bitte versuche es erneut.' }, { status: 500 })

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
