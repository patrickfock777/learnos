import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { tense, difficulty } = await req.json()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Generate 5 English sentences for grammar practice. Tense: ${tense || 'mixed'}. Difficulty: ${difficulty || 2}/3. Respond ONLY with a JSON array, no markdown:\n[{"sentence":"She is working right now.","tense":"present_continuous","signal_words":["right now"],"explanation":"is + verb-ing = Present Continuous for actions happening now","difficulty":1}]` }]
    })
  })
  const data = await response.json()
  const raw = data.content[0].text.replace(/```json|```/g, '').trim()
  return NextResponse.json(JSON.parse(raw))
}
