// Guard against SILENT glyph loss in the embedded (subset) report fonts.
//
// The PDF fonts are subset to keep the serverless bundle small. A codepoint that
// is missing from the subset does NOT error — PDFKit renders it as blank. In a
// clinical report that silently changes meaning: "≥2-week period" becomes
// "2-week period". This test asserts every character we realistically emit has a
// glyph in every embedded weight, so a too-narrow subset fails the build instead
// of quietly corrupting a report.
//
// If this fails: widen UNICODES in scripts/embed-pdf-assets.mjs and regenerate.

import { describe, it, expect } from 'vitest';
import fontkit from 'fontkit';
import { FONTS } from '../utils/pdfGenerators/embeddedAssets.js';

// Characters a PsyMatch report can plausibly contain.
const REQUIRED = [
	// ASCII
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
	' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
	// French (both cases) — the FR variants of every format
	'àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ',
	'œŒæÆ«»',
	// Typography used by the templates
	'–—‘’“”•…‑‒', // – — ‘ ’ “ ” • … ‑ ‒
	' §†‡‰', // nbsp § † ‡ ‰
	// Clinical / statistical symbols — meaning-bearing, must never blank out
	'≥≤±×÷≈≠−∞', // ≥ ≤ ± × ÷ ≈ ≠ − ∞
	'°µ½¼¾№™©®', // ° µ ½ ¼ ¾ № ™ © ®
	'→✓' // → ✓
].join('');

const WEIGHTS = Object.keys(FONTS);

describe('embedded report fonts — glyph coverage', () => {
	for (const weight of WEIGHTS) {
		it(`${weight} has a glyph for every character a report can emit`, () => {
			const font = fontkit.create(FONTS[weight]);
			const missing = [];
			for (const ch of [...new Set([...REQUIRED])]) {
				const cp = ch.codePointAt(0);
				if (!font.hasGlyphForCodePoint(cp)) {
					missing.push(`${JSON.stringify(ch)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`);
				}
			}
			expect(missing, `missing glyphs in ${weight}: ${missing.join(', ')}`).toEqual([]);
		});
	}

	it('covers every character present in the render fixtures', async () => {
		const { SAMPLES } = await import('./__fixtures__/sampleReportData.js');
		// SAMPLES values are thunks — call them, or this assertion is vacuous.
		const text = JSON.stringify(Object.values(SAMPLES).map((make) => make()));
		const font = fontkit.create(FONTS.regular);
		const missing = new Set();
		for (const ch of new Set(text)) {
			const cp = ch.codePointAt(0);
			// Skip control chars; JSON escapes make those noise.
			if (cp < 0x20) continue;
			if (!font.hasGlyphForCodePoint(cp)) missing.add(`${ch} (U+${cp.toString(16).toUpperCase()})`);
		}
		expect([...missing]).toEqual([]);
	});
});
