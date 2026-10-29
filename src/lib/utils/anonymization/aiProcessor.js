// src/lib/utils/anonymization/aiProcessor.js
import { invokeBedrock } from './bedrockClient.js';
import { detectEntities } from './comprehendClient.js';

const TEST_MODE = typeof process !== 'undefined' && !!process.env.TEMPLATE_N;

// Single-pass redaction — chunked into batches of 5 fields.

/**
 * Returns true if a chunk result has the correct shape and only contains IDs from expectedIds.
 */
function validateChunkResponse(result, expectedIds) {
	const r = result?.result;
	if (!r || !Array.isArray(r.rewritten) || !Array.isArray(r.discoveries)) return false;
	const valid = new Set(expectedIds);
	for (const entry of r.rewritten) {
		if (!entry.id || !valid.has(entry.id) || typeof entry.text !== 'string') return false;
	}
	return true;
}

// Narrative free-text fields — all sent together in Pass 1
const FREE_TEXT_FIELDS = [
	'q28', 'q30', 'q31', 'q32', 'q34', 'q35', 'q37', 'q38',
	'q39', 'q40', 'q42', 'q43', 'q47', 'q48', 'q49', 'q51', 'q52'
];

/**
 * Safely extracts deeply nested embedded fields from the Adult Bio structure
 */
function extractEmbeddedFreeText(responsesArray) {
	const embedded = {};

	// Q10: Emergency contact — name, notes (email handled algorithmically)
	const q10 = responsesArray.find(r => r.questionId === 'q10');
	if (q10?.value?.name) embedded['q10_name'] = q10.value.name;
	if (q10?.value?.notes && typeof q10.value.notes === 'string') embedded['q10_notes'] = q10.value.notes;

	// Q16: Children — send each child's details field for redaction
	const q16 = responsesArray.find(r => r.questionId === 'q16');
	if (q16?.value && Array.isArray(q16.value)) {
		q16.value.forEach((child, i) => {
			if (child.details && typeof child.details === 'string') {
				embedded[`q16_${i}_details`] = child.details;
			}
		});
	}

	// Q12: Career — both trainedOccupation and currentOccupation
	const q12 = responsesArray.find(r => r.questionId === 'q12');
	if (q12?.value) {
		if (typeof q12.value === 'string') {
			embedded['q12_occupation'] = q12.value;
		} else {
			if (q12.value.currentOccupation) embedded['q12_occupation'] = q12.value.currentOccupation;
			if (q12.value.trainedOccupation) embedded['q12_trained'] = q12.value.trainedOccupation;
		}
	}

	// Q15: Partner occupation (plain string)
	const q15 = responsesArray.find(r => r.questionId === 'q15');
	if (q15?.value && typeof q15.value === 'string') embedded['q15_partner_occupation'] = q15.value;

	// Q17: Family doctor — full value sent to AI so clinic/location context is also redacted
	const q17 = responsesArray.find(r => r.questionId === 'q17');
	if (q17?.value && typeof q17.value === 'string') embedded['q17_doctor'] = q17.value;

	// Q18: Medications — send both doctor field and prescribedFor for each medication
	const q18 = responsesArray.find(r => r.questionId === 'q18');
	if (q18?.value && Array.isArray(q18.value)) {
		q18.value.forEach((med, i) => {
			if (med.doctor && typeof med.doctor === 'string') {
				embedded[`q18_${i}_doctor`] = med.doctor;
			}
			if (med.prescripedFor && typeof med.prescripedFor === 'string') {
				embedded[`q18_${i}_prescribed`] = med.prescripedFor;
			}
		});
	}

	// Q19 details — { answer, details: { details: "..." } }
	const q19 = responsesArray.find(r => r.questionId === 'q19');
	if (q19?.value?.details?.details && typeof q19.value.details.details === 'string') embedded['q19_details'] = q19.value.details.details;

	// Q20 details — { answer, details: { reason, length } }
	const q20 = responsesArray.find(r => r.questionId === 'q20');
	if (q20?.value?.details?.reason && typeof q20.value.details.reason === 'string') embedded['q20_details'] = q20.value.details.reason;
	if (q20?.value?.details?.length && typeof q20.value.details.length === 'string') embedded['q20_length'] = q20.value.details.length;

	// Q21 details — reason, length, location
	const q21 = responsesArray.find(r => r.questionId === 'q21');
	if (q21?.value?.details) {
		if (q21.value.details.reason && typeof q21.value.details.reason === 'string') embedded['q21_reason'] = q21.value.details.reason;
		if (q21.value.details.length && typeof q21.value.details.length === 'string') embedded['q21_length'] = q21.value.details.length;
		if (q21.value.details.location && typeof q21.value.details.location === 'string') embedded['q21_location'] = q21.value.details.location;
	}

	// Q22 details
	const q22 = responsesArray.find(r => r.questionId === 'q22');
	if (q22?.value?.details?.location && typeof q22.value.details.location === 'string') embedded['q22_location'] = q22.value.details.location;

	// Q24: Alcohol — amount and frequency
	const q24 = responsesArray.find(r => r.questionId === 'q24');
	if (q24?.value?.details?.amount) embedded['q24_alcohol'] = q24.value.details.amount;
	if (q24?.value?.details?.frequency) embedded['q24_frequency'] = q24.value.details.frequency;

	// Q25: Cannabis — amount and frequency
	const q25 = responsesArray.find(r => r.questionId === 'q25');
	if (q25?.value?.details?.amount) embedded['q25_cannabis'] = q25.value.details.amount;
	if (q25?.value?.details?.frequency) embedded['q25_frequency'] = q25.value.details.frequency;

	// Q26: Stimulants — amount and frequency
	const q26 = responsesArray.find(r => r.questionId === 'q26');
	if (q26?.value?.details?.amount) embedded['q26_amount'] = q26.value.details.amount;
	if (q26?.value?.details?.frequency) embedded['q26_frequency'] = q26.value.details.frequency;

	// Q27: Other drugs — amount and frequency
	const q27 = responsesArray.find(r => r.questionId === 'q27');
	if (q27?.value?.details?.amount) embedded['q27_amount'] = q27.value.details.amount;
	if (q27?.value?.details?.frequency) embedded['q27_frequency'] = q27.value.details.frequency;

	// Q36: Social interactions — both describe and meetupFrequency
	const q36 = responsesArray.find(r => r.questionId === 'q36');
	if (q36?.value?.describe && typeof q36.value.describe === 'string') embedded['q36_describe'] = q36.value.describe;
	if (q36?.value?.meetupFrequency && typeof q36.value.meetupFrequency === 'string') embedded['q36_meetup'] = q36.value.meetupFrequency;

	// Q44: Adoption details — send free-text age field when answer is "true"
	const q44 = responsesArray.find(r => r.questionId === 'q44');
	if (q44?.value?.answer === 'true' && q44?.value?.details?.age && typeof q44.value.details.age === 'string') {
		embedded['q44_details'] = q44.value.details.age;
	}

	// Q45: Caregivers — send all four fields for comprehensive redaction
	const q45 = responsesArray.find(r => r.questionId === 'q45');
	if (q45?.value?.primaryCaregiverRelationship)   embedded['q45_primary_caregiver']   = q45.value.primaryCaregiverRelationship;
	if (q45?.value?.secondaryCaregiverRelationship) embedded['q45_secondary_caregiver'] = q45.value.secondaryCaregiverRelationship;
	if (q45?.value?.primaryCaregiverOccupation)     embedded['q45_primary_occ']         = q45.value.primaryCaregiverOccupation;
	if (q45?.value?.secondaryCaregiverOccupation)   embedded['q45_secondary_occ']       = q45.value.secondaryCaregiverOccupation;

	// Q50: Religion — religionName
	const q50 = responsesArray.find(r => r.questionId === 'q50');
	if (q50?.value?.religionName && typeof q50.value.religionName === 'string') embedded['q50_religion'] = q50.value.religionName;

	return embedded;
}

/**
 * Processes all AI-destined fields through a 4-pass architecture:
 *   Pass 1 — Full redaction of all fields in one JSON batch (embedded + narrative)
 *   Pass 2 — Residual audit: ORIGINAL vs Pass-1 output → additional_replacements → apply
 *   Pass 3 — Residual audit: ORIGINAL vs Pass-2 output → additional_replacements → apply
 *   Pass 4 — Residual audit: ORIGINAL vs Pass-3 output → additional_replacements → apply
 *
 * Each field in the return value carries a `passes` array indicating which passes modified it.
 *
 * @param {Array}  responses         - Full Adult Bio response array
 * @param {Object} algorithmicResult - The deterministic map we generated in step 1
 * @param {string} regenerateReason  - Optional reviewer note injected into Pass 1 prompt
 * @returns {Promise<Object>}
 */
export async function processWithAI(responses, algorithmicResult, regenerateReason = '', onProgress = null) {
	const MAX_PROCESS_RETRIES = 2;
	for (let processAttempt = 0; processAttempt <= MAX_PROCESS_RETRIES; processAttempt++) {
	try {
		// ── 1. Build knownMappings as a JSON array ───────────────────────────────────
		const knownMappings = [];

		if (algorithmicResult.familyDoctor?.original) {
			knownMappings.push({
				original:  algorithmicResult.familyDoctor.original,
				pseudonym: algorithmicResult.familyDoctor.transformed
			});
		}
		algorithmicResult.prescribedBy.forEach(doc => {
			if (doc.original) {
				knownMappings.push({ original: doc.original, pseudonym: doc.transformed });
			}
		});

		const pOrigFirst = algorithmicResult.patientName?.original?.firstName;
		const pOrigLast  = algorithmicResult.patientName?.original?.lastName;
		const pNewFirst  = algorithmicResult.patientName?.transformed?.firstName || 'Patient';
		const pNewLast   = algorithmicResult.patientName?.transformed?.lastName  || 'A.';

		if (pOrigFirst && pOrigLast) {
			knownMappings.push({ original: `${pOrigFirst} ${pOrigLast}`, pseudonym: `${pNewFirst} ${pNewLast}` });
			knownMappings.push({ original: pOrigFirst, pseudonym: pNewFirst });
			knownMappings.push({ original: pOrigLast,  pseudonym: pNewLast });
		}

		const RELATED_FIRST_NAMES = ['Owen', 'Grace', 'Felix', 'Petra', 'Hugo', 'Cora', 'Miles', 'Dara', 'Noel', 'Rachel', 'Victor', 'Sage'];
		let relatedNameIdx = 0;

		algorithmicResult.relatedPersons?.forEach(person => {
			if (!person.original) return;
			if (person.transformed) {
				// Children — algo already computed the full pseudonym
				knownMappings.push({
					original:  person.original,
					pseudonym: person.transformed,
					note:      person.relationship
				});
			} else {
				// Others (e.g. emergency contact) — assign explicit pseudonym from pool
				const newFirst = RELATED_FIRST_NAMES[relatedNameIdx++ % RELATED_FIRST_NAMES.length];
				knownMappings.push({
					original:  person.original,
					pseudonym: `${newFirst} ${pNewLast}`,
					note:      person.relationship
				});
			}
		});

		// ── 2. Collect all fields destined for AI ────────────────────────────────────
		const embeddedTexts = extractEmbeddedFreeText(responses);
		const allFields = [];   // { id, text }

		Object.entries(embeddedTexts).forEach(([key, val]) => {
			if (val) allFields.push({ id: key, text: val });
		});
		responses.forEach(r => {
			if (r.value && typeof r.value === 'string' && FREE_TEXT_FIELDS.includes(r.questionId)) {
				allFields.push({ id: r.questionId, text: r.value });
			}
		});

		if (allFields.length === 0) {
			const zeroUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
			return {
				success: true,
				data: { rewritten: [], discoveries: [] },
				usage: { pass1: zeroUsage, total: zeroUsage },
				discoveries: [],
				additionalSearchReplace: []
			};
		}

		// ── 2.5 Fix A: Add q16 children names to knownMappings ──────────────────────
		const q16 = responses.find(r => r.questionId === 'q16');
		if (q16?.value && Array.isArray(q16.value)) {
			q16.value.forEach(child => {
				if (child.name && typeof child.name === 'string') {
					const alreadyMapped = knownMappings.some(
						m => m.original === child.name || m.original.includes(child.name)
					);
					if (!alreadyMapped) {
						const newFirst = RELATED_FIRST_NAMES[relatedNameIdx++ % RELATED_FIRST_NAMES.length];
						knownMappings.push({
							original:  child.name,
							pseudonym: `${newFirst} ${pNewLast}`,
							note:      'child'
						});
					}
				}
			});
		}

		// ── 2.7 Comprehend Pre-Pass: Discover all PII in free text ───────────────────
		let comprehendCharCount = 0;  // track for cost estimation
		const COMPREHEND_NAME_POOL = [
			'Marta Lindström', 'Henrik Callahan', 'Elise Boudreau', 'Dominic Hartley',
			'Noor Sánchez', 'Astrid Johansson', 'Colette Tremblay', 'Stefan Novak',
			'Ingrid Morel', 'Jonas Eriksson', 'Sylvie Fontaine', 'Marcus Delacroix',
			'Anika Petrov', 'Lucien Moreau', 'Bianca Sorensen', 'Tariq Osman',
			'Freya Lindqvist', 'Oscar Muñoz', 'Leila Bergman', 'Rami Khoury'
		];
		const COMPREHEND_FIRST_POOL = [
			'Marta', 'Henrik', 'Elise', 'Dominic', 'Noor', 'Astrid', 'Colette',
			'Stefan', 'Ingrid', 'Jonas', 'Sylvie', 'Marcus', 'Anika', 'Lucien',
			'Bianca', 'Tariq', 'Freya', 'Oscar', 'Leila', 'Rami'
		];
		let comprehendNameIdx = 0;
		let comprehendFirstIdx = 0;

		// Build set of already-known originals (lowercase) to avoid duplicates
		const knownOriginals = new Set(knownMappings.map(m => m.original.toLowerCase()));
		// Also track all original first/last name tokens for the survivor scan
		const allOriginalTokens = new Set();
		knownMappings.forEach(m => {
			allOriginalTokens.add(m.original);
			m.original.split(/\s+/).forEach(tok => {
				if (tok.length > 2) allOriginalTokens.add(tok);
			});
		});

		// Collect medication names to filter false positives
		const medicationNames = new Set();
		const q18 = responses.find(r => r.questionId === 'q18');
		if (q18?.value && Array.isArray(q18.value)) {
			q18.value.forEach(med => {
				if (med.name) {
					med.name.split(/[\s()\/]+/).forEach(tok => {
						if (tok.length > 2) medicationNames.add(tok.toLowerCase());
					});
				}
			});
		}

		// Concatenate all field texts for a single Comprehend call
		const SEPARATOR = '\n|||FIELD_SEP|||\n';
		const concatenated = allFields.map(f => f.text).join(SEPARATOR);
		const comprehendEntities = [];

		// Generic labels for ORGANIZATION entities by keyword
		const ORG_LABEL_RULES = [
			{ keywords: ['school', 'academy', 'elementary', 'junior', 'senior', 'high school', 'preschool', 'kindergarten', 'montessori'], label: 'a local school' },
			{ keywords: ['university', 'college', 'institute of technology'], label: 'a university' },
			{ keywords: ['hospital', 'medical centre', 'medical center', 'children\'s hospital', 'health centre', 'health center'], label: 'a local hospital' },
			{ keywords: ['clinic', 'medical clinic'], label: 'a local clinic' },
			{ keywords: ['centre', 'center', 'treatment', 'rehab', 'recovery', 'wellness'], label: 'a treatment centre' },
			{ keywords: ['court', 'courthouse', 'law courts'], label: 'a court' },
			{ keywords: ['institution', 'prison', 'penitentiary', 'correctional'], label: 'a correctional facility' },
			{ keywords: ['firm', 'llp', 'llc', 'law office', 'legal'], label: 'a law firm' },
			{ keywords: ['church', 'temple', 'mosque', 'synagogue', 'cathedral'], label: 'a place of worship' },
			{ keywords: ['restaurant', 'cafe', 'café', 'bistro', 'bar', 'pub', 'grill'], label: 'a restaurant' },
			{ keywords: ['hotel', 'resort', 'inn', 'lodge'], label: 'a hotel' },
			{ keywords: ['park', 'garden', 'trail', 'recreation'], label: 'a local park' },
		];
		const DEFAULT_ORG_LABEL = 'an organization';

		function getOrgLabel(orgText) {
			const lower = orgText.toLowerCase();
			for (const rule of ORG_LABEL_RULES) {
				if (rule.keywords.some(kw => lower.includes(kw))) return rule.label;
			}
			return DEFAULT_ORG_LABEL;
		}

		// Track detected locations, orgs, and digit-bearing OTHER entities for deterministic replacement
		const detectedLocations = [];    // { text, label }
		const detectedOrgs = [];         // { text, label }
		const detectedOtherDigits = [];  // raw text strings with digits (phones, IDs, etc.)

		try {
			comprehendCharCount = concatenated.length;

			// Log Comprehend request payload (test mode only)
			if (TEST_MODE) {
				const { writeFileSync, mkdirSync } = await import('fs');
				try {
					mkdirSync('test-redaction/prompt-log', { recursive: true });
					writeFileSync('test-redaction/prompt-log/comprehend-prepass-request.json',
						JSON.stringify({
							timestamp: new Date().toISOString(),
							api: 'DetectEntities',
							languageCode: 'en',
							inputChars: concatenated.length,
							inputUnits: Math.max(3, Math.ceil(concatenated.length / 100)),
							fieldCount: allFields.length,
							fields: allFields.map(f => ({ id: f.id, charCount: f.text.length })),
							knownMappingsAtTimeOfCall: knownMappings.map(m => ({ original: m.original, pseudonym: m.pseudonym, note: m.note || null })),
							concatenatedText: concatenated
						}, null, 2));
				} catch (logErr) {
					console.warn(`[aiProcessor] Failed to write pre-pass request log:`, logErr.message);
				}
			}

			console.log(`[aiProcessor] Comprehend pre-pass (DetectEntities): scanning ${concatenated.length} chars...`);
			const rawEntities = await detectEntities(concatenated, 'en');
			console.log(`[aiProcessor] Comprehend found ${rawEntities.length} entities`);

			for (const entity of rawEntities) {
				if (entity.score < 0.80) continue;
				// Skip types we preserve
				if (entity.type === 'DATE' || entity.type === 'QUANTITY' || entity.type === 'EVENT') continue;
				if (entity.text.includes('FIELD_SEP')) continue; // separator artifact

				comprehendEntities.push(entity);

				if (entity.type === 'PERSON') {
					const name = entity.text.trim();
					if (name.length < 2) continue;
					if (knownOriginals.has(name.toLowerCase())) continue;
					// Skip medication false positives
					if (medicationNames.has(name.toLowerCase())) continue;
					// Skip generic words that aren't names
					if (/^(the|and|for|with|from|that|this|but|not|has|had|have|was|were|his|her|our|who|may|can)$/i.test(name)) continue;

					// Determine if this is a full name or standalone first name
					const parts = name.split(/\s+/);
					let pseudonym;
					if (parts.length >= 2) {
						pseudonym = COMPREHEND_NAME_POOL[comprehendNameIdx++ % COMPREHEND_NAME_POOL.length];
					} else {
						pseudonym = COMPREHEND_FIRST_POOL[comprehendFirstIdx++ % COMPREHEND_FIRST_POOL.length];
					}

					knownMappings.push({
						original:  name,
						pseudonym: pseudonym,
						note:      'comprehend-discovered'
					});
					knownOriginals.add(name.toLowerCase());
					allOriginalTokens.add(name);
					parts.forEach(tok => { if (tok.length > 2) allOriginalTokens.add(tok); });
				}

				if (entity.type === 'LOCATION') {
					const loc = entity.text.trim();
					if (loc.length < 3) continue;
					// Classify location for generic replacement
					const locLower = loc.toLowerCase();
					let label = 'a location';
					if (/\b(street|road|avenue|boulevard|drive|crescent|lane|way|court|trail|route|place)\b/i.test(loc)) {
						label = 'a local street';
					} else if (/^\d+\s/.test(loc)) {
						label = 'a street address';
					} else if (/\b(neighbourhood|neighborhood|suburb|district|quarter|ward)\b/i.test(loc)) {
						label = 'a neighbourhood';
					} else {
						label = 'a nearby area';
					}
					detectedLocations.push({ text: loc, label });
					allOriginalTokens.add(loc);
				}

				if (entity.type === 'ORGANIZATION') {
					const org = entity.text.trim();
					if (org.length < 3) continue;
					const label = getOrgLabel(org);
					detectedOrgs.push({ text: org, label });
					allOriginalTokens.add(org);
				}

				// OTHER entities with digits — phone numbers, IDs, etc.
				if (entity.type === 'OTHER') {
					const txt = entity.text.trim();
					if (/\d/.test(txt)) {
						detectedOtherDigits.push(txt);
					}
				}
			}

			console.log(`[aiProcessor] Comprehend enriched knownMappings: ${knownMappings.length} entries total`);
			console.log(`[aiProcessor] Comprehend detected ${detectedLocations.length} locations, ${detectedOrgs.length} organizations, ${detectedOtherDigits.length} OTHER-with-digits`);

			// Log Comprehend pre-pass results
			const comprehendPrePassLog = {
				timestamp: new Date().toISOString(),
				api: 'DetectEntities',
				inputChars: concatenated.length,
				inputUnits: Math.max(3, Math.ceil(concatenated.length / 100)),
				totalEntities: rawEntities.length,
				filteredEntities: comprehendEntities.length,
				entitiesByType: {},
				namesAddedToMappings: [],
				locationsDetected: detectedLocations,
				organizationsDetected: detectedOrgs,
				otherWithDigits: detectedOtherDigits,
				allEntities: comprehendEntities.map(e => ({
					text: e.text, type: e.type, score: e.score.toFixed(3)
				}))
			};
			for (const e of comprehendEntities) {
				comprehendPrePassLog.entitiesByType[e.type] = (comprehendPrePassLog.entitiesByType[e.type] || 0) + 1;
			}
			knownMappings.filter(m => m.note === 'comprehend-discovered').forEach(m => {
				comprehendPrePassLog.namesAddedToMappings.push({ original: m.original, pseudonym: m.pseudonym });
			});
			if (TEST_MODE) {
				const { writeFileSync, mkdirSync } = await import('fs');
				try {
					mkdirSync('test-redaction/prompt-log', { recursive: true });
					writeFileSync('test-redaction/prompt-log/comprehend-prepass.json',
						JSON.stringify(comprehendPrePassLog, null, 2));
					console.log(`[aiProcessor] Comprehend pre-pass log written to test-redaction/prompt-log/comprehend-prepass.json`);
				} catch (logErr) {
					console.warn(`[aiProcessor] Failed to write pre-pass log:`, logErr.message);
				}
			}
		} catch (err) {
			console.warn(`[aiProcessor] Comprehend pre-pass failed (non-fatal, continuing with existing mappings):`, err.message);
		}

		onProgress?.({ label: 'Identifiers found', percent: 20 });

		// ── 3. Pass 1 — Full redaction (JSON input) ──────────────────────────────────
		const pass1SystemContent = `ROLE: Medical PII Anonymization Agent.

INPUT: JSON with known_mappings (array of {original, pseudonym, note}), patient_pseudonym (context only), fields (array of {id, text} to rewrite). Optional: detected_locations (location names found by entity scanner — MUST be redacted/genericized), detected_organizations (org names found by entity scanner — MUST be replaced with generic labels).

OUTPUT (strict JSON only, no markdown, no explanation):
{"rewritten":[{"id":"field_id","text":"rewritten text"}],"discoveries":[{"original":"real value","pseudonym":"replacement"}]}
discoveries = every substitution NOT in known_mappings. Include every person, place, org you replaced.

STEP 1 — NAMES (highest priority, process first)
1a. Apply every known_mappings entry. If it has "pseudonym", use it exactly. If it has only "note", follow the note.
1b. Surname cascade: if surname X maps to Y, then every "[AnyFirst] X" becomes "[NewFirst] Y". CRITICAL: applying the surname mapping alone gives "[OriginalFirst] [NewLast]" which is WRONG — the original first name is still PII. You MUST also replace the first name with a new invented one. Example: mapping "Park"→"Bradley" turns "Kevin Park" into "Kevin Bradley" — WRONG. Correct: "Owen Bradley".
1c. Every other named person in the text (doctors, lawyers, friends, colleagues, neighbours, family, employers, witnesses, clergy, instructors, anyone with a name) — replace BOTH first AND last name with invented names that do NOT appear anywhere in the original input. No exceptions.
1d. Standalone first names are PII. "my trainer Mark" → "my trainer Samuel". "my sister Deepa" → "my sister Grace". "my instructor Ritu" → "my instructor Petra". Always replace.
1e. Partial name residuals: if full name "A B" is mapped, also replace standalone "A" or "B" when they refer to the same person.
1f. Maiden names: "(nee X)" or "(née X)" → remove entirely or replace with "(née [invented surname])". The original maiden name is PII.
1g. Title + name: "Dr. Alex Bennett" → "a physician". "Justice Moreau" → "a judge". "Prof. Singh" → "a professor". Remove the title together with the name. Never produce "Dr. a physician".
1h. Consistency: same person = same pseudonym across all fields. No two different people share a pseudonym first name.
1i. No bracket tokens: never output [PseudonymFirstName], [PseudonymLastName], [Name], or any [Pseudonym*] placeholder. Always use a real invented name.
1j. Name collision check: every pseudonym last name must NOT match any real last name from the original input. If it does, the real name is leaking. Replace with a fully invented name.

STEP 2 — PHONE NUMBERS (second priority)
2a. Replace ANY phone number pattern in free text with [phone number]. Patterns: XXX-XXX-XXXX, (XXX) XXX-XXXX, +X-XXX-XXX-XXXX, +XXX XX XXX XXXX, or any sequence of 7+ digits that represents a phone.
2b. Includes phones inside parentheses: "(416-865-0040)" → "([phone number])".
2c. Includes international numbers: "+221 77 820 4432" → "[phone number]".

STEP 3 — EMAILS
3a. Any email address in free text → [email].

STEP 4 — IDENTIFIERS
4a. Case/file/policy/report/employee numbers: "Case #ABC-2024-001", "File #XY-001", "Policy #1234", "report #PRP-2023-09-8841", "employee number PSC-2021-00478" → replace entire phrase with generic ("a case file", "a policy", "a report", "an employee ID"). Remove the number completely.

STEP 5 — ADDRESSES AND LOCATIONS
5a. Full addresses (civic number + street name): "82 Forest Hill Road" → "a street address". Never leave bare house/unit/suite numbers.
5b. Named streets/roads/avenues/boulevards/drives/crescents/lanes/ways/courts/trails/routes → "a local street" or "a major street".
5c. Hospitals, clinics, treatment centres, rehab facilities → "a local hospital", "a local clinic", "a treatment facility", "a mental health facility".
5d. Companies, law firms, courts, schools, universities, accounting firms, consulting firms → "a company", "a law firm", "a court", "a school", "a university", "a professional services firm".
5e. Restaurants, hotels, clubs, venues, arenas, gyms → "a restaurant", "a hotel", "a private club", "a venue".
5f. Parks, rivers, trails, lakes, beaches → "a local park", "a trail", "a local river".
5g. Neighbourhoods, suburbs, small towns that narrow identity → "a neighbourhood", "a nearby city".
5h. Named residential/condo/apartment complexes, senior living facilities → "a residential building", "a senior living facility".
5i. Named deals, projects, infrastructure projects → "a project", "a major business deal".
5j. Keep only: countries, provinces/states. Replace city names with "a city" or "a major city" unless they are very large (population 1M+) AND the context is generic.

STEP 6 — PRESERVE (do not change)
Medication names, dosages, diagnoses, symptoms, ages, dates, years, durations, frequencies, pain/mood scales, relationship types (sister, father, ex-husband), emotional tone, narrative flow.

EXAMPLES:
IN: {"id":"q47","text":"My brother Pedro Rodriguez, 34, lives in Bogota with wife Isabella."}
OUT: {"id":"q47","text":"My brother Carlos Santos, 34, lives in a South American city with wife Miriam."}

IN: {"id":"q10_notes","text":"Sister. Backup: Linda Ho (647-555-0100). Lawyer James Park at Torys LLP (416-865-0040) on Bay Street."}
OUT: {"id":"q10_notes","text":"Sister. Backup: Grace Walsh ([phone number]). Lawyer Owen Bradley at a law firm ([phone number]) on a major street."}

IN: {"id":"q15","text":"Divorced from Rahul Sharma (nee Patel). My lawyer Anjali Mehrotra at Torys LLP."}
OUT: {"id":"q15","text":"Divorced from Owen Santos. My lawyer Grace Walsh at a law firm."}

IN: {"id":"q45","text":"My father, Suresh Krishnamurti, was an accountant at KPMG in Chennai. Mother Padma Krishnamurti (nee Iyer)."}
OUT: {"id":"q45","text":"My father, Owen Bradley, was an accountant at a professional services firm in a South Asian city. Mother Grace Bradley."}

IN: {"id":"q16_details","text":"Grade 7 at Forest Hill Public School on Lonsdale Road. Seeing Dr. Kavita Sundaram at Hincks-Dellcrest Centre, 440 Jarvis Street."}
OUT: {"id":"q16_details","text":"Grade 7 at a local school on a local street. Seeing a child psychologist at a treatment centre, a street address."}

IN: {"id":"q26","text":"Cocaine from a contact named Bryson near Water Street in Gastown, Vancouver"}
OUT: {"id":"q26","text":"Cocaine from a contact named Felix near a local street in a neighbourhood, a city"}

FINAL CHECK — scan every rewritten field before returning:
- Phone digits (XXX-XXX-XXXX or any 7+ digit phone pattern including international)? → [phone number]
- Any real person name from the original input still present in output? → replace it
- Any [Pseudonym*] or [Name] bracket placeholder? → replace with a real invented name
- Any pseudonym last name that matches a REAL last name from the input? → the real name leaked — redo with a fully invented last name
- Any "(nee [real surname])" or "(née [real surname])"? → remove or replace
- Any named street/road/avenue/boulevard/drive still present? → replace with generic
- Any named hospital/clinic/school/company/firm still present? → replace with generic`;

		// Build Comprehend entity summary for Haiku context
		const uniqueLocations = detectedLocations
			.map(l => l.text)
			.filter((v, i, a) => a.indexOf(v) === i);
		const uniqueOrgs = detectedOrgs
			.map(o => o.text)
			.filter((v, i, a) => a.indexOf(v) === i);

		const pass1BasePayload = {
			known_mappings: knownMappings,
			patient_pseudonym: `${pNewFirst} ${pNewLast}`,
			patient_first_name_reserved: `Do not use "${pNewFirst}" for anyone other than the patient`,
			patient_surname_note: `Do not use "${pNewLast}" as surname for non-family persons`,
			...(uniqueLocations.length > 0 ? { detected_locations: uniqueLocations } : {}),
			...(uniqueOrgs.length > 0 ? { detected_organizations: uniqueOrgs } : {}),
			...(regenerateReason ? { reviewer_note: regenerateReason } : {})
		};

		// ── 4. Initialise map with originals ─────────────────────────────────────────
		const rewrittenMap = {};
		const originalText = {};
		allFields.forEach(f => {
			rewrittenMap[f.id] = f.text;
			originalText[f.id] = f.text;
		});

		// Send 5 fields per chunk to stay well within Haiku's 4096-token output cap
		const PASS1_CHUNK_SIZE = 5;
		const pass1Chunks = [];
		for (let i = 0; i < allFields.length; i += PASS1_CHUNK_SIZE) {
			pass1Chunks.push(allFields.slice(i, i + PASS1_CHUNK_SIZE));
		}

		const allRewrites    = [];
		const allDiscoveries = [];
		const chunkUsages    = [];  // per-chunk token breakdown for the report
		let   pass1Usage     = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

		const MAX_CHUNK_RETRIES = 2;

		for (let ci = 0; ci < pass1Chunks.length; ci++) {
			const chunkFieldIds    = pass1Chunks[ci].map(f => f.id);
			const chunkUserContent = JSON.stringify({
				...pass1BasePayload,
				fields: pass1Chunks[ci].map(f => ({ id: f.id, text: f.text }))
			});
			const chunkName = pass1Chunks.length > 1 ? `pass1_chunk${ci + 1}` : 'pass1';

			let chunk = null;
			for (let cr = 0; cr <= MAX_CHUNK_RETRIES; cr++) {
				let raw;
				try {
					raw = await invokeBedrock(pass1SystemContent, chunkUserContent, cr > 0 ? `${chunkName}_retry${cr}` : chunkName);
				} catch (err) {
					console.warn(`[aiProcessor] Chunk ${ci + 1} attempt ${cr + 1} invoke failed:`, err.message);
					if (cr === MAX_CHUNK_RETRIES) throw err;
					continue;
				}
				if (validateChunkResponse(raw, chunkFieldIds)) {
					chunk = raw;
					break;
				}
				console.warn(`[aiProcessor] Chunk ${ci + 1} attempt ${cr + 1} response invalid (unexpected IDs or shape)`);
				if (cr === MAX_CHUNK_RETRIES) {
					throw new Error(`Chunk ${ci + 1} failed validation after ${MAX_CHUNK_RETRIES + 1} attempts — triggering process retry`);
				}
			}

			(chunk.result?.rewritten   || []).forEach(r => allRewrites.push(r));
			(chunk.result?.discoveries || []).forEach(d => allDiscoveries.push(d));
			onProgress?.({ label: `Rewriting (${ci + 1} of ${pass1Chunks.length})`, percent: 20 + Math.round((ci + 1) / pass1Chunks.length * 48) });
			const cu = chunk.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
			chunkUsages.push({
				chunk:             ci + 1,
				fields:            chunkFieldIds,
				prompt_tokens:     cu.prompt_tokens,
				completion_tokens: cu.completion_tokens,
				total_tokens:      cu.total_tokens
			});
			pass1Usage = {
				prompt_tokens:     pass1Usage.prompt_tokens     + cu.prompt_tokens,
				completion_tokens: pass1Usage.completion_tokens + cu.completion_tokens,
				total_tokens:      pass1Usage.total_tokens      + cu.total_tokens
			};
		}

		// Merge all chunk rewrites into rewrittenMap
		allRewrites.forEach(entry => {
			if (entry.id && typeof entry.text === 'string' && Object.hasOwn(originalText, entry.id)) {
				rewrittenMap[entry.id] = entry.text;
			}
		});

		// ── 5. Safety nets ───────────────────────────────────────────────────────────
		// Replace any bracket placeholder tokens the AI left (e.g. [PseudonymFirstName])
		const BRACKET_RE = /\[(?:Pseudonym[A-Za-z]*|pseudonym(?:\s*\w*)?|name)\]/gi;
		const FALLBACK_POOL = ['Arlo', 'Sage', 'Quinn', 'Remy', 'Blake', 'Harlow', 'Devin', 'Sloane', 'Emery', 'Wren', 'Rowan', 'Avery'];
		let fallbackIdx = 0;
		Object.keys(rewrittenMap).forEach(id => {
			BRACKET_RE.lastIndex = 0;
			if (typeof rewrittenMap[id] === 'string' && BRACKET_RE.test(rewrittenMap[id])) {
				BRACKET_RE.lastIndex = 0;
				rewrittenMap[id] = rewrittenMap[id].replace(BRACKET_RE, () => FALLBACK_POOL[fallbackIdx++ % FALLBACK_POOL.length]);
			}
		});

		// Remove dangling honorifics before generic replacements ("Dr. a physician" → "a physician")
		const HONORIFIC_GENERIC_RE = /\b(?:Dr\.|Justice|Father|Rev\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+(?=a |an )/g;
		Object.keys(rewrittenMap).forEach(id => {
			if (typeof rewrittenMap[id] === 'string') {
				rewrittenMap[id] = rewrittenMap[id].replace(HONORIFIC_GENERIC_RE, '');
			}
		});

		// ── 5.5 Deterministic survivor scan ──────────────────────────────────────────
		// Replace any original name/PII token that survived in the rewritten output.
		// Build replacement lookup: longest originals first to avoid partial matches.
		const survivorReplacements = knownMappings
			.filter(m => m.original && m.pseudonym && m.original !== m.pseudonym)
			.sort((a, b) => b.original.length - a.original.length); // longest first

		// Log survivor scan request (test mode only)
		if (TEST_MODE) {
			const { writeFileSync } = await import('fs');
			try {
				writeFileSync('test-redaction/prompt-log/survivor-scan-request.json',
					JSON.stringify({
						timestamp: new Date().toISOString(),
						fullNameReplacements: survivorReplacements.map(r => ({ original: r.original, pseudonym: r.pseudonym })),
						rewrittenFields: Object.entries(rewrittenMap)
							.filter(([, v]) => typeof v === 'string')
							.map(([id, text]) => ({ id, text }))
					}, null, 2));
			} catch (logErr) {
				console.warn(`[aiProcessor] Failed to write survivor scan request log:`, logErr.message);
			}
		}

		let survivorHits = 0;
		Object.keys(rewrittenMap).forEach(id => {
			if (typeof rewrittenMap[id] !== 'string') return;
			let text = rewrittenMap[id];
			for (const { original, pseudonym } of survivorReplacements) {
				if (text.includes(original)) {
					text = text.replaceAll(original, pseudonym);
					survivorHits++;
				}
			}
			rewrittenMap[id] = text;
		});

		// Also scan for individual name tokens (first names, last names) from originals
		// that might survive as standalone words even when the full name was replaced.
		// IMPORTANT: Only split PERSON names — skip entries that contain addresses/locations
		// (commas, digits, or 4+ words indicate embedded address, not a pure name)
		const tokenReplacements = [];
		knownMappings.forEach(m => {
			if (!m.original || !m.pseudonym) return;
			const origParts = m.original.split(/\s+/);
			const pseudParts = m.pseudonym.split(/\s+/);
			// Skip entries that look like addresses or mixed name+address strings
			if (m.original.includes(',') || /\d/.test(m.original) || origParts.length > 3) return;
			if (origParts.length >= 2 && pseudParts.length >= 2) {
				// Map first→first, last→last
				origParts.forEach((tok, i) => {
					const replacement = pseudParts[Math.min(i, pseudParts.length - 1)];
					if (tok.length > 2 && tok !== replacement) {
						tokenReplacements.push({ original: tok, pseudonym: replacement });
					}
				});
			}
		});
		// Sort by length descending
		tokenReplacements.sort((a, b) => b.original.length - a.original.length);
		// Deduplicate — keep first (longest context wins)
		const seenTokens = new Set();
		const uniqueTokenReplacements = tokenReplacements.filter(t => {
			if (seenTokens.has(t.original)) return false;
			seenTokens.add(t.original);
			return true;
		});

		Object.keys(rewrittenMap).forEach(id => {
			if (typeof rewrittenMap[id] !== 'string') return;
			let text = rewrittenMap[id];
			for (const { original, pseudonym } of uniqueTokenReplacements) {
				// Word-boundary aware replacement to avoid replacing "Mar" inside "March"
				const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const re = new RegExp(`\\b${escaped}\\b`, 'g');
				if (re.test(text)) {
					text = text.replace(re, pseudonym);
					survivorHits++;
				}
			}
			rewrittenMap[id] = text;
		});

		// Log survivor scan results
		const survivorScanLog = {
			timestamp: new Date().toISOString(),
			totalHits: survivorHits,
			fullNameReplacements: [],
			tokenReplacements: []
		};
		// Re-scan to capture details for the log (lightweight — just string checks)
		for (const { original, pseudonym } of survivorReplacements) {
			for (const id of Object.keys(originalText)) {
				if (typeof rewrittenMap[id] === 'string' && originalText[id]?.includes(original) && rewrittenMap[id].includes(pseudonym)) {
					survivorScanLog.fullNameReplacements.push({ field: id, original, pseudonym });
				}
			}
		}
		for (const { original, pseudonym } of uniqueTokenReplacements) {
			for (const id of Object.keys(originalText)) {
				if (typeof rewrittenMap[id] === 'string' && rewrittenMap[id].includes(pseudonym)) {
					const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					if (new RegExp(`\\b${escaped}\\b`).test(originalText[id])) {
						survivorScanLog.tokenReplacements.push({ field: id, original, pseudonym });
					}
				}
			}
		}
		if (TEST_MODE) {
			const { writeFileSync } = await import('fs');
			try {
				writeFileSync('test-redaction/prompt-log/survivor-scan.json',
					JSON.stringify(survivorScanLog, null, 2));
				console.log(`[aiProcessor] Survivor scan log written to test-redaction/prompt-log/survivor-scan.json`);
			} catch (logErr) {
				console.warn(`[aiProcessor] Failed to write survivor scan log:`, logErr.message);
			}
		}

		if (survivorHits > 0) {
			console.log(`[aiProcessor] Survivor scan replaced ${survivorHits} leaked PII tokens`);
		}
		onProgress?.({ label: 'Checking survivors', percent: 75 });

		// ── 5.6 Deterministic LOCATION & ORGANIZATION replacement ──────────────────
		// Replace Comprehend-detected locations and organizations that survived Haiku rewrite
		let locOrgHits = 0;
		// Sort by length descending to replace longest matches first
		const sortedOrgs = [...detectedOrgs].sort((a, b) => b.text.length - a.text.length);
		const sortedLocs = [...detectedLocations].sort((a, b) => b.text.length - a.text.length);

		// Helper: replace entity text using word-boundary regex to avoid partial-word matches
		// e.g. "Japan" should not replace inside "Japanese"
		function replaceEntity(text, entityText, label) {
			const escaped = entityText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(`\\b${escaped}\\b`, 'g');
			return text.replace(re, label);
		}

		Object.keys(rewrittenMap).forEach(id => {
			if (typeof rewrittenMap[id] !== 'string') return;
			let text = rewrittenMap[id];

			// Replace organizations first (longer, more specific)
			for (const { text: orgText, label } of sortedOrgs) {
				const newText = replaceEntity(text, orgText, label);
				if (newText !== text) {
					text = newText;
					locOrgHits++;
				}
			}

			// Replace locations
			for (const { text: locText, label } of sortedLocs) {
				const newText = replaceEntity(text, locText, label);
				if (newText !== text) {
					text = newText;
					locOrgHits++;
				}
			}

			rewrittenMap[id] = text;
		});

		if (locOrgHits > 0) {
			console.log(`[aiProcessor] Deterministic loc/org scan replaced ${locOrgHits} surviving entities`);
		}
		onProgress?.({ label: 'Replacing missed items', percent: 83 });

		// ── 5.65 Randomize digits in OTHER entities (phones, IDs, etc.) ─────────────
		// For each OTHER entity that contains digits, replace every digit with a random 0-9
		let digitHits = 0;
		const sortedOtherDigits = [...new Set(detectedOtherDigits)]
			.sort((a, b) => b.length - a.length); // longest first

		Object.keys(rewrittenMap).forEach(id => {
			if (typeof rewrittenMap[id] !== 'string') return;
			let text = rewrittenMap[id];
			for (const original of sortedOtherDigits) {
				if (text.includes(original)) {
					const randomized = original.replace(/\d/g, () => Math.floor(Math.random() * 10).toString());
					text = text.replaceAll(original, randomized);
					digitHits++;
				}
			}
			rewrittenMap[id] = text;
		});

		if (digitHits > 0) {
			console.log(`[aiProcessor] Digit randomization replaced digits in ${digitHits} OTHER entities`);
		}

		// ── 5.7 Case/file number cleanup ─────────────────────────────────────────────
		const CASE_NUM_RE = /(?:(?:File|Case|Report|Policy|Dossier)\s*#\s*[A-Z0-9][\w-]*(?:-\d+)+)|(?:(?:employee\s+(?:number|ID)|report\s*#|file\s*#|case\s*#|policy\s*#)\s*[A-Z0-9][\w-]+)/gi;
		Object.keys(rewrittenMap).forEach(id => {
			if (typeof rewrittenMap[id] === 'string') {
				rewrittenMap[id] = rewrittenMap[id].replace(CASE_NUM_RE, 'a case reference');
			}
		});

		// ── 5.9 Comprehend post-pass — scan final rewritten output for remaining entities ─
		const postPassFields = Object.entries(rewrittenMap)
			.filter(([, v]) => typeof v === 'string' && v.length > 0)
			.map(([id, text]) => ({ id, text }));
		const postPassConcatenated = postPassFields.map(f => f.text).join(SEPARATOR);
		let postPassEntities = [];
		let postPassCharCount = postPassConcatenated.length;

		// Build set of all pseudonyms to filter PERSON false positives
		const allPseudonyms = new Set();
		knownMappings.forEach(m => {
			if (m.pseudonym) {
				allPseudonyms.add(m.pseudonym.toLowerCase());
				m.pseudonym.split(/\s+/).forEach(tok => {
					if (tok.length > 2) allPseudonyms.add(tok.toLowerCase());
				});
			}
		});
		allDiscoveries.forEach(d => {
			if (d.pseudonym) {
				allPseudonyms.add(d.pseudonym.toLowerCase());
				d.pseudonym.split(/\s+/).forEach(tok => {
					if (tok.length > 2) allPseudonyms.add(tok.toLowerCase());
				});
			}
		});

		// Build set of generic replacement labels to filter LOCATION/ORG false positives
		const genericLabels = new Set([
			'a local school', 'a university', 'a local hospital', 'a local clinic',
			'a treatment centre', 'a court', 'a correctional facility', 'a law firm',
			'a place of worship', 'a restaurant', 'a hotel', 'a local park',
			'an organization', 'a location', 'a local street', 'a street address',
			'a neighbourhood', 'a nearby area', 'a nearby city', 'a city', 'a major city',
			'a company', 'a professional services firm', 'a venue', 'a school',
			'a treatment facility', 'a mental health facility', 'a case reference'
		]);

		try {
			console.log(`[aiProcessor] Comprehend post-pass (DetectEntities): scanning ${postPassCharCount} chars of rewritten output...`);
			const postPassRaw = await detectEntities(postPassConcatenated, 'en');
			console.log(`[aiProcessor] Comprehend post-pass found ${postPassRaw.length} raw entities`);

			// Filter: score >= 0.80, skip DATE/QUANTITY/EVENT, skip pseudonyms, skip separators, skip generic labels
			for (const entity of postPassRaw) {
				if (entity.score < 0.80) continue;
				if (entity.type === 'DATE' || entity.type === 'QUANTITY' || entity.type === 'EVENT') continue;
				if (entity.text.includes('FIELD_SEP')) continue;

				const textLower = entity.text.trim().toLowerCase();

				// Skip generic replacement labels (our own output)
				if (genericLabels.has(textLower)) continue;

				// For PERSON type, check if it's a pseudonym
				let isPseudonym = false;
				if (entity.type === 'PERSON') {
					isPseudonym = allPseudonyms.has(textLower) ||
						entity.text.trim().split(/\s+/).every(tok => allPseudonyms.has(tok.toLowerCase()));
				}

				postPassEntities.push({
					text: entity.text.trim(),
					type: entity.type,
					score: parseFloat(entity.score.toFixed(3)),
					isPseudonym
				});
			}

			const realLeaks = postPassEntities.filter(e => !e.isPseudonym);
			const pseudonymFPs = postPassEntities.filter(e => e.isPseudonym);

			if (TEST_MODE) {
				const { writeFileSync } = await import('fs');
				writeFileSync('test-redaction/prompt-log/comprehend-postpass-request.json',
					JSON.stringify({
						timestamp: new Date().toISOString(),
						api: 'DetectEntities',
						inputChars: postPassCharCount,
						inputUnits: Math.max(3, Math.ceil(postPassCharCount / 100)),
						fieldCount: postPassFields.length,
						fields: postPassFields.map(f => ({ id: f.id, charCount: f.text.length })),
						concatenatedText: postPassConcatenated
					}, null, 2));

				writeFileSync('test-redaction/prompt-log/remaining-leaks.json',
					JSON.stringify({
						timestamp: new Date().toISOString(),
						postPassInputChars: postPassCharCount,
						postPassInputUnits: Math.max(3, Math.ceil(postPassCharCount / 100)),
						postPassCost: Math.max(3, Math.ceil(postPassCharCount / 100)) * 0.0001,
						totalEntitiesFound: postPassEntities.length,
						realLeaks: {
							count: realLeaks.length,
							uniqueTexts: [...new Set(realLeaks.map(e => e.text))].length,
							items: realLeaks
						},
						pseudonymFalsePositives: {
							count: pseudonymFPs.length,
							uniqueTexts: [...new Set(pseudonymFPs.map(e => e.text))].length,
							items: pseudonymFPs
						}
					}, null, 2));
			}

			console.log(`[aiProcessor] Post-pass: ${realLeaks.length} real leaks, ${pseudonymFPs.length} pseudonym false positives`);

			// Update comprehend cost tracking to include post-pass
			postPassCharCount = postPassConcatenated.length;
		} catch (postErr) {
			console.warn(`[aiProcessor] Comprehend post-pass failed (non-fatal):`, postErr.message);
		}
		onProgress?.({ label: 'Running final check', percent: 92 });

		// Filter out bad discoveries
		const discoveries1 = allDiscoveries.filter(
			d => d.pseudonym && d.original !== d.pseudonym && !/\[Pseudonym/i.test(d.pseudonym)
		);

		// ── 6. Build final result ────────────────────────────────────────────────────
		const resultJSON = {
			rewritten: allFields
				.filter(f => rewrittenMap[f.id] !== f.text)
				.map(f => ({ id: f.id, text: rewrittenMap[f.id], passes: ['pass1'] })),
			discoveries: discoveries1
		};

		// Comprehend cost: $0.0001 per unit (100 chars), 3 unit minimum per request
		const prePassUnits = Math.max(3, Math.ceil(comprehendCharCount / 100));
		const prePassCost = prePassUnits * 0.0001;
		const postPassUnits = Math.max(3, Math.ceil(postPassCharCount / 100));
		const postPassCost = postPassUnits * 0.0001;

		return {
			success:                 true,
			data:                    resultJSON,
			usage:                   { pass1: pass1Usage, total: pass1Usage },
			chunkUsages,
			discoveries:             resultJSON.discoveries,
			additionalSearchReplace: discoveries1.map(d => ({ find: d.original, replace: d.pseudonym })),
			comprehend: {
				prePass: {
					charCount: comprehendCharCount,
					units: prePassUnits,
					cost: prePassCost,
					entitiesFound: comprehendEntities.length
				},
				postPass: {
					charCount: postPassCharCount,
					units: postPassUnits,
					cost: postPassCost,
					entitiesFound: postPassEntities.length
				},
				totalCost: prePassCost + postPassCost
			}
		};
	} catch (error) {
		console.warn(`[aiProcessor] Process attempt ${processAttempt + 1} failed:`, error.message);
		if (processAttempt === MAX_PROCESS_RETRIES) {
			console.error('[aiProcessor] All process retries exhausted.');
			return { success: false, error: error.message };
		}
	}
	} // end process-retry loop
}
