import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { User, Assignment, Questionnaire, Response as DBResponse } from '$lib/database/schemas.js';
import { processAlgorithmicFields } from '$lib/utils/anonymization/algorithmicProcessor.js';
import { processWithAI } from '$lib/utils/anonymization/aiProcessor.js';
import { buildRedactionTrace, addAiCostTrace } from '$lib/server/aiCost.js';
import { buildRedactionRules, NO_AI_RESULT } from '$lib/utils/anonymization/redactionRules.js';
import { DEMO_MODE } from '$lib/demo/mode.js';

// VERCEL CONFIG: Redaction pipeline (Comprehend + Haiku AI chunks) can take up to ~5 min.
// Requires Vercel Pro plan for maxDuration > 60.
export const config = {
	maxDuration: 300
};


export async function POST({ request, locals }) {
	// Guard 1: Verify Session (before stream — returns normal JSON)
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let targetPatientId = locals.user._id || locals.user.id;
	let regenerateReason = '';

	// If the user is a therapist/admin triggering this manually, they will pass the patientId in the body
	if (locals.user.userType !== 'patient') {
		try {
			const bodyText = await request.text();
			if (bodyText) {
				const body = JSON.parse(bodyText);
				if (body.patientId) targetPatientId = body.patientId;
				if (body.regenerateReason) regenerateReason = body.regenerateReason;
			}
		} catch(e) {
			console.warn("Failed to parse body for patientId", e);
		}
	}

	const patientId = targetPatientId;
	const signal = request.signal;

	// Set up SSE stream
	const encoder = new TextEncoder();
	let ctrl;
	const stream = new ReadableStream({ start(c) { ctrl = c; } });
	const send = (data) => {
		try { ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch(_) {}
	};

	// Process async — stream is returned immediately below
	(async () => {
		try {
			await connectToDatabase();
			send({ label: 'Reading records', percent: 5 });

			const patient = await User.findById(patientId);
			if (!patient) {
				send({ error: 'Patient not found' });
				return;
			}

			// Mark as Processing
			patient.patientProfile.anonymizationProfile = {
				...patient.patientProfile.anonymizationProfile,
				status: 'processing',
				generatedAt: new Date(),
				errorMessage: null
			};
			await patient.save();

			// Guard 2: Handle early abort
			if (signal.aborted) throw new Error('Aborted by client');

			// Find the Adult Bio Questionnaire
			const questionnaire = await Questionnaire.findOne({
				$or: [{ test_code: 'ADULT_BIO' }, { 'title.en': 'Adult Biographical Interview' }]
			}).lean();

			if (!questionnaire) {
				send({ error: 'Adult Bio Questionnaire not found in system' });
				return;
			}

			// Find the patient's completed assignment for this questionnaire
			const assignment = await Assignment.findOne({
				patientId: patientId,
				questionnaireId: questionnaire._id,
				status: { $in: ['completed', 'downloaded'] }
			}).sort({ completedAt: -1 }).lean();

			if (!assignment) {
				patient.patientProfile.anonymizationProfile.status = 'failed';
				patient.patientProfile.anonymizationProfile.errorMessage = 'No completed Adult Bio assignment found';
				await patient.save();
				send({ error: 'No completed Adult Bio assignment found' });
				return;
			}

			// Retrieve all responses for Adult Bio securely
			const responseDoc = await DBResponse.findOne({ assignmentId: assignment._id }).lean();
			const responses = responseDoc ? responseDoc.responses : null;

			if (!responses || responses.length === 0) {
				patient.patientProfile.anonymizationProfile.status = 'failed';
				patient.patientProfile.anonymizationProfile.errorMessage = 'No Adult Bio responses found in the database';
				await patient.save();
				send({ error: 'No Adult Bio responses found in the database' });
				return;
			}

			// --- PHASE 1: ALGORITHMIC GENERATION ---
			const algResults = processAlgorithmicFields(patientId.toString(), responses);
			send({ label: 'Name mappings ready', percent: 10 });

			// Guard 3: Client Abort during synchronous loop
			if (signal.aborted) throw new Error('Aborted by client');

			// --- PHASE 2: AI BACKEND (BEDROCK LLM) ---
			// `send` doubles as the onProgress callback — shape { label, percent } is compatible
			// The demo has no AWS access, so it skips this phase (see NO_AI_RESULT)
			const aiResults = DEMO_MODE
				? NO_AI_RESULT
				: await processWithAI(responses, algResults, regenerateReason, send);

			// Guard 4: Client Abort during long-running Bedrock stream
			if (signal.aborted) throw new Error('Aborted by client');

			if (!aiResults.success) {
				patient.patientProfile.anonymizationProfile.status = 'failed';
				patient.patientProfile.anonymizationProfile.errorMessage = aiResults.error;
				await patient.save();
				send({ error: 'AI processing failed: ' + aiResults.error });
				return;
			}

			// --- PHASE 3: BUILD fieldRewrites + searchReplace (v2 schema) ---
			const { fieldRewrites, searchReplace } = buildRedactionRules(algResults, aiResults, responses);

			// Save the final completed footprint
			patient.patientProfile.anonymizationProfile = {
				status: 'completed',
				generatedAt: new Date(),
				version: 2,
				fieldRewrites,
				searchReplace
			};

			await patient.save();
			send({ label: 'Profile saved', percent: 98 });

			// Fold this generation's AI spend (Comprehend + Haiku) into the
			// patient's aiCost ledger. Best-effort — never blocks profile completion.
			await addAiCostTrace(patientId, buildRedactionTrace(aiResults, { version: 2 }));

			send({ done: true });

		} catch (error) {
			if (error.message === 'Aborted by client' || signal.aborted) {
				console.log("Anonymization aborted mid-flight for patient", patientId);
				// Rollback to aborted state so we don't block future generations.
				try {
					const user = await User.findById(patientId);
					if (user) {
						user.patientProfile.anonymizationProfile.status = 'aborted';
						await user.save();
					}
				} catch(_) {}
				send({ error: 'Aborted by client' });
				return;
			}

			console.error("Anonymization process error:", error);

			// Attempt to mark as failed
			try {
				const user = await User.findById(patientId);
				if (user) {
					user.patientProfile.anonymizationProfile.status = 'failed';
					user.patientProfile.anonymizationProfile.errorMessage = error.message;
					await user.save();
				}
			} catch(_) {}

			send({ error: error.message });
		} finally {
			ctrl.close();
		}
	})();

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
		}
	});
}
