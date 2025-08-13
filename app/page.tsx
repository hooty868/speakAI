"use client"

import { useRef, useState } from 'react'

const VOICES = [
	{ id: 'alloy', label: 'Alloy' },
	{ id: 'ash', label: 'Ash' },
	{ id: 'coral', label: 'Coral' },
	{ id: 'echo', label: 'Echo' },
	{ id: 'fable', label: 'Fable' },
	{ id: 'onyx', label: 'Onyx' },
	{ id: 'nova', label: 'Nova' },
	{ id: 'sage', label: 'Sage' },
	{ id: 'shimmer', label: 'Shimmer' },
]

export default function Page() {
	const [text, setText] = useState('')
	const [voice, setVoice] = useState(VOICES[0].id)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	async function speak() {
		if (!text.trim()) {
			setError('請先輸入文字')
			return
		}
		setError(null)
		setIsLoading(true)
		try {
			const res = await fetch('/api/tts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, voice }),
			})
			if (!res.ok) {
				const msg = await res.text()
				throw new Error(msg || '語音產生失敗')
			}
			const arrayBuffer = await res.arrayBuffer()
			const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
			const url = URL.createObjectURL(blob)
			if (audioRef.current) {
				audioRef.current.src = url
				audioRef.current.play()
			}
		} catch (e: any) {
			setError(e?.message || '發生錯誤')
		} finally {
			setIsLoading(false)
		}
	}

	function handleSpeak() {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}
		debounceRef.current = setTimeout(() => {
			void speak()
		}, 400)
	}

	return (
		<div className="bg-[var(--background-color)] text-[var(--text-primary)]">
			<div className="flex flex-col min-h-screen justify-between mx-auto max-w-md bg-white">
				<header className="flex items-center justify-between p-6">
					<div className="w-8" />
					<h1 className="text-xl font-semibold text-[var(--text-primary)] flex-grow text-center">Voice Assistant</h1>
					<button className="text-gray-400 hover:text-black" type="button" aria-label="Alert">
						<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
							<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
						</svg>
					</button>
				</header>

				<main className="flex-grow flex flex-col justify-center items-center px-6 w-full">
					<div className="w-full text-center">
						<label htmlFor="voice-input" className="text-base text-[var(--text-secondary)] transition-all duration-300">Say something...</label>
						<div className="relative mt-2">
							<textarea id="voice-input" className="input-premium text-left resize-y min-h-[120px]" placeholder="" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
							<div className="input-underline absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary-color)]" />
						</div>

						<div className="mt-6 flex items-center justify-center gap-3">
							<label htmlFor="voice-select" className="text-sm text-[var(--text-secondary)]">Voice</label>
							<select id="voice-select" className="rounded-md border-gray-300 text-sm" value={voice} onChange={(e) => setVoice(e.target.value)}>
								{VOICES.map(v => (
									<option key={v.id} value={v.id}>{v.label}</option>
								))}
							</select>
						</div>

						{error ? (
							<p className="mt-3 text-sm text-red-600">{error}</p>
						) : null}
					</div>
				</main>

				<footer className="p-6 space-y-4">
					<button onClick={handleSpeak} disabled={isLoading} className="w-20 h-20 flex items-center justify-center rounded-full bg-[var(--primary-color)] hover:bg-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl active:shadow-md transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-gray-300 focus:ring-opacity-50 mx-auto disabled:opacity-60">
						{isLoading ? (
							<svg className="animate-spin text-white" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
						) : (
							<svg className="text-white" fill="currentColor" height="32" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg">
								<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path>
							</svg>
						)}
					</button>
					<div className="text-center">
						<a className="text-sm text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:underline" href="#">Help</a>
					</div>
					<audio ref={audioRef} className="hidden" />
				</footer>
			</div>
		</div>
	)
} 