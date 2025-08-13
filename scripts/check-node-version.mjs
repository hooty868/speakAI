import process from 'node:process'

function parseRange(range) {
	// very small parser for ">=x.y.z <a" form
	const parts = range.split(' ').filter(Boolean)
	const gte = parts.find(p => p.startsWith('>='))?.slice(2)
	const lt = parts.find(p => p.startsWith('<'))?.slice(1)
	return { gte, lt }
}

function compare(a, b) {
	const pa = a.split('.').map(n => parseInt(n, 10))
	const pb = b.split('.').map(n => parseInt(n, 10))
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) > (pb[i] || 0)) return 1
		if ((pa[i] || 0) < (pb[i] || 0)) return -1
	}
	return 0
}

function satisfies(version, range) {
	const { gte, lt } = parseRange(range)
	if (gte && compare(version, gte) < 0) return false
	if (lt && compare(version, lt) >= 0) return false
	return true
}

const enginesRange = '>=18.17.0 <21'
const current = process.versions.node

if (!satisfies(current, enginesRange)) {
	console.error(`Unsupported Node.js version: ${current}. Required: ${enginesRange}`)
	process.exit(1)
}

console.log(`Node.js ${current} satisfies ${enginesRange}`) 