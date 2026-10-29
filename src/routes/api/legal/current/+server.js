import { json } from '@sveltejs/kit';
import { fetchCurrentLegalBundle } from '$lib/utils/legal';

// GET /api/legal/current — returns the active legal bundle (tos + privacy officer
// + active jurisdiction footer + the full jurisdictions list for the admin UI).
// Any authenticated user may read. Unauthenticated requests get 401.
export async function GET({ locals }) {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const bundle = await fetchCurrentLegalBundle();
		return json({ success: true, bundle });
	} catch (err) {
		console.error('GET /api/legal/current failed:', err);
		return json({ success: false, error: 'Failed to load legal bundle' }, { status: 500 });
	}
}
