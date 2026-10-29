import { fetchCurrentLegalBundle, patientNeedsTOS } from '$lib/utils/legal';
import { normalizeLanguage } from '$lib/utils/language';

// Runs on every authenticated (app)/* request. For patients, decides whether
// to render the blocking TOS modal and fetches the live legal bundle so the
// modal can render without an extra round-trip. Admins get a no-op.
export const load = async ({ locals }) => {
	const user = locals.user;

	const base = {
		user: user
			? {
					_id: String(user._id),
					email: user.email,
					fullName: user.fullName,
					userType: user.userType,
					isDirector: !!user.isDirector,
					// Patients always resolve to a real language (legacy rows with none
					// read as English). Admins stay null on purpose — the layout uses
					// this to force the locale, and admins pick their own.
					preferredLanguage:
						user.userType === 'patient'
							? normalizeLanguage(user.patientProfile?.preferredLanguage)
							: null
			  }
			: null,
		needsTOS: false,
		legalBundle: null
	};

	if (!user || user.userType !== 'patient') return base;

	try {
		const bundle = await fetchCurrentLegalBundle();
		const needsTOS = patientNeedsTOS(user, bundle);
		return {
			...base,
			needsTOS,
			legalBundle: needsTOS ? bundle : null
		};
	} catch (err) {
		console.error('Legal gate load failed:', err);
		// Fail open: better to let the patient through than to lock them out on a transient error.
		return base;
	}
};
