import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { User, Assignment, Questionnaire, Response as DBResponse } from '$lib/database/schemas.js';

/**
 * GET /api/anonymization/profile/[patientId]
 * Returns the full anonymization profile + original field values for display.
 */
export async function GET({ params, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (locals.user.userType === 'patient') return json({ error: 'Forbidden' }, { status: 403 });

	const { patientId } = params;

	try {
		await connectToDatabase();

		const patient = await User.findById(patientId).lean();
		if (!patient) return json({ error: 'Patient not found' }, { status: 404 });

		const anonProfile = patient.patientProfile?.anonymizationProfile;
		if (!anonProfile || anonProfile.status !== 'completed') {
			return json({ error: 'No completed profile found' }, { status: 404 });
		}

		// Build patientInfo originals — schema uses fullName + patientProfile.phoneNumber
		const fullName = patient.fullName || '';
		const spaceIdx = fullName.indexOf(' ');
		const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName;
		const lastName  = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : '';

		const patientInfoOriginals = {
			firstName,
			lastName,
			phone: patient.patientProfile?.phoneNumber || '',
			email: patient.email || ''
		};

		// Fetch Adult Bio responses for field originals
		let adultBioOriginals = {};
		try {
			const questionnaire = await Questionnaire.findOne({
				$or: [{ test_code: 'ADULT_BIO' }, { 'title.en': 'Adult Biographical Interview' }]
			}).lean();

			if (questionnaire) {
				const assignment = await Assignment.findOne({
					patientId,
					questionnaireId: questionnaire._id,
					status: { $in: ['completed', 'downloaded'] }
				}).sort({ completedAt: -1 }).lean();

				if (assignment) {
					const responseDoc = await DBResponse.findOne({ assignmentId: assignment._id }).lean();
					if (responseDoc?.responses) {
						// Normalize responses array → { qN: value }
						responseDoc.responses.forEach(r => {
							if (r.questionId && r.value !== undefined) {
								adultBioOriginals[r.questionId] = r.value;
							}
						});
					}
				}
			}
		} catch (e) {
			console.warn('Could not fetch Adult Bio originals:', e.message);
		}

		return json({
			profile: {
				status: anonProfile.status,
				version: anonProfile.version,
				generatedAt: anonProfile.generatedAt,
				fieldRewrites: anonProfile.fieldRewrites || {},
				searchReplace: anonProfile.searchReplace || []
			},
			originals: {
				patientInfo: patientInfoOriginals,
				ADULT_BIO: adultBioOriginals
			},
			patientName: fullName
		});
	} catch (error) {
		console.error('Profile fetch error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

/**
 * PATCH /api/anonymization/profile/[patientId]
 * Saves manually edited fieldRewrites and searchReplace.
 */
export async function PATCH({ params, request, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (locals.user.userType === 'patient') return json({ error: 'Forbidden' }, { status: 403 });

	const { patientId } = params;

	try {
		const { fieldRewrites, searchReplace } = await request.json();
		await connectToDatabase();

		const patient = await User.findById(patientId);
		if (!patient) return json({ error: 'Patient not found' }, { status: 404 });

		patient.patientProfile.anonymizationProfile.fieldRewrites = fieldRewrites;
		patient.patientProfile.anonymizationProfile.searchReplace = searchReplace;
		patient.markModified('patientProfile.anonymizationProfile');
		await patient.save();

		return json({ success: true });
	} catch (error) {
		console.error('Profile patch error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
