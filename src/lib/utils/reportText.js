// Plain-text rendering of a test's evaluated `report_sections` — the narrative
// blocks the algorithmic ("standard") report is built from.
//
// This logic used to exist ONLY inside the PDF and DOCX generators, in two copies
// that had already drifted (the DOCX copy dropped the identifier filter in
// evaluateExpression, so a context key containing a hyphen throws there but not
// in the PDF path). The AI-report path now needs the same text as a string, so
// the helpers live here once and jsonBasedPdfGenerator.js imports them.
//
// Behaviour is byte-for-byte the PDF generator's: keep it that way, or the
// algorithmic PDF changes.

/** Pronoun set keyed by the standard report's gender token. */
function getPronouns(gender) {
	const pronounMap = {
		He: { subject: 'he', possessive: 'his' },
		She: { subject: 'she', possessive: 'her' },
		They: { subject: 'they', possessive: 'their' },
		Ze: { subject: 'ze', possessive: 'zir' }
	};
	return pronounMap[gender] || pronounMap['They']; // default to they/their
}

/** Force English out of a `{en, fr}` multilingual object. */
export function getEnglishText(content) {
	if (!content) return '';
	if (typeof content === 'object') {
		return content.en || '';
	}
	return content;
}

/** Does this placeholder body contain JavaScript rather than a plain path? */
function isExpression(str) {
	return /[?:==!=><&|()]|\.charAt|\.slice|\.toUpperCase|\.toLowerCase|\.trim|\.substring|\.concat|\.repeat|\.startsWith|\.endsWith|\.includes|\.toLocaleUpperCase|\.toLocaleLowerCase|Math\./i.test(
		str
	);
}

/** Evaluate a placeholder expression against the report context. */
function evaluateExpression(expr, context) {
	try {
		if (expr.length > 500) {
			console.error('Expression too long (max 500 characters):', expr);
			return undefined;
		}

		const dangerousPatterns =
			/\bprocess\b|\beval\b|\bFunction\b|\brequire\b|\bimport\b|\bwhile\b|\bfor\b/i;
		if (dangerousPatterns.test(expr)) {
			console.error('Forbidden operation in expression:', expr);
			return undefined;
		}

		// Filter out keys that are not valid JavaScript identifiers (e.g. containing hyphens)
		const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

		const validContextEntries = Object.entries(context).filter(([key]) =>
			validIdentifierRegex.test(key)
		);

		const contextKeys = validContextEntries.map(([key]) => key);
		const contextValues = validContextEntries.map(([, value]) => value);

		const funcBody = `
            try {
                return ${expr};
            } catch (e) {
                console.error('Expression evaluation error:', e.message);
                return undefined;
            }
        `;

		const func = new Function(...contextKeys, funcBody);
		const result = func(...contextValues);

		if (result === null || result === undefined) {
			return '';
		}

		if (typeof result === 'number' && !isFinite(result)) {
			console.error('Invalid numeric result:', result);
			return '';
		}

		return result;
	} catch (error) {
		console.error('Error evaluating expression:', expr, error);
		return undefined;
	}
}

/**
 * Substitute `{first_name}`, `{pronouns.subject}` and evaluated-variable
 * placeholders into a report-section string.
 */
export function replaceVariables(text, patientInfo, variables = {}) {
	if (!text) return text;

	const pronouns = getPronouns(patientInfo.gender);

	const context = {
		first_name: patientInfo.firstName || '',
		pronouns: {
			subject: pronouns.subject,
			possessive: pronouns.possessive
		},
		...variables // BMI, TotalScore, q11, … from the report logic
	};

	const textStr = getEnglishText(text);
	const result = textStr.replace(/\{([^}]+)\}/g, (match, content) => {
		try {
			const trimmedContent = content.trim();

			if (isExpression(trimmedContent)) {
				const evaluated = evaluateExpression(trimmedContent, context);

				if (evaluated === undefined) {
					console.warn('Failed to evaluate expression, keeping original:', match);
					return match;
				}

				return evaluated;
			}

			// Simple lookup, including nested paths like "pronouns.subject".
			const value = trimmedContent.split('.').reduce((obj, key) => {
				return obj && obj[key] !== undefined ? obj[key] : undefined;
			}, context);

			return value !== undefined && value !== null ? value.toString() : '';
		} catch (error) {
			console.error('Error replacing placeholder:', match, error);
			return match;
		}
	});

	return result;
}

/** Join the multi_words entries whose operation fired into one phrase. */
export function processMultiWords(
	multiWords,
	conjunction = 'and',
	patientInfo = {},
	variables = {}
) {
	if (!multiWords || !Array.isArray(multiWords)) return '';

	const validItems = multiWords.filter((item) => {
		// If operation_result is not present, treat as 1
		if (typeof item.operation_result === 'undefined') return true;
		return item.operation_result === 1;
	});

	if (validItems.length === 0) return '';

	if (validItems.length === 1)
		return replaceVariables(getEnglishText(validItems[0].text), patientInfo, variables);

	if (validItems.length === 2) {
		return `${replaceVariables(getEnglishText(validItems[0].text), patientInfo, variables)} ${conjunction} ${replaceVariables(getEnglishText(validItems[1].text), patientInfo, variables)}`;
	}

	return validItems
		.map((item, index) => {
			const replacedText = replaceVariables(getEnglishText(item.text), patientInfo, variables);
			if (index === validItems.length - 1) {
				return `${conjunction} ${replacedText}`;
			}
			return replacedText;
		})
		.join(', ');
}

/** Pick the first single_word entry whose operation fired. */
export function processSingleWord(singleWord, patientInfo = {}, variables = {}) {
	if (!singleWord || !Array.isArray(singleWord)) return '';

	const validItem = singleWord.find((item) => {
		// If operation_result is not present, treat as 1
		if (typeof item.operation_result === 'undefined') return true;
		return item.operation_result === 1;
	});
	return validItem ? replaceVariables(getEnglishText(validItem.text), patientInfo, variables) : '';
}

/**
 * Render one evaluated report_section to plain text, mirroring the order the
 * PDF generator draws in: heading, then text — which multi_words and then
 * single_word each REPLACE when present — then the bullet points that fired.
 *
 * @returns {{ heading: string, text: string, bullets: string[], continued: boolean }}
 */
function renderSection(section, patientInfo, variables) {
	const out = { heading: '', text: '', bullets: [], continued: !!section.continued };

	if (section.heading) {
		const headingStr = getEnglishText(section.heading);
		if (headingStr) out.heading = replaceVariables(headingStr, patientInfo, variables);
	}

	if (section.text) {
		const textStr = getEnglishText(section.text);
		if (textStr) out.text = replaceVariables(textStr, patientInfo, variables);
	}
	if (section.multi_words && section.multi_words.length > 0) {
		out.text = processMultiWords(section.multi_words, section.conjunction, patientInfo, variables);
	}
	if (section.single_word && section.single_word.length > 0) {
		out.text = processSingleWord(section.single_word, patientInfo, variables);
	}

	if (section.bullet_points) {
		for (const point of section.bullet_points) {
			if (typeof point.operation_result !== 'undefined' && point.operation_result !== 1) continue;
			const bulletText = replaceVariables(getEnglishText(point.text), patientInfo, variables);
			if (bulletText) out.bullets.push(bulletText.trim());
		}
	}

	if (out.text) {
		out.text = out.text.trim();
		if (section.addPeriod) out.text += '.';
		if (section.addComma) out.text += ',';
	}

	return out;
}

/**
 * Render a fired outcome's evaluated `report_sections` to a plain string.
 *
 * The standard report flags a subset of blocks `summary: true` — that subset is
 * the "Brief Summary Report", a one-to-three sentence clinical statement naming
 * the disorder, its DSM-5/ICD codes and, for a negative outcome, the reason the
 * criteria were not met. `summaryOnly` (the default) renders exactly that
 * subset, which is what the AI report needs: dense, already clinician-authored,
 * and small enough that forty interviews still fit in a section prompt.
 *
 * @param {Array<object>} sections   evaluated report_sections (operation_result present)
 * @param {object} opts
 * @param {{firstName?: string, gender?: string}} opts.patientInfo
 * @param {object} [opts.variables]   evaluated variables + raw responses
 * @param {boolean} [opts.summaryOnly=true]
 * @param {boolean} [opts.includeHeadings=false]
 * @param {boolean} [opts.includeTables=false] render `type: 'table'` sections as
 *                                    text. Off by default so the PDF/summary
 *                                    callers, which draw tables themselves, are
 *                                    unaffected. The agent payload turns it on:
 *                                    Therapist Matching is ENTIRELY a table, so
 *                                    with tables skipped its whole report
 *                                    renders as a bare 21-character heading.
 * @param {number} [opts.maxChars]    hard cap; the result is cut at a sentence
 *                                    boundary where one is available
 * @returns {string}
 */
/**
 * Flatten a table section into readable lines: one `header: value` pair per
 * cell, one row per line. Not a grid — the consumer is a language model, and
 * label:value pairs survive better than aligned columns.
 */
function renderTableText(section, patientInfo, variables) {
	const cellText = (v) => {
		if (v == null) return '';
		const str = getEnglishText(v);
		const base = typeof str === 'string' && str ? str : typeof v === 'string' ? v : String(v);
		return replaceVariables(base, patientInfo, variables).trim();
	};

	const headers = (section.headers ?? []).map(cellText);
	const lines = [];
	for (const row of section.rows ?? []) {
		const cells = Array.isArray(row) ? row : (row.cells ?? Object.values(row));
		const parts = [];
		for (let i = 0; i < cells.length; i++) {
			const value = cellText(cells[i]);
			if (!value) continue;
			parts.push(headers[i] ? `${headers[i]}: ${value}` : value);
		}
		if (parts.length) lines.push(parts.join(' — '));
	}
	return lines.join('\n');
}

export function renderReportSectionsText(
	sections,
	{
		patientInfo = {},
		variables = {},
		summaryOnly = true,
		includeHeadings = false,
		includeTables = false,
		maxChars
	} = {}
) {
	if (!Array.isArray(sections)) return '';

	const pieces = [];
	for (const section of sections) {
		if (!section) continue;
		if (section.operation_result === 0) continue;
		if (summaryOnly && !section.summary) continue;
		// `onlySummary` marks the alternate heading shown only in the brief report;
		// it is a heading, never body text.
		if (section.type === 'table') {
			if (!includeTables) continue;
			const t = renderTableText(section, patientInfo, variables);
			if (t) pieces.push({ text: t, continued: false });
			continue;
		}

		const r = renderSection(section, patientInfo, variables);

		if (includeHeadings && r.heading) pieces.push({ text: r.heading, continued: false });
		if (r.text) pieces.push({ text: r.text, continued: r.continued });
		for (const b of r.bullets) pieces.push({ text: b, continued: false });
	}

	// `continued: true` means "this block is the tail of the previous sentence".
	let outStr = '';
	for (const p of pieces) {
		if (!outStr) {
			outStr = p.text;
			continue;
		}
		outStr += p.continued ? ` ${p.text}` : ` ${p.text}`;
	}

	outStr = outStr
		.replace(/\s+/g, ' ')
		.replace(/\s+([.,;:])/g, '$1')
		.trim();

	if (maxChars && outStr.length > maxChars) {
		const cut = outStr.slice(0, maxChars);
		const lastStop = cut.lastIndexOf('. ');
		outStr = lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
	}

	return outStr;
}
