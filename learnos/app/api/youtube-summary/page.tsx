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

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Fetch YouTube page to get transcript data
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    })
    const html = await res.text()

    // Extract caption tracks from ytInitialPlayerResponse
    const match = html.match(/"captionTracks":(\[.*?\])/)
    if (!match) return null

    const tracks = JSON.parse(match[1])
    // Prefer English, fallback to first available
    const track = tracks.find((t: any) => t.languageCode === 'en') ||
                  tracks.find((t: any) => t.languageCode === 'en-US') ||
                  tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
                  tracks[0]

    if (!track?.baseUrl) return null

    const captionRes = await fetch(track.baseUrl)
    const xml = await captionRes.text()

    // Parse XML captions to plain text
    const textMatches = xml.match(/<text[^>]*>(.*?)<\/text>/g) || []
    const text = textMatches
      .map(t => t.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    return text.length > 100 ? text : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url, language = 'en', focus = '' } = await req.json()

    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Ungültige YouTube URL' }, { status: 400 })
    }

    // Get video title
    let videoTitle = 'YouTube Video'
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      const oembed = await oembedRes.json()
      videoTitle = oembed.title || videoTitle
    } catch {}

    // Get transcript
    const transcript = await fetchTranscript(videoId)
    if (!transcript) {
      return NextResponse.json({ error: 'Keine Untertitel verfügbar für dieses Video. Versuche ein anderes Video.' }, { status: 404 })
    }

    // Truncate if too long
    const truncated = transcript.length > 8000 ? transcript.slice(0, 8000) + '...' : transcript

    const langInstruction = language === 'de'
      ? 'Erstelle eine strukturierte Zusammenfassung auf DEUTSCH.'
      : 'Create a structured summary in ENGLISH.'

    const focusInstruction = focus.trim()
      ? `\n\nIMPORTANT FOCUS: The user specifically wants you to focus on: "${focus}"\nFilter and structure the summary with this focus in mind. Highlight information that is most relevant to this focus.`
      : ''

    const prompt = `You are summarizing a YouTube video transcript. ${langInstruction}${focusInstruction}

Video title: "${videoTitle}"

Transcript:
${truncated}

Create a clear, well-structured summary with:
1. A brief intro (2-3 sentences what the video is about)
2. The 5-8 most important key points (as clear paragraphs, not bullet points)${focus ? '\n3. A specific section: "Relevant for: ' + focus + '" with concrete takeaways' : ''}
${focus ? '4' : '3'}. A brief conclusion with the main takeaway

Write in flowing prose, professional tone. Respond ONLY with JSON (no markdown):
{"title":"suggested title for this summary","summary":"the full summary text"}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    })

    const data = await response.json()
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
    return NextResponse.json({ error: 'Fehler beim Verarbeiten. Bitte versuche es erneut.' }, { status: 500 })
  }
}
