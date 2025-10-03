import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Voice Assistant',
	description: 'Text to speech via OpenAI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen antialiased">
				{children}
			</body>
		</html>
	)
} 