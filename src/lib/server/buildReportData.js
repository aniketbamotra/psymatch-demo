// Map the agent's structured report content (sot.sections — the V2.18 11-section
// shape written by psymatch-agent) into the `data` object that the
// pdf.psymatch.ca render service (report-template.mjs) consumes.
//
// Used only for the AI-generated reports (Comprehensive / Concise + French),
// which render via Chromium at pdf.psymatch.ca. The legacy/algorithmic reports
// keep their existing PDFKit path untouched.
//
// Inputs are assumed ALREADY de-tokenized (caller runs deTokenizeReport over the
// sot first), so PHI display values are present.
//
// ─── SHARED CONTRACT — the three render `data` shapes ───────────────────────
// These are the exact objects the in-app renderers (aiReportPdf.js / aiReportDocx.js)
// AND the agent's stored variants must agree on. The PDF/DOCX generators read
// these fields verbatim, so do not rename keys without updating both sides.
//
// buildReportData (comprehensive | concise)  →  /report shape (unchanged):
//   { meta:{title,eyebrow,patient,patientId,dateOfAssessment,format,runType,language,totalPages},
//     identification:{age,gender,maritalStatus,occupation,priorPsychotherapy,education,
//                     medications,substanceUse,primaryConcerns},
//     interviews:[string], snapshot:[{label,text}], clinicalSummary:[para], history:[para],
//     risk:{lead,bullets:[string],narrative},
//     diagnostic:{primary:{name,dsm,icd,severity,rationale,selection},
//                 comorbid:[{name,dsm,icd,severity,rationale}], subthreshold:string, disclaimer},
//     caseConceptualization:[para], treatment:[{phase,title,emphasize,body}],
//     medication:string, prognosis:{body,closing} }
//
// buildLetterData (referral)  →  business-letter shape (V2.17r2):
//   { meta:{patient,patientId,dateOfAssessment,letterDate,eyebrow,language},
//     recipient:{name,address,cityStateZip},          // empty strings → renderer prints literals
//     salutation:string,
//     opening:[para],
//     snapshot:{bullets:[{label,text}]},              // from comprehensive §3
//     riskNote:[para],
//     psychosocial:[para],
//     primary:{name,dsm,icd,severity,rationale},      // from comprehensive §7
//     comorbid:[{name,dsm,icd,severity,rationale}],   // from comprehensive §7
//     subthreshold:[para],                            // from comprehensive §7
//     conceptualization:[para],
//     treatment:[para],
//     closing:{signoff,clinician,system},
//     footerNote:string }
//
// buildPatientSummaryData (patient_summary)  →  warm-summary shape:
//   { meta:{patient,patientId,dateOfAssessment,language,eyebrow,title},
//     sections:[{id,title,paragraphs:[para],italic?:boolean}] }   // 6 sections; §6 italic
// ─────────────────────────────────────────────────────────────────────────────

import { labelFor } from './agentInput/labels.js';
import { interviewLabel, sortInterviewKeys } from './agentInput/knownInterviewKeys.js';

const DISCLAIMER =
	'Diagnostic impressions reflect currently available structured assessment data and may be refined as additional longitudinal or collateral information becomes available.';

const FORMAT_TITLE = {
	comprehensive: 'PsyMatch Comprehensive Clinical Assessment Report',
	concise: 'PsyMatch Concise Clinical Assessment Report'
};

const cap = (s) => (typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const paras = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : arr ? [arr] : []);
const joinParas = (arr) => paras(arr).join('\n\n');

// Strip diacritics + lowercase, so a French key ("Âge", "Médicaments", "État
// civil") matches the same pattern as its English counterpart. Without this the
// FR variants silently lose every row whose key the English regex can't match.
const norm = (v) =>
	String(v ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();

// Pull a value out of §1 identification pairs by matching the (normalized) key.
function findId(pairs, re) {
	const hit = (pairs || []).find((p) => re.test(norm(p.key)));
	return hit ? hit.value : '';
}

// §1 cells that must NOT be left to the model. The agent had no field→source
// binding for these, so it printed whatever it happened to label "Prior
// Psychotherapy" / "Primary Concerns" — reliably harvesting the adult-bio
// free-text "additional details" block instead of the real answers, because the
// case-context brief surfaces that free text at a shallower path than the true
// prior-therapy answer (caught 2026-07-28). Both cells are now derived from the
// stored payload; the agent's own value survives only as a fallback for reports
// whose payload predates the bio interview.
function bioStructured(agentInput) {
	return agentInput?.interviews?.adult_biographical?.structured_result ?? null;
}

// ADULT_BIO q21 `past_therapy` — the genuine prior-psychotherapy question.
function priorTherapyCell(bio, language) {
	const ph = bio?.psychological_history;
	if (!ph) return '';
	if (ph.prior_therapy_reported !== true) {
		return language === 'fr' ? 'Aucune signalée' : 'None reported';
	}
	const d = ph.prior_therapy_details;
	const yes = language === 'fr' ? 'Oui' : 'Yes';
	if (!d || typeof d !== 'object') return yes;
	const parts = [d.reason, d.length, d.location].map((v) => String(v ?? '').trim()).filter(Boolean);
	return parts.length ? `${yes} — ${parts.join('; ')}` : yes;
}

// ADULT_BIO q29 `reasons_for_cct` — the presenting-concerns checkbox group. NOT
// q30 `additional_details`, which is §4/§5 narrative material.
//
// labelFor() is applied per entry because payloads stored BEFORE the resolver
// landed in responses.js hold raw i18n keys; without this, re-downloading an
// older report prints 'Questionnaire.Config.AdultBio.reasons_for_cct.options.4'.
function primaryConcernsCell(bio) {
	const pc = bio?.presenting_concerns;
	const clean = (v) => (labelFor(v) ?? String(v ?? '')).trim();
	if (Array.isArray(pc)) return pc.map(clean).filter(Boolean).join('; ');
	return clean(pc);
}

// The patient identifier shown in a report is the FileMaker id. A Mongo ObjectId
// must never appear — legacy agent payloads stored one under patient.patient_id,
// so anything ObjectId-shaped (24 hex chars) is dropped rather than rendered.
function notObjectId(v) {
	const s = String(v ?? '').trim();
	return /^[0-9a-f]{24}$/i.test(s) ? '' : s;
}

// Fixed wording from the Core Standard (§9.10.1, §9.11). Printed by the renderer,
// never taken from model output, so it is verbatim in every report.
export const TREATMENT_REFERENCE_MESSAGE =
	'Treatment options below are selected on the basis of evidence. The evidence column names the guideline source and the strength of evidence for effectiveness.';
export const MEDICATION_STATEMENT =
	'PsyMatch provides general background information about medication considerations and does not make medication recommendations. All medication decisions must be made by a licensed healthcare professional with prescriptive authority in the applicable jurisdiction, acting within their authorized scope of practice.';
// Core Standard §9.7 introductory note, printed in italics under the Section 7 heading.
export const DIAGNOSTIC_NOTE =
	"The following categories reflect the patient's PsyMatch structured DSM-5 diagnostic interview responses and are provided for independent clinician review. Final diagnoses require clinical evaluation and verification by a qualified diagnostician.";

function joinSelection(...parts) {
	return parts
		.map((p) => String(p ?? '').trim())
		.filter(Boolean)
		.join('\n');
}

/**
 * @param {object} args
 * @param {Record<number, any>} args.sections  De-tokenized agent sot sections (1..11).
 * @param {'comprehensive'|'concise'} args.format
 * @param {'en'|'fr'} args.language
 * @param {object} [args.agentInput]  The stored agent_input (for module coverage / patient id).
 * @param {object} [args.report]      The GenerativeReport doc (jobId, completedAt).
 * @returns {object} render `data` object for pdf.psymatch.ca /report
 */
export function buildReportData({
	sections = {},
	format,
	language,
	agentInput,
	report,
	patientId
}) {
	const s = (n) => sections[n] || {};
	const id1 = s(1).identification || [];
	const bio = bioStructured(agentInput);

	// Payload first, §1 second: the agent now writes only the FIRST name into
	// narrative prose, and §1's "Name" entry is the one field it could shorten by
	// mistake. The cover page, footer and DOCX header must stay on the legal name.
	const patientName = agentInput?.patient?.name || findId(id1, /name|nom/) || 'Patient';
	// The display id is ALWAYS the patient's fileMakerId — supplied by the caller,
	// else read from the agent payload (which now also carries the fileMakerId).
	// notObjectId() guards the legacy payloads that stored the Mongo ObjectId
	// there: an ObjectId must NEVER reach a report. Empty renders as "—".
	const displayId = notObjectId(patientId) || notObjectId(agentInput?.patient?.patient_id) || '';

	// Interviews: source from the stored module coverage (accurate) rather than
	// parsing the §2 prose. Every administered interview is listed — including
	// the suicide/self-harm module, which an earlier filter excluded here while
	// the agent's own §2 text listed it, making the rendered list contradict
	// the report body (caught on patient 11397, 2026-07-28).
	const administered = sortInterviewKeys(agentInput?.module_coverage?.administered || []);
	const interviews = administered.map(interviewLabel);

	// §3 Clinical Snapshot — bullets map 1:1 to {label,text}.
	const snapshot = (s(3).bullets || []).map((b) => ({ label: b.label, text: b.text }));

	// §6 Risk — fixed block (when present) → lead + bullets; narrative from paragraphs.
	const fixed = s(6).fixedLines || [];
	const risk = {
		lead: fixed.length ? fixed[0] : '',
		bullets: fixed.length > 1 ? fixed.slice(1) : [],
		narrative: joinParas(s(6).paragraphs)
	};

	// §7 Diagnostic — primary + comorbid + subthreshold.
	const dx = s(7);
	const mapDx = (d) =>
		d
			? {
					name: d.name,
					dsm: d.dsmCode,
					icd: d.icd11Code,
					severity: cap(d.severity),
					rationale: d.rationale
				}
			: null;
	const diagnostic = {
		// V2.18 revision: the agent now returns selectionStatement (+ presentingFocus).
		// Reports stored before it have neither, so selection stays '' and the card
		// renders exactly as it always did.
		primary: dx.primary
			? { ...mapDx(dx.primary), selection: joinSelection(dx.selectionStatement, dx.presentingFocus) }
			: null,
		comorbid: (dx.comorbid || []).map(mapDx),
		note: DIAGNOSTIC_NOTE,
		subthreshold: joinParas(dx.subthreshold),
		disclaimer:
			'Diagnostic impressions reflect currently available structured assessment data and may be refined as additional longitudinal or collateral information becomes available.'
	};

	// §9 Treatment — phases → {phase, title, emphasize, body}. Roman numerals are
	// derived (not a fixed 5-entry table) so a 6th+ phase renders "PHASE VI", not "PHASE 6".
	const treatment = (s(9).phases || []).map((p, i) => ({
		// Reference renders "Phase I — <title>" as a plain bold subheading (no pill),
		// so the label is title-case, not the all-caps chip text it used to be.
		phase: `Phase ${toRoman(i + 1)}`,
		title: p.label,
		emphasize: i === 1,
		body: joinParas(p.paragraphs)
	}));

	// §9.10.1 Treatment Reference + §9.11 medication statement. Only reports that
	// carry the table (generated under the revised standard) get either, so older
	// stored reports render unchanged.
	const trRows = Array.isArray(s(9).treatmentReference) ? s(9).treatmentReference : [];
	const treatmentReference = trRows.length
		? {
				message: TREATMENT_REFERENCE_MESSAGE,
				rows: trRows.map((r) => ({
					diagnosis: r.diagnosis,
					options: r.treatmentOptions,
					medicationClasses: r.medicationClasses,
					planning: r.planningConsiderations,
					evidence: `${r.evidenceStrength} — ${r.guidelineSource}`,
					flag: r.interactionFlag === true
				})),
				note: String(s(9).interactionNote ?? '').trim()
			}
		: null;

	const formatLabel = (format === 'comprehensive' ? 'Comprehensive' : 'Concise') + ' · V2.18 Core';

	return {
		meta: {
			title: FORMAT_TITLE[format] || FORMAT_TITLE.comprehensive,
			eyebrow: 'CLINICAL REPORT — CONFIDENTIAL',
			patient: patientName,
			patientId: String(displayId),
			dateOfAssessment: fmtDate(report?.completedAt),
			format: formatLabel,
			runType: FORMAT_TITLE[format] || FORMAT_TITLE.comprehensive,
			language,
			totalPages: format === 'comprehensive' ? 12 : 8
		},
		identification: {
			// Keys are normalized (accents stripped), so each pattern must cover the
			// EN term AND the FR term the translate pass produces.
			age: findId(id1, /age/), //                    FR: âge → "age"
			gender: findId(id1, /gender|genre|sexe/),
			maritalStatus: findId(id1, /marital|matrimonial|etat civil|situation/),
			occupation: findId(id1, /occupation|employ|profession|emploi|travail/),
			// Bound to their real question ids — see priorTherapyCell/primaryConcernsCell.
			priorPsychotherapy:
				priorTherapyCell(bio, language) || findId(id1, /prior|psychotherap|anterieur/),
			education: findId(id1, /education|career|training|formation|scolarit|carriere/),
			medications: findId(id1, /medication|medicament/),
			substanceUse: findId(id1, /substance|alcohol|alcool|drug|drogue/),
			primaryConcerns:
				primaryConcernsCell(bio) || findId(id1, /concern|preoccupation|motif|plainte/)
		},
		interviews,
		snapshot,
		clinicalSummary: paras(s(4).paragraphs),
		history: paras(s(5).paragraphs),
		risk,
		diagnostic,
		caseConceptualization: paras(s(8).paragraphs),
		treatment,
		treatmentReference,
		medication: joinParas(s(10).paragraphs),
		medicationStatement: treatmentReference ? MEDICATION_STATEMENT : '',
		prognosis: {
			body: joinParas(s(11).paragraphs),
			closing: s(11).closingLine || ''
		}
	};
}

// Map an agent diagnosis sub-object to the flat {name,dsm,icd,severity,rationale}
// shape the referral renderer consumes. Mirrors the mapper inside buildReportData.
function mapDxFlat(d) {
	return d
		? {
				name: d.name,
				dsm: d.dsmCode,
				icd: d.icd11Code,
				severity: cap(d.severity),
				rationale: d.rationale
			}
		: null;
}

/**
 * Map the agent's referral letterSections + the comprehensive sections to the
 * structured V2.17r2 referral-letter `data` shape (see SHARED CONTRACT above).
 * Inputs assumed de-tokenized.
 *
 * Snapshot bullets + primary/comorbid/subthreshold are pulled from
 * `comprehensiveSections` §3/§7 (the same accessors buildReportData uses). The
 * letter prose (opening / risk / psychosocial / conceptualization / treatment) is
 * taken from the agent's flat `letterSections` ({id,title,paragraphs}) when those
 * titled sections are present, and otherwise derived from the comprehensive body.
 *
 * @param {object} args
 * @param {Record<string|number, any>} [args.letterSections]      sot.variants.referral_*.letterSections
 * @param {Record<number, any>} [args.comprehensiveSections]      de-tokenized comprehensive sot.sections (1..11)
 * @param {'en'|'fr'} args.language
 * @param {string} args.patient    De-tokenized patient display name.
 * @param {string} args.patientId
 * @param {object} [args.report]
 * @returns {object} referral-letter render `data`
 */
export function buildLetterData({
	letterSections = {},
	comprehensiveSections = {},
	language,
	patient,
	patientId,
	report
}) {
	// Flat, id-sorted list of the agent's referral prose sections.
	const ls = Object.values(letterSections)
		.filter((s) => s && s.id != null)
		.map((s) => ({ id: s.id, title: String(s.title || ''), paragraphs: paras(s.paragraphs) }))
		.sort((a, b) => a.id - b.id);
	// Return the paragraphs of the first letter section whose title matches `re`.
	// Titles are normalized so the FR letter ("Résumé psychosocial", "Évaluation
	// du risque") resolves to the same sections as the EN one.
	const lfind = (re) => {
		const hit = ls.find((s) => re.test(norm(s.title)));
		return hit && hit.paragraphs.length ? hit.paragraphs : null;
	};

	const cs = (n) => comprehensiveSections[n] || {};

	// §3 Clinical Snapshot — bullets map 1:1 to {label,text}.
	const snapshotBullets = (cs(3).bullets || []).map((b) => ({ label: b.label, text: b.text }));

	// §7 Diagnostic — primary + comorbid + subthreshold.
	const dx = cs(7);
	const primary = mapDxFlat(dx.primary);
	const allComorbid = (dx.comorbid || []).map(mapDxFlat).filter(Boolean);
	// A referral letter is a one-to-two page clinician-to-clinician note, and it
	// paints each co-morbid diagnosis as a full card in the same grid the
	// comprehensive report uses. The comprehensive report grows with the diagnosis
	// count by design; the letter must not. Beyond four, the rest are named in one
	// sentence so nothing is lost and the letter keeps its shape.
	const LETTER_COMORBID_CARDS = 4;
	const comorbid = allComorbid.slice(0, LETTER_COMORBID_CARDS);
	const overflow = allComorbid.slice(LETTER_COMORBID_CARDS);
	const subthreshold = paras(dx.subthreshold);
	// The overflow names SUPPORTED diagnoses, so it belongs under the Co-Morbid
	// heading, not the Subthreshold one. It was briefly appended to `subthreshold`,
	// which printed a sentence reading "Additional supported co-morbid diagnoses…"
	// directly beneath a heading asserting the opposite — on a patient with ten
	// supported diagnoses that mislabelled five confirmed comorbidities to a
	// referring clinician.
	const comorbidOverflow = overflow.length
		? (() => {
				const names = overflow
					.map((d) => d.name)
					.filter(Boolean)
					.join(', ');
				return language === 'fr'
					? `Autres diagnostics comorbides retenus : ${names}. Voir le rapport clinique complet.`
					: `Additional supported co-morbid diagnoses: ${names}. See the full clinical report.`;
			})()
		: '';

	// Comprehensive fallbacks for the prose blocks (brief = first paras).
	const fallbackOpening = paras(cs(4).paragraphs).slice(0, 2);
	const s6 = cs(6);
	const fallbackRisk = [s6.fixedLines?.[0], ...paras(s6.paragraphs)].filter(Boolean).slice(0, 2);
	const fallbackPsychosocial = paras(cs(5).paragraphs).slice(0, 2);
	const fallbackConcept = paras(cs(8).paragraphs).slice(0, 2);
	const fallbackTreatment = (cs(9).phases || [])
		.map((p) => {
			const body = joinParas(p.paragraphs);
			return p.label ? `${p.label}: ${body}` : body;
		})
		.filter(Boolean);

	// Each pattern covers the EN title AND the FR title (titles are normalized, so
	// accents are already stripped: "évaluation" → "evaluation").
	const opening =
		lfind(/open|introduc|present|writ|reason|context|ouvertur|objet/) ||
		(ls[0] && ls[0].paragraphs) ||
		fallbackOpening;
	const riskNote =
		lfind(/risk|safety|suicid|self-harm|risque|securite|auto-agress/) || fallbackRisk;
	const psychosocial =
		lfind(/psychosocial|history|background|social|develop|antecedent|histoire|biographique/) ||
		fallbackPsychosocial;
	const conceptualization =
		lfind(/conceptual|formulation|understand|comprehension/) || fallbackConcept;
	const treatment =
		lfind(/treatment|plan|recommend|intervention|next step|traitement|recommandation|prochaine/) ||
		fallbackTreatment;
	// The reference letter closes with a short "Closing" section before the signoff.
	const closingBody = lfind(
		/closing|conclusion|continuity|clarification|contact|cloture|conclu/
	) || [
		'This summary is based on the current structured clinical assessment and should be interpreted within ongoing clinical review. Please contact PsyMatch if clarification would support continuity of care.'
	];

	return {
		meta: {
			patient: patient || 'Patient',
			patientId: notObjectId(patientId),
			dateOfAssessment: fmtDate(report?.completedAt),
			letterDate: fmtDate(report?.completedAt || Date.now()),
			eyebrow: 'REFERRAL SOURCE LETTER — CONFIDENTIAL',
			language
		},
		recipient: { name: '', address: '', cityStateZip: '' },
		salutation: 'Dear Colleague,',
		opening: paras(opening),
		snapshot: { bullets: snapshotBullets },
		riskNote: paras(riskNote),
		psychosocial: paras(psychosocial),
		primary,
		comorbid,
		// Named under the Co-Morbid heading, never under Subthreshold.
		comorbidOverflow,
		subthreshold,
		conceptualization: paras(conceptualization),
		treatment: paras(treatment),
		closing: {
			body: closingBody,
			signoff: 'Sincerely,',
			clinician: '[Clinician Name, Credentials]',
			system: 'PsyMatch Clinical Interview System'
		},
		footerNote: DISCLAIMER
	};
}

/**
 * Map the agent's patient-summary variant (sot.variants.patient_summary_<lang>.sections)
 * to the warm 6-section summary `data` shape (see SHARED CONTRACT above). Inputs
 * assumed de-tokenized. Each section keeps its {id,title,paragraphs}; the final
 * section (id 6) is rendered italic.
 *
 * @param {object} args
 * @param {Record<string|number, any>|Array} [args.summarySections]
 * @param {'en'|'fr'} args.language
 * @param {string} args.patient
 * @param {string} args.patientId
 * @param {object} [args.report]
 * @returns {object} patient-summary render `data`
 */
export function buildPatientSummaryData({
	summarySections = {},
	language,
	patient,
	patientId,
	report
}) {
	const sections = Object.values(summarySections)
		.filter((s) => s && s.id != null)
		.map((s) => ({
			id: s.id,
			title: String(s.title || ''),
			paragraphs: paras(s.paragraphs),
			italic: Number(s.id) === 6
		}))
		.sort((a, b) => a.id - b.id);

	return {
		meta: {
			patient: patient || 'Patient',
			patientId: notObjectId(patientId),
			dateOfAssessment: fmtDate(report?.completedAt),
			language,
			eyebrow: 'PsyMatch Clinical Interview Summary',
			title: 'Clinical Interview Summary'
		},
		sections
	};
}

// Arabic → Roman numeral (1 → "I", 6 → "VI"). Used for treatment-phase labels so
// any number of phases renders a proper numeral.
function toRoman(n) {
	const map = [
		[10, 'X'],
		[9, 'IX'],
		[5, 'V'],
		[4, 'IV'],
		[1, 'I']
	];
	let r = '';
	let v = Number(n) || 0;
	for (const [val, sym] of map) {
		while (v >= val) {
			r += sym;
			v -= val;
		}
	}
	return r || String(n);
}

function fmtDate(d) {
	if (!d) return '';
	try {
		return new Date(d).toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	} catch {
		return '';
	}
}
