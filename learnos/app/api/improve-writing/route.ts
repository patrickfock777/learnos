import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `You are an English writing coach. Analyze this text and respond ONLY with a JSON object, no markdown, no extra text:\n\n"${text}"\n\nRespond with exactly this structure:\n{"improved":"the improved version of the text","score":85,"feedback":[{"error":"original error","correction":"corrected version","explanation":"why this is wrong and how to remember the correct form"}]}` }]
    })
  })
  const data = await response.json()
  const raw = data.content[0].text.replace(/```json|```/g, '').trim()
  return NextResponse.json(JSON.parse(raw))
}
