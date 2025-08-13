import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Voice Assistant',
	description: 'Text to speech via OpenAI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className="bg-[var(--background-color)] text-[var(--text-primary)] min-h-screen">{children}</body>
		</html>
	)
} 