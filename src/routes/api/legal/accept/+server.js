import { json } from '@sveltejs/kit';
import { User } from '$lib/database/schemas';
import { fetchCurrentLegalBundle, buildSnapshotFromBundle } from '$lib/utils/legal';

// POST /api/legal/accept — patient confirms the TOS bundle.
// Body: { acceptedLanguage: 'en' | 'fr' }
// Server re-reads the live legal docs and writes its own snapshot — the client
// never supplies the content, only the locale they accepted in.
export async function POST({ locals, request }) {
	if (!locals.user || locals.user.userType !== 'patient') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	const lang = body?.acceptedLanguage === 'fr' ? 'fr' : 'en';

	try {
		const bundle = await fetchCurrentLegalBundle();
		const snapshot = buildSnapshotFromBundle(bundle, lang);

		if (!snapshot.tos || !snapshot.privacyOfficer || !snapshot.jurisdictionFooter) {
			return json(
				{ success: false, error: 'Legal content is not fully configured' },
				{ status: 500 }
			);
		}

		await User.updateOne(
			{ _id: locals.user._id },
			{
				$set: {
					'patientProfile.agreement': {
						accepted: true,
						acceptedAt: new Date(),
						acceptedLanguage: lang,
						snapshot
					}
				}
			}
		);

		return json({ success: true });
	} catch (err) {
		console.error('POST /api/legal/accept failed:', err);
		return json({ success: false, error: 'Failed to record acceptance' }, { status: 500 });
	}
}
