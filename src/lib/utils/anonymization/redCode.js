// src/lib/utils/anonymization/redCode.js
//
// "RedCode" — reversible, coded PHI placeholders for the agentic report flow.
//
// The existing PDF-download redaction swaps PHI for realistic FAKE names and is
// intentionally one-way. The agent flow instead needs placeholders that:
//   1. survive an LLM rewriting the surrounding prose (opaque, atomic, JSON-safe),
//   2. carry a descriptor so the model writes natural language around them, and
//   3. reverse-map deterministically back to a display value afterwards.
//
// Token shape:   ⟦DESCRIPTOR_CODE⟧     e.g. ⟦NAME_OF_PATIENT_3F9Q7K2A⟧
//   - DESCRIPTOR  UPPER_SNAKE role label → the model treats it as an identifier
//                                          and never paraphrases/splits/translates it.
//   - CODE        hex of (patientId, value) → STABLE: same person ⇒ same token
//                 across requests; also the unique reverse key.
//   - ⟦ ⟧ are distinctive non-word delimiters, so possessives/punctuation attach
//     OUTSIDE the token (⟦…⟧'s) and reverse matching is exact.
//
// The structured map { code, token, desc, category, find, value } is snapshotted
// onto GenerativeReport.redCodeMap (the SOT) per request and reused to
// de-tokenize the returned report. `find` = original PHI (never sent to agent);
// `value` = what reversal restores (real value, or a generalized form for dates).

import { createHash } from 'node:crypto';

export const DELIM_OPEN = '⟦';
export const DELIM_CLOSE = '⟧';

// --- Backstop regexes (catch free-text contact PHI the profile missed) ------
export const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// North-American-ish phone numbers; deliberately broad.
export const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Stable, regex/JSON-safe code for a PHI value. Deterministic per
 * (patientId, value) so the same entity always maps to the same token.
 */
export function stableCode(patientId, value) {
	return createHash('sha256')
		.update(`${patientId}|${String(value).trim().toLowerCase()}`)
		.digest('hex')
		.slice(0, 8)
		.toUpperCase();
}

/** "Name of Patient" → "NAME_OF_PATIENT" (safe inside a regex/JSON token). */
export function descLabel(desc) {
	return String(desc || 'IDENTIFIER')
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'IDENTIFIER';
}

export function makeToken(desc, code) {
	return `${DELIM_OPEN}${descLabel(desc)}_${code}${DELIM_CLOSE}`;
}

const norm = (v) => String(v ?? '').trim();

/**
 * Build the redCode map from descriptor-carrying PHI entries. Entries are
 * derived from the AI redaction profile's `searchReplace` find-list
 * (see deriveEntriesFromSearchReplace).
 *
 * @param {object} args
 * @param {string} args.patientId
 * @param {Array<{value:string, desc:string, category?:string, reverseValue?:string}>} args.entries
 * @returns {Array<{code,token,desc,category,find,value}>} deduped by value, longest-find first.
 */
export function buildRedCodeMap({ patientId, entries = [] }) {
	const byValue = new Map();
	for (const e of entries) {
		const find = norm(e.value);
		if (find.length < 2) continue;
		const key = find.toLowerCase();
		if (byValue.has(key)) continue;
		const desc = e.desc || 'Identifier';
		const code = stableCode(patientId, find);
		byValue.set(key, {
			code,
			token: makeToken(desc, code),
			desc,
			category: e.category || 'other',
			find,
			value: e.reverseValue !== undefined ? e.reverseValue : find
		});
	}
	return [...byValue.values()].sort((a, b) => b.find.length - a.find.length);
}

/**
 * Derive descriptor-carrying PHI entries from the AI redaction profile's
 * `searchReplace` find-list. This is the SOLE source of the agent-flow token
 * map: the AI already discovered every PHI value and stored it as a find→replace
 * rule; we tag each `find` with a descriptor so it becomes a labelled token.
 *
 * Descriptor priority:
 *   1. the descriptor the AI generator stored on the rule (`s.desc`), because it
 *      knew the role (Name of Child, Phone of Emergency Contact, …);
 *   2. otherwise inferred from the rule shape (email / phone) and, when a known
 *      patient identifier is supplied, from a match against it (name / phone /
 *      email of patient);
 *   3. otherwise a generic "Identifying Detail".
 *
 * @param {Array<{find:string, desc?:string, category?:string}>} searchReplace - profile.searchReplace
 * @param {{name?:string, phone?:string, email?:string}} [knownPatient]
 * @returns {Array<{value:string, desc:string, category:string}>}
 */
export function deriveEntriesFromSearchReplace(searchReplace = [], knownPatient = {}) {
	const nameParts = new Set(
		norm(knownPatient.name)
			.toLowerCase()
			.split(/\s+/)
			.filter((t) => t.length >= 2)
	);
	const fullName = norm(knownPatient.name).toLowerCase();
	const phone = norm(knownPatient.phone).toLowerCase();
	const email = norm(knownPatient.email).toLowerCase();

	return (searchReplace || [])
		.filter((s) => s && s.find)
		.map((s) => {
			const f = norm(s.find);

			// 1) Trust the generator's stored descriptor when present.
			if (s.desc) {
				return { value: f, desc: s.desc, category: s.category || 'other' };
			}

			// 2/3) Infer for legacy / manually-added rules with no descriptor.
			const lf = f.toLowerCase();
			let desc = 'Identifying Detail';
			let category = 'other';

			if (email && lf === email) { desc = 'Email of Patient'; category = 'email'; }
			else if (phone && lf === phone) { desc = 'Phone of Patient'; category = 'phone'; }
			else if (fullName && lf === fullName) { desc = 'Name of Patient'; category = 'name'; }
			else if (nameParts.has(lf)) { desc = 'Name of Patient'; category = 'name'; }
			else if (EMAIL_RE.test(f)) { desc = 'Email Address'; category = 'email'; }
			else if (PHONE_RE.test(f)) { desc = 'Phone Number'; category = 'phone'; }
			EMAIL_RE.lastIndex = 0; PHONE_RE.lastIndex = 0;

			return { value: f, desc, category };
		});
}

/** Forward pairs (original PHI → token) for the shared deepReplace engine. */
export function forwardPairs(redCodeMap) {
	return redCodeMap
		.map((e) => ({ find: e.find, replace: e.token, caseSensitive: false }))
		.sort((a, b) => b.find.length - a.find.length);
}

/** Reverse pairs (token → display value). Exact, case-sensitive. */
export function reversePairs(redCodeMap) {
	return redCodeMap.map((e) => ({ find: e.token, replace: e.value, caseSensitive: true }));
}

/**
 * Mask pairs (token → readable de-identified label). Exact, case-sensitive.
 * Used for a *redacted* download: instead of restoring the real PHI, each token
 * becomes a bracketed label describing what was removed (e.g. `[Patient name]`),
 * so the file is shareable without exposing PHI. Falls back to category, then a
 * generic `[redacted]`.
 */
export function maskPairs(redCodeMap) {
	return redCodeMap.map((e) => ({
		find: e.token,
		replace: `[${e.desc || e.category || 'redacted'}]`,
		caseSensitive: true
	}));
}

// --- Generic immutable deep-walk over string leaves -------------------------

function mapStrings(data, fn) {
	if (data === null || data === undefined) return data;
	if (typeof data === 'string') return fn(data);
	if (Array.isArray(data)) return data.map((x) => mapStrings(x, fn));
	if (typeof data === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(data)) out[k] = mapStrings(v, fn);
		return out;
	}
	return data;
}

function forEachString(data, fn) {
	if (typeof data === 'string') return fn(data);
	if (Array.isArray(data)) return data.forEach((x) => forEachString(x, fn));
	if (data && typeof data === 'object') for (const v of Object.values(data)) forEachString(v, fn);
}

// --- Date generalization + tagging ------------------------------------------

/** Collapse a single date string to month+year / year. Natural, not suspicious. */
function generalizeDateString(s) {
	let out = s;
	out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo) => {
		const idx = Number(mo) - 1;
		return MONTHS[idx] ? `${MONTHS[idx]} ${y}` : y;
	});
	const monthAlt = MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|');
	out = out.replace(
		new RegExp(`\\b(${monthAlt})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'),
		(_m, mon, y) => {
			const full = MONTHS.find((m) => m.toLowerCase().startsWith(mon.toLowerCase().slice(0, 3)));
			return `${full || mon} ${y}`;
		}
	);
	out = out.replace(/\b\d{1,2}[/.]\d{1,2}[/.](\d{4})\b/g, (_m, y) => y);
	return out;
}

// Match an explicit date occurrence (ISO, "Month D, YYYY", numeric D/M/YYYY).
const DATE_OCCURRENCE_RE = new RegExp(
	[
		'\\b\\d{4}-\\d{2}-\\d{2}\\b',
		'\\b(?:' + MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|') +
			')\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b',
		'\\b\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}\\b'
	].join('|'),
	'gi'
);

/**
 * Walk the payload, replace each explicit date with a stable token, and return
 * the rewritten data plus the date entries (reverse value = generalized form,
 * so exact dates are intentionally NOT recoverable).
 *
 * @returns {{ data: any, entries: Array<{code,token,desc,category,find,value}> }}
 */
export function tokenizeDatesDeep(data, patientId) {
	const byDate = new Map();
	const out = mapStrings(data, (s) => {
		if (s.startsWith('Questionnaire.Config.')) return s;
		return s.replace(DATE_OCCURRENCE_RE, (match) => {
			const find = match.trim();
			const key = find.toLowerCase();
			let entry = byDate.get(key);
			if (!entry) {
				const code = stableCode(patientId, find);
				entry = {
					code,
					token: makeToken('Generalized Date', code),
					desc: 'Generalized Date',
					category: 'date',
					find,
					value: generalizeDateString(find)
				};
				byDate.set(key, entry);
			}
			return entry.token;
		});
	});
	return { data: out, entries: [...byDate.values()] };
}

/**
 * Backstop: tokenize emails/phones still present after profile + date passes.
 * Deterministic and reversible (value = the real contact value).
 *
 * @returns {Array<{code,token,desc,category,find,value}>}
 */
export function collectBackstop(data, patientId, existing = []) {
	const seen = new Set(existing.map((e) => norm(e.find).toLowerCase()));
	const found = new Map();
	const scan = (re, desc, category) => {
		forEachString(data, (s) => {
			const matches = s.match(re);
			if (!matches) return;
			for (const raw of matches) {
				const find = norm(raw);
				const key = find.toLowerCase();
				if (seen.has(key) || found.has(key)) continue;
				const code = stableCode(patientId, find);
				found.set(key, { code, token: makeToken(desc, code), desc, category, find, value: find });
			}
		});
	};
	scan(EMAIL_RE, 'Email Address', 'email');
	scan(PHONE_RE, 'Phone Number', 'phone');
	return [...found.values()].sort((a, b) => b.find.length - a.find.length);
}

/**
 * Residual-PHI scan: known PHI values STILL present after redaction
 * (word-boundary, case-insensitive). Non-empty ⇒ leak → fail closed.
 */
export function collectResidualPHI(data, knownValues = []) {
	const candidates = knownValues.map(norm).filter((v) => v.length >= 2);
	if (!candidates.length) return [];
	const hits = new Set();
	forEachString(data, (s) => {
		for (const v of candidates) {
			const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const prefix = /^\w/.test(v) ? '\\b' : '';
			const suffix = /\w$/.test(v) ? '\\b' : '';
			if (new RegExp(prefix + escaped + suffix, 'i').test(s)) hits.add(v);
		}
	});
	return [...hits];
}

/** Find leftover ⟦…⟧ tokens (e.g. in a returned report) for leak/QA checks. */
export function findResidualTokens(data) {
	const re = new RegExp(`${DELIM_OPEN}[A-Z0-9_]+${DELIM_CLOSE}`, 'g');
	const found = new Set();
	forEachString(data, (s) => {
		const m = s.match(re);
		if (m) m.forEach((t) => found.add(t));
	});
	return [...found];
}
