// Regenerate src/lib/utils/pdfGenerators/embeddedAssets.js
//
// SvelteKit does not ship static/ into the Vercel serverless function bundle, so
// the in-app PDF renderer cannot read fonts/logo from disk in production. We
// instead subset Inter Display to Latin + French and base64-embed the five
// weights (plus the logo) into a JS module that travels inside the bundle.
//
// Prereq: fonttools (`python3 -m pip install --user fonttools`).
// Run:     node scripts/embed-pdf-assets.mjs
//
// Only re-run when the source fonts or logo change.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FONT_SRC = 'static/fonts/inter-display/ttf';
const LOGO_SRC = 'static/logos/psymatch-logo.png';
const OUT = 'src/lib/utils/pdfGenerators/embeddedAssets.js';

// Coverage must be GENEROUS: a glyph missing from the subset renders as blank,
// which in a clinical report silently changes meaning ("≥2-week" → "2-week").
// So keep all Latin, punctuation, math operators, arrows and symbols the font
// has. pyftsubset only retains codepoints the source font actually contains, so
// over-asking is free. glyph-coverage.test.js fails loudly if anything we
// realistically emit is still missing.
const UNICODES = [
	'U+0020-007E', // Basic Latin
	'U+00A0-00FF', // Latin-1 Supplement (French accents, °, ±, ×, ÷, ½…)
	'U+0100-017F', // Latin Extended-A (Œœ, Šš, Žž…)
	'U+0180-024F', // Latin Extended-B
	'U+02B0-02FF', // Spacing modifiers (primes)
	'U+0300-036F', // Combining diacritics (mark/mkmk features)
	'U+2000-206F', // General punctuation (dashes, curly quotes, •, …, †, ‰)
	'U+2070-209F', // Super/subscripts
	'U+20A0-20BF', // Currency
	'U+2100-214F', // Letterlike (™, №, ℃)
	'U+2150-218F', // Number forms (fractions)
	'U+2190-21FF', // Arrows
	'U+2200-22FF', // Math operators (≥, ≤, ≈, ≠, −, ∞)
	'U+2300-23FF', // Misc technical
	'U+25A0-25FF', // Geometric shapes
	'U+2600-26FF', // Misc symbols
	'U+2700-27BF' // Dingbats (✓)
].join(',');
const WEIGHTS = { regular: 'Regular', medium: 'Medium', semibold: 'SemiBold', bold: 'Bold', italic: 'Italic' };

const tmp = mkdtempSync(join(tmpdir(), 'inter-subset-'));
try {
	const fontEntries = [];
	let body = `// AUTO-GENERATED — do not edit by hand. Regenerate with: node scripts/embed-pdf-assets.mjs
//
// Inter Display (subset to Latin + French) and the PsyMatch logo, base64-embedded
// so the serverless PDF renderer needs NO filesystem access. SvelteKit does not
// ship static/ into the Vercel function bundle, so reading fonts from disk 500s
// in production — these Buffers travel inside the JS bundle and work everywhere.

const b64 = (s) => Buffer.from(s, 'base64');
`;

	for (const [key, name] of Object.entries(WEIGHTS)) {
		const out = join(tmp, `Inter-${name}.ttf`);
		execFileSync('python3', [
			'-m', 'fontTools.subset', join(FONT_SRC, `InterDisplay-${name}.ttf`),
			`--unicodes=${UNICODES}`,
			'--layout-features=kern,liga,calt,ccmp,mark,mkmk',
			'--no-hinting', '--desubroutinize', '--drop-tables+=DSIG',
			`--output-file=${out}`
		], { stdio: ['ignore', 'ignore', 'inherit'] });
		body += `\nconst _${key} = '${readFileSync(out).toString('base64')}';\n`;
		fontEntries.push(`\t${key}: b64(_${key})`);
	}

	body += `\nconst _logo = '${readFileSync(LOGO_SRC).toString('base64')}';\n`;
	body += `\nexport const FONTS = {\n${fontEntries.join(',\n')}\n};\n`;
	body += `\nexport const LOGO = b64(_logo);\n`;

	writeFileSync(OUT, body);
	console.log(`wrote ${OUT} (${(Buffer.byteLength(body) / 1024).toFixed(0)} KB)`);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
