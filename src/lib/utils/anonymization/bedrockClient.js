// src/lib/utils/anonymization/bedrockClient.js
import { env } from '$env/dynamic/private';

const { AWS_REGION, AWS_SECRET_ACCESS_KEY } = env;

const TEST_MODE = typeof process !== 'undefined' && !!process.env.TEMPLATE_N;

/**
 * Escape unescaped double quotes inside JSON string values.
 * Haiku sometimes outputs "blowing up" (bare quotes) inside a value.
 * Walks the string char-by-char, tracking in-string state.
 * A quote inside a string is structural (closing) only if the next
 * non-whitespace char is one of : , } ]
 */
function escapeInnerQuotes(str) {
	let result = '';
	let inString = false;
	for (let i = 0; i < str.length; i++) {
		const ch = str[i];
		if (ch === '\\' && inString) {
			result += ch + (str[i + 1] || '');
			i++;
			continue;
		}
		if (ch === '"') {
			if (!inString) {
				inString = true;
				result += ch;
			} else {
				const after = str.slice(i + 1).trimStart();
				const next = after[0];
				if (!next || next === ':' || next === ',' || next === '}' || next === ']') {
					inString = false;
					result += ch;
				} else {
					result += '\\"';
				}
			}
		} else {
			result += ch;
		}
	}
	return result;
}

// Claude 3 Haiku via AWS Bedrock Converse API
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
const CONVERSE_URL = `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${MODEL_ID}/converse`;

/**
 * Invoke Bedrock Converse API with a system + user message pair.
 * Returns { result: Object, usage: { prompt_tokens, completion_tokens, total_tokens } }
 *
 * @param {string} systemContent - Static rules / persona instructions (cacheable)
 * @param {string} userContent   - Dynamic per-patient data + fields to rewrite
 * @param {string} passName      - Name used for the prompt log file (e.g. 'pass1', 'pass5-mega')
 * @param {number} retries       - Number of additional attempts on failure
 */
export async function invokeBedrock(systemContent, userContent, passName = 'pass', retries = 2) {
	for (let attempt = 0; attempt <= retries; attempt++) {
		// Log prompt to disk only in local test mode
		if (attempt === 0 && TEST_MODE) {
			const { writeFileSync, mkdirSync } = await import('fs');
			const log = `# Bedrock Prompt Log — ${passName}\n\n## SYSTEM\n\n\`\`\`\n${systemContent}\n\`\`\`\n\n## USER\n\n\`\`\`\n${userContent}\n\`\`\`\n`;
			try {
				mkdirSync('test-redaction/prompt-log', { recursive: true });
				writeFileSync(`test-redaction/prompt-log/${passName}.md`, log);
			} catch (_) {}
			console.log(`[bedrockClient] Prompt written to test-redaction/prompt-log/${passName}.md`);
		}

		const payload = {
			system: [{ text: systemContent }],
			messages: [
				{ role: 'user', content: [{ text: userContent }] }
			],
			inferenceConfig: {
				maxTokens: 4095,
				temperature: 0.0  // Deterministic for consistent anonymization
			}
		};

		try {
			const response = await fetch(CONVERSE_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Authorization': `Bearer ${AWS_SECRET_ACCESS_KEY}`
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(`Bedrock Converse error (${response.status}): ${errText}`);
			}

			const responseBody = await response.json();

			const assistantMessage = responseBody.output?.message?.content
				?.filter(c => c.text)
				.map(c => c.text)
				.join('') || '';

			// Log raw response to disk only in local test mode
			if (TEST_MODE) {
				const { writeFileSync } = await import('fs');
				try {
					writeFileSync(`test-redaction/prompt-log/${passName}-response.json`, assistantMessage);
				} catch (_) {}
				console.log(`[bedrockClient] Response logged to test-redaction/prompt-log/${passName}-response.json (${assistantMessage.length} chars, stopReason: ${responseBody.stopReason})`);
			}

			const usage = {
				prompt_tokens:      responseBody.usage?.inputTokens  || 0,
				completion_tokens:  responseBody.usage?.outputTokens || 0,
				total_tokens:       responseBody.usage?.totalTokens  || 0
			};

			// Sanitize: strip markdown code fences, extract {…}, fix common JSON issues
			let raw = assistantMessage.trim();
			raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

			const startIndex = raw.indexOf('{');
			const endIndex   = raw.lastIndexOf('}');

			if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
				let sanitized = raw
					.substring(startIndex, endIndex + 1)
					.replace(/,(\s*[}\]])/g, '$1');   // strip trailing commas

				// Attempt parse; on failure, try to repair common Haiku JSON issues
				try {
					return { result: JSON.parse(sanitized), usage };
				} catch (firstErr) {
					// Fix: missing } before ] (Haiku drops closing brace on last array item)
					sanitized = sanitized.replace(/"(\s*)\]/g, '"}$1]');
					// Fix: missing } before , in arrays
					sanitized = sanitized.replace(/"(\s*),(\s*)\{/g, '"}$1,$2{');
					// Fix: missing comma between properties ("value"\n"key" → "value",\n"key")
					sanitized = sanitized.replace(/(")\s*\n(\s*")/g, '$1,\n$2');
					// Re-strip any trailing commas the repair may have introduced
					sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');
					try {
						return { result: JSON.parse(sanitized), usage };
					} catch (secondErr) {
						// Last resort: state-machine escape of bare quotes inside string values
						sanitized = escapeInnerQuotes(sanitized);
						sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');
						return { result: JSON.parse(sanitized), usage };
					}
				}
			} else {
				throw new Error('Failed to extract valid JSON from response. Raw: ' + assistantMessage);
			}
		} catch (error) {
			console.warn(`Bedrock Converse failed on attempt ${attempt + 1}:`, error.message);
			if (attempt === retries) {
				console.error('All Bedrock retries exhausted.');
				throw error;
			}
		}
	}
}
