// src/lib/utils/anonymization/comprehendClient.js
import { ComprehendClient, DetectEntitiesCommand } from '@aws-sdk/client-comprehend';
import { env } from '$env/dynamic/private';

const { AWS_REGION, AWS_ACCESS_KEY_ID_COMPREHEND, AWS_SECRET_ACCESS_KEY_COMPREHEND } = env;

const client = new ComprehendClient({
	region: AWS_REGION,
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID_COMPREHEND,
		secretAccessKey: AWS_SECRET_ACCESS_KEY_COMPREHEND
	}
});

/**
 * Detect entities in text using AWS Comprehend DetectEntities API.
 * Returns: PERSON, LOCATION, ORGANIZATION, COMMERCIAL_ITEM, EVENT, DATE, QUANTITY, TITLE, OTHER
 *
 * @param {string} text - UTF-8 text (max 100KB)
 * @param {string} languageCode - 'en' or 'es'
 * @returns {Promise<Array<{text: string, type: string, score: number, beginOffset: number, endOffset: number}>>}
 */
export async function detectEntities(text, languageCode = 'en') {
	if (!text || text.length === 0) return [];

	// Comprehend limit is 100KB — split if needed (unlikely for our use case)
	const MAX_BYTES = 99_000;
	const encoder = new TextEncoder();
	if (encoder.encode(text).length > MAX_BYTES) {
		console.warn(`[comprehendClient] Text exceeds 100KB (${encoder.encode(text).length} bytes), truncating`);
		let truncated = text;
		while (encoder.encode(truncated).length > MAX_BYTES) {
			truncated = truncated.slice(0, -1000);
		}
		text = truncated;
	}

	const command = new DetectEntitiesCommand({
		Text: text,
		LanguageCode: languageCode
	});

	const response = await client.send(command);

	return (response.Entities || []).map(entity => ({
		text: entity.Text || text.slice(entity.BeginOffset, entity.EndOffset),
		type: entity.Type,
		score: entity.Score,
		beginOffset: entity.BeginOffset,
		endOffset: entity.EndOffset
	}));
}
