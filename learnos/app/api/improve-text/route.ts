import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { text, mode, prompt: customPrompt } = await req.json()

  let prompt: string
  if (customPrompt) {
    prompt = `${customPrompt}\n\nText:\n"${text}"\n\nAntwort NUR als JSON (kein Markdown, kein Text davor oder danach): {"result":"der bearbeitete Text in der korrekten Sprache gemäß Anweisung"}`
  } else if (mode === 'translate') {
    prompt = `Translate this German text to professional Business English. Respond ONLY with JSON: {"result":"translated text"}\n\nText: "${text}"`
  } else {
    prompt = `Improve this English text to professional Business English. Keep the meaning exactly the same. Respond ONLY with JSON: {"result":"improved text"}\n\nText: "${text}"`
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
  })
  const data = await response.json()
  const raw = data.content[0].text.replace(/```json|```/g, '').trim()
  return NextResponse.json(JSON.parse(raw))
}
