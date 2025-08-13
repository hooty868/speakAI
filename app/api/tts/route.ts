import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(request: Request) {
	try {
		const { text, voice } = await request.json()
		if (!process.env.OPENAI_API_KEY) {
			return new Response('Missing OPENAI_API_KEY', { status: 500 })
		}
		if (!text || typeof text !== 'string' || text.trim().length === 0) {
			return new Response('Invalid text', { status: 400 })
		}

		type OpenAIVoice = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer'
		const allowedVoices = new Set<OpenAIVoice>(['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'])
		const candidate: string = typeof voice === 'string' ? voice.trim() : ''
		const selectedVoice: OpenAIVoice = allowedVoices.has(candidate as OpenAIVoice) ? (candidate as OpenAIVoice) : 'alloy'

		const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

		const speech = await openai.audio.speech.create({
			model: 'gpt-4o-mini-tts',
			voice: selectedVoice,
			input: text,
		})

		const arrayBuffer = await speech.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)

		return new Response(buffer, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Content-Length': buffer.length.toString(),
				'Cache-Control': 'no-store',
				'Content-Disposition': 'inline; filename="speech.mp3"',
			},
		})
	} catch (err: any) {
		console.error(err)
		return new Response(err?.message || 'Server error', { status: 500 })
	}
} 