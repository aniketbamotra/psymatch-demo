import { fetchCurrentLegalBundle } from '$lib/utils/legal';
import { generateLegalPdf } from '$lib/utils/legalPdf';

// POST /api/legal/download — returns an A4 PDF of the live legal bundle in
// the requested locale. Body: { locale: 'en' | 'fr', headings?: {...} }
// The patient triggers this from the TOS modal's Download button.
export async function POST({ locals, request }) {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	let body = {};
	try {
		body = await request.json();
	} catch {
		// Empty/invalid body is fine — defaults will be used
	}
	const locale = body?.locale === 'fr' ? 'fr' : 'en';
	const headings =
		body?.headings && typeof body.headings === 'object'
			? body.headings
			: locale === 'fr'
			  ? {
						title: 'Conditions d’utilisation PsyMatch',
						tos: 'Conditions d’utilisation',
						privacyOfficer: 'Agent de confidentialité',
						jurisdiction: 'Avis réglementaire'
			    }
			  : {
						title: 'PsyMatch Terms of Service',
						tos: 'Terms of Service',
						privacyOfficer: 'Privacy Officer',
						jurisdiction: 'Regulatory Notice'
			    };

	try {
		const bundle = await fetchCurrentLegalBundle();
		const buffer = await generateLegalPdf(bundle, locale, headings);
		const filename = `psymatch-terms-${locale}.pdf`;
		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': String(buffer.length),
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		console.error('POST /api/legal/download failed:', err);
		return new Response('Failed to build PDF', { status: 500 });
	}
}
