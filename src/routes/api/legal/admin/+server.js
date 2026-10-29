import { json } from '@sveltejs/kit';
import { PrivacyOfficer, ActiveJurisdiction } from '$lib/database/schemas';
import { fetchCurrentLegalBundle } from '$lib/utils/legal';

function requireDirector(locals) {
	if (!locals.user || locals.user.userType !== 'admin' || !locals.user.isDirector) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}
	return null;
}

// GET /api/legal/admin — director reads the live bundle for the CMS UI.
export async function GET({ locals }) {
	const denied = requireDirector(locals);
	if (denied) return denied;
	try {
		const bundle = await fetchCurrentLegalBundle();
		return json({ success: true, bundle });
	} catch (err) {
		console.error('GET /api/legal/admin failed:', err);
		return json({ success: false, error: 'Failed to load bundle' }, { status: 500 });
	}
}

// PATCH /api/legal/admin — director writes the only two clinic-configurable docs:
// the privacy officer contact (structured fields) and the active jurisdiction pointer.
// TOS body and jurisdiction footer text are shipped by PsyMatch (seed script) and
// are not editable from this API.
//
// Body shapes:
//   { type: 'privacy_officer', name, email, phone, description }
//   { type: 'active_jurisdiction', activeJurisdictionValue: 'ontario' }
export async function PATCH({ locals, request }) {
	const denied = requireDirector(locals);
	if (denied) return denied;

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	const { type } = body || {};
	if (type !== 'privacy_officer' && type !== 'active_jurisdiction') {
		return json({ success: false, error: 'Type is not editable' }, { status: 400 });
	}

	try {
		const baseSet = { updatedBy: locals.user._id, updatedAt: new Date() };

		if (type === 'privacy_officer') {
			const set = {
				...baseSet,
				name: String(body.name || ''),
				email: String(body.email || ''),
				phone: String(body.phone || ''),
				mailingAddress: String(body.mailingAddress || '')
			};
			const result = await PrivacyOfficer.findOneAndUpdate(
				{ key: 'singleton' },
				{ $set: set, $inc: { version: 1 }, $setOnInsert: { key: 'singleton' } },
				{ new: true, upsert: true, setDefaultsOnInsert: true }
			).lean();
			return json({ success: true, updated: { type, version: result.version } });
		}

		if (!body.activeJurisdictionValue) {
			return json({ success: false, error: 'Missing activeJurisdictionValue' }, { status: 400 });
		}
		const result = await ActiveJurisdiction.findOneAndUpdate(
			{ key: 'singleton' },
			{
				$set: { ...baseSet, value: String(body.activeJurisdictionValue) },
				$inc: { version: 1 },
				$setOnInsert: { key: 'singleton' }
			},
			{ new: true, upsert: true, setDefaultsOnInsert: true }
		).lean();
		return json({ success: true, updated: { type, version: result.version } });
	} catch (err) {
		console.error('PATCH /api/legal/admin failed:', err);
		return json({ success: false, error: 'Failed to save' }, { status: 500 });
	}
}
