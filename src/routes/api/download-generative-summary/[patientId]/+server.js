import { json } from '@sveltejs/kit';
import { GenerativeReport, User } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import { deTokenizeReport, maskTokensReport } from '$lib/server/anonymizeCase.js';
import {
	buildReportData,
	buildLetterData,
	buildPatientSummaryData
} from '$lib/server/buildReportData.js';
import { renderAiPdf } from '$lib/utils/pdfGenerators/aiReportPdf.js';
import { renderAiDocx } from '$lib/utils/docxGenerators/aiReportDocx.js';
import { renderReferralLetterPdf } from '$lib/utils/pdfGenerators/referralLetterPdf.js';
import { renderReferralLetterDocx } from '$lib/utils/docxGenerators/referralLetterDocx.js';
import { REFERRAL_LETTER_KEY, findLetterJob, salutationFor } from '$lib/server/referralLetter.js';
import { interviewLabel } from '$lib/server/agentInput/knownInterviewKeys.js';

/**
 * GET /api/download-generative-summary/[patientId]?format=&language=&type=
 *
 * Streams a PDF or DOCX of a generated AI report. The report CONTENT is produced
 * by psymatch-agent and stored structured in Mongo:
 *   - comprehensive / en  → report.sot.sections
 *   - referral            → report.sot.variants[`referral_${language}`].letterSections
 *   - every other variant → report.sot.variants[`${format}_${language}`].sections
 *   - referral_letter     → sot.variants.referral_letter_en.document (standalone
 *                           letter, own template; see downloadReferralLetter)
 *
 * Rendering happens on demand, IN-PROCESS (PDFKit / docx) — no external Chromium
 * service. We read the stored structured content, reverse the redCode PHI tokens,
 * map it to the render `data` shape, and render the file locally.
 *
 * Query params:
 *   format   = comprehensive | concise | referral | patient_summary | referral_letter
 *              (default comprehensive; referral_letter is English only)
 *   language = en | fr                                               (default en)
 *   type     = pdf | docx                                            (default pdf)
 *
 * Responses:
 *   200 application/pdf · application/vnd...wordprocessingml.document
 *   403 not admin · 404 no report
 *   409 { preparing:true, status:'generating'|'absent', format, language }  variant not ready
 *   500 render failure
 */
export async function GET({ params, url, locals }) {
	if (!locals.user) {
		return new Response(null, { status: 302, headers: { Location: '/login' } });
	}
	if (locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized: admin access required' }, { status: 403 });
	}

	const { patientId } = params;
	if (!patientId) {
		return json({ error: 'Patient ID is required' }, { status: 400 });
	}

	const format = (url.searchParams.get('format') || 'comprehensive').toLowerCase();
	const language = (url.searchParams.get('language') || 'en').toLowerCase();
	const type = (url.searchParams.get('type') || 'pdf').toLowerCase();
	// Optional: download a REDACTED (de-identified) copy — tokens become labels
	// like "[Patient name]" instead of the real PHI. Default off (clinician copy).
	const redact = ['1', 'true', 'yes'].includes(
		(url.searchParams.get('redact') || '').toLowerCase()
	);
	if (!['comprehensive', 'concise', 'referral', 'patient_summary', 'referral_letter'].includes(format)) {
		return json({ error: `Unknown format "${format}"` }, { status: 400 });
	}
	if (!['en', 'fr'].includes(language)) {
		return json({ error: `Unknown language "${language}"` }, { status: 400 });
	}
	if (!['pdf', 'docx'].includes(type)) {
		return json({ error: `Unknown type "${type}"` }, { status: 400 });
	}

	await connectToDatabase();

	if (format === 'referral_letter') {
		if (language !== 'en') {
			return json({ error: 'The referral letter is English only' }, { status: 400 });
		}
		return downloadReferralLetter({ patientId, type, redact });
	}

	const report = await GenerativeReport.findOne({ patientId }).sort({ createdAt: -1 }).lean();
	if (!report) {
		return json(
			{
				error: 'No report found for this patient',
				details: 'Dispatch a comprehensive report first via /api/comprehensive-report.'
			},
			{ status: 404 }
		);
	}

	const variantKey = `${format}_${language}`;
	const isBaseComprehensive = format === 'comprehensive' && language === 'en';

	// READINESS GATE. The UI handles 409 by calling /api/ai-report/[patientId]/ensure
	// to advance the lazy dependency chain, polling, then re-downloading.
	if (isBaseComprehensive) {
		const hasSections =
			report.sot?.sections && Object.keys(report.sot.sections).length > 0;
		if (report.status !== 'successful' || !hasSections) {
			return json(
				{
					preparing: true,
					status: report.status === 'generating' ? 'generating' : 'absent',
					format,
					language
				},
				{ status: 409 }
			);
		}
	} else {
		const v = report.sot?.variants?.[variantKey];
		if (v?.status !== 'successful') {
			return json(
				{
					preparing: true,
					status: v?.status === 'generating' ? 'generating' : 'absent',
					format,
					language
				},
				{ status: 409 }
			);
		}
	}

	// Patient-facing ID is the FileMaker id, which lives on patientProfile — NOT
	// the Mongo ObjectId, which must never surface in a report or a filename.
	// Empty when the patient has no fileMakerId; the renderers then print "—".
	const userDoc = await User.findById(report.patientId)
		.select('patientProfile.fileMakerId')
		.lean();
	const fileMakerId = userDoc?.patientProfile?.fileMakerId || '';

	// Resolve redCode tokens across the whole SoT (sections + variants). Default:
	// de-tokenize to real PHI (clinician copy). When ?redact=1: mask each token to
	// a readable label ([Patient name]…) so the file is safe to share. No-op when
	// redCodeMap is empty.
	const sot = redact
		? maskTokensReport(report.sot, report.redCodeMap)
		: deTokenizeReport(report.sot, report.redCodeMap);

	// Patient display name from the resolved comprehensive §1 identification. In
	// redact mode the §1 value is already a masked label, so never fall back to the
	// raw agentInput name (which would re-expose PHI).
	const idPairs = sot?.sections?.['1']?.identification ?? sot?.sections?.[1]?.identification ?? [];
	const patientName =
		idPairs.find((p) => /name/i.test(String(p.key || '')))?.value ||
		(redact ? '[Patient name]' : report.agentInput?.patient?.name) ||
		'Patient';

	// Build the render `data` per format.
	let data;
	if (format === 'referral') {
		data = buildLetterData({
			letterSections: sot.variants[variantKey].letterSections,
			comprehensiveSections: sot.sections,
			language,
			patient: patientName,
			patientId: fileMakerId,
			report
		});
	} else if (format === 'patient_summary') {
		data = buildPatientSummaryData({
			summarySections: sot.variants[variantKey].sections,
			language,
			patient: patientName,
			patientId: fileMakerId,
			report
		});
	} else {
		const sections = isBaseComprehensive ? sot.sections : sot.variants[variantKey].sections;
		data = buildReportData({
			sections,
			format,
			language,
			agentInput: report.agentInput,
			report,
			patientId: fileMakerId
		});
	}

	// Render in-process.
	let buf;
	try {
		buf =
			type === 'docx'
				? await renderAiDocx(data, { format, language })
				: await renderAiPdf(data, { format, language });
	} catch (err) {
		console.error('[download-generative-summary] render failed:', err);
		return json({ error: 'Failed to render report', details: err.message }, { status: 500 });
	}

	const ext = type === 'docx' ? 'docx' : 'pdf';
	const contentType =
		type === 'docx'
			? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			: 'application/pdf';
	// Filename carries the FileMaker id — never the Mongo ObjectId. Omitted
	// entirely when the patient has no fileMakerId.
	const idPart = fileMakerId ? `-${fileMakerId}` : '';
	const filename = `psymatch-${format}-${language}${redact ? '-redacted' : ''}${idPart}.${ext}`;

	return new Response(buf, {
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Content-Length': String(buf.length),
			'Cache-Control': 'private, no-store'
		}
	});
}

/**
 * The standalone referral letter. Read from the latest job that HAS the letter
 * (not the latest job: every comprehensive dispatch makes a new one), using that
 * job's own redCodeMap, since those are the tokens the letter was written with.
 *
 * A `needs_review` letter downloads like a `successful` one (same file name);
 * its reviewWarnings stay in the database as the audit trail.
 */
async function downloadReferralLetter({ patientId, type, redact }) {
	const job = await findLetterJob(patientId, {
		patientId: 1,
		redCodeMap: 1,
		[`sot.variants.${REFERRAL_LETTER_KEY}`]: 1
	});
	const variant = job?.sot?.variants?.[REFERRAL_LETTER_KEY];
	const status = variant?.status;
	if (status !== 'successful' && status !== 'needs_review') {
		return json(
			{ preparing: true, status: status ?? 'absent', format: 'referral_letter', language: 'en' },
			{ status: 409 }
		);
	}
	if (!variant.document) {
		return json({ error: 'Referral letter has no document' }, { status: 500 });
	}

	// Reverse (or mask) tokens BEFORE layout so every measurement uses the
	// text that is actually printed.
	const restored = withInterviewNames(
		redact
			? maskTokensReport(variant.document, job.redCodeMap)
			: deTokenizeReport(variant.document, job.redCodeMap)
	);
	const letter = { ...restored, salutation: salutationFor(restored.recipient?.name) };

	let buf;
	try {
		buf =
			type === 'docx' ? await renderReferralLetterDocx(letter) : await renderReferralLetterPdf(letter);
	} catch (err) {
		console.error('[download-generative-summary] referral letter render failed:', err);
		return json({ error: 'Failed to render report', details: err.message }, { status: 500 });
	}

	const userDoc = await User.findById(job.patientId).select('patientProfile.fileMakerId').lean();
	const fileMakerId = userDoc?.patientProfile?.fileMakerId || '';
	const ext = type === 'docx' ? 'docx' : 'pdf';
	const contentType =
		type === 'docx'
			? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			: 'application/pdf';
	const filename = `psymatch-referral-letter-en${redact ? '-redacted' : ''}${fileMakerId ? `-${fileMakerId}` : ''}.${ext}`;

	return new Response(buf, {
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Content-Length': String(buf.length),
			'Cache-Control': 'private, no-store'
		}
	});
}

// The agent prints each interview's `interview_name`, which the case currently
// fills with the raw key ("comprehensive_suicide_self_harm"). Resolve keys to the
// app's display names; a real display name passes through unchanged.
function withInterviewNames(letter) {
	const names = letter?.interviewsCompleted;
	if (!Array.isArray(names)) return letter;
	return {
		...letter,
		interviewsCompleted: names.map((name) => (/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name) ? interviewLabel(name) : name))
	};
}
