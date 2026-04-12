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

function matchAll(str: string, regex: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(str)) !== null) results.push(m)
  return results
}

function parseCaptionXml(xml: string): string[] {
  // Try <text> format (classic)
  const textMatches = matchAll(xml, /<text[^>]*>([\s\S]*?)<\/text>/g)
  if (textMatches.length > 0) {
    return textMatches.map(m => decodeEntities(m[1]).replace(/\n/g, ' ').trim()).filter(t => t.length > 0)
  }
  // Try <p><s> format (newer)
  const pMatches = matchAll(xml, /<p[^>]*>([\s\S]*?)<\/p>/g)
  if (pMatches.length > 0) {
    return pMatches.map(m => {
      const inner = m[1]
      const sTexts = matchAll(inner, /<s[^>]*>([^<]*)<\/s>/g).map(s => s[1]).join('')
      return decodeEntities(sTexts || inner.replace(/<[^>]+>/g, '')).trim()
    }).filter(t => t.length > 0)
  }
  return []
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

async function fetchCaptionFromTracks(tracks: any[]): Promise<string | null> {
  const track = tracks.find((t: any) => t.languageCode === 'en') ||
    tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
    tracks.find((t: any) => t.kind === 'asr') ||
    tracks[0]
  if (!track?.baseUrl) return null

  try {
    const res = await fetch(track.baseUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const xml = await res.text()
    const texts = parseCaptionXml(xml)
    const joined = texts.join(' ').replace(/\s+/g, ' ').trim()
    return joined.length > 100 ? joined : null
  } catch { return null }
}

// Strategy 1: InnerTube API with ANDROID client (least likely to be blocked)
async function fetchViaInnerTubeAndroid(videoId: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.44.38 (Linux; U; Android 14)'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '19.44.38' } },
        videoId
      }),
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const data = await res.json()
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!Array.isArray(tracks) || tracks.length === 0) return null
    return await fetchCaptionFromTracks(tracks)
  } catch { return null }
}

// Strategy 2: InnerTube API with IOS client
async function fetchViaInnerTubeIOS(videoId: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.ios.youtube/19.44.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'IOS', clientVersion: '19.44.38' } },
        videoId
      }),
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const data = await res.json()
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!Array.isArray(tracks) || tracks.length === 0) return null
    return await fetchCaptionFromTracks(tracks)
  } catch { return null }
}

// Strategy 3: Parse YouTube watch page HTML
async function fetchViaWatchPage(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const html = await res.text()

    if (html.includes('class="g-recaptcha"')) return null

    const captionMatch = html.match(/"captionTracks":(\[.*?\])/)
    if (!captionMatch) return null

    const tracks = JSON.parse(captionMatch[1])
    return await fetchCaptionFromTracks(tracks)
  } catch { return null }
}

async function fetchTranscript(videoId: string): Promise<{ text: string, title: string } | null> {
  const title = await fetchVideoTitle(videoId)

  // Try all strategies in order
  const strategies = [fetchViaInnerTubeAndroid, fetchViaInnerTubeIOS, fetchViaWatchPage]

  for (const strategy of strategies) {
    const text = await strategy(videoId)
    if (text) return { text, title }
  }

  return null
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

    // If transcript was pasted directly, skip YouTube fetching
    if (pastedTranscript) {
      const videoTitle = pastedTitle || 'YouTube Video'
      const prompt = buildPrompt(videoTitle, pastedTranscript, language, focus)
      const result = await callClaude(prompt)
      if (!result) return NextResponse.json({ error: 'KI Fehler. Bitte versuche es erneut.' }, { status: 500 })
      return NextResponse.json({ videoId: '', videoTitle, suggestedTitle: result.title, summary: result.summary, transcriptLength: pastedTranscript.length })
    }

    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Ungültige YouTube URL. Bitte kopiere die vollständige URL aus dem Browser.' }, { status: 400 })
    }

    const transcriptData = await fetchTranscript(videoId)
    if (!transcriptData) {
      return NextResponse.json({
        error: 'TRANSCRIPT_NOT_FOUND',
        videoId,
        videoTitle: await fetchVideoTitle(videoId),
        message: 'Transkript konnte nicht automatisch geladen werden. YouTube blockiert den Server-Zugriff bei manchen Videos.'
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
