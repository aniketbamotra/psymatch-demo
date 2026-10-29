// src/lib/server/anonymizeCase.js
//
// PHI redaction for the agentic comprehensive-report flow.
//
// Design (per product decisions):
//   - SOURCE OF TRUTH for "what is PHI" is the existing AI-generated redaction
//     profile (User.patientProfile.anonymizationProfile). The AI already
//     produced the complete find→replace data as `searchReplace`; we run
//     deepReplace over the case using THAT data. No second detector.
//   - Instead of the profile's one-way fake names, each `find` value is replaced
//     with a REVERSIBLE coded token (redCode.js) so the agent never sees raw PHI
//     but the clinician PDF can be de-tokenized on download.
//   - Dates the profile preserves are generalized AND tagged (month/year),
//     deterministically.
//   - FAIL CLOSED: no completed profile, or any known patient identifier
//     surviving redaction ⇒ refuse to dispatch.
//
// Reuses the shared deepReplace engine from applyAnonymization.js so token
// substitution behaves identically to the PDF flow (word boundaries, the
// Questionnaire.Config.* safeguard, etc.).

import { User } from '$lib/database/schemas.js';
import { deepReplace } from '$lib/utils/anonymization/applyAnonymization.js';
import {
	buildRedCodeMap,
	deriveEntriesFromSearchReplace,
	forwardPairs,
	reversePairs,
	maskPairs,
	tokenizeDatesDeep,
	collectBackstop,
	collectResidualPHI
} from '$lib/utils/anonymization/redCode.js';

/**
 * Redact a built agentInput case for safe dispatch to the agent.
 *
 * @param {object} args
 * @param {string} args.patientId
 * @param {object} args.agentInput - the psymatch.agent_input.v1 payload
 * @returns {Promise<{
 *   redactedCase: object,
 *   redCodeMap: Array<{code,token,desc,category,find,value}>,
 *   leak: { blocked: boolean, residual: string[] },
 *   warnings: string[]
 * }>}
 */
export async function anonymizeCaseForAgent({ patientId, agentInput }) {
	const warnings = [];

	const user = await User.findById(patientId)
		.select('fullName email patientProfile.phoneNumber patientProfile.anonymizationProfile')
		.lean();

	const profile = user?.patientProfile?.anonymizationProfile;

	// Fail closed: redaction is driven entirely by the AI profile. No completed
	// profile ⇒ we cannot guarantee PHI removal, so we refuse to dispatch.
	if (!profile || profile.status !== 'completed') {
		return {
			redactedCase: agentInput,
			redCodeMap: [],
			leak: { blocked: true, residual: ['<no completed redaction profile>'] },
			warnings: ['No completed redaction profile — generate one before dispatching.']
		};
	}

	const knownPatient = {
		name: user.fullName || '',
		phone: user.patientProfile?.phoneNumber || '',
		email: user.email || ''
	};

	// The AI profile is generated from the Adult Bio interview, so it can MISS the
	// patient's canonical identity stored on the User doc (fullName / phoneNumber /
	// email) when those differ from what was typed into the interview. Tokenize
	// those known identifiers explicitly and FIRST (descriptor priority) so they
	// are always redacted — otherwise the leak guard below blocks every dispatch.
	const t = (v) => String(v ?? '').trim();
	const knownEntries = [];
	const fullName = t(knownPatient.name);
	if (fullName.length >= 2) {
		knownEntries.push({ value: fullName, desc: 'Name of Patient', category: 'name' });
		// Also the individual name parts, so a standalone first/last name in free
		// text is caught (the leak guard only checks the full name, but parts can
		// still be real PHI). length>=3 avoids tokenizing trivial fragments.
		for (const part of fullName.split(/\s+/)) {
			if (part.length >= 3) knownEntries.push({ value: part, desc: 'Name of Patient', category: 'name' });
		}
	}
	if (t(knownPatient.phone).length >= 4) {
		knownEntries.push({ value: t(knownPatient.phone), desc: 'Phone of Patient', category: 'phone' });
	}
	if (t(knownPatient.email).length >= 4) {
		knownEntries.push({ value: t(knownPatient.email), desc: 'Email of Patient', category: 'email' });
	}

	// PHI find-list = explicit known identifiers + the profile's AI-generated
	// searchReplace (tagged with descriptors). buildRedCodeMap dedupes by value
	// (first wins), so a profile rule duplicating a known identifier keeps the
	// known "… of Patient" descriptor.
	const profileEntries = deriveEntriesFromSearchReplace(profile.searchReplace, knownPatient);
	const entries = [...knownEntries, ...profileEntries];
	if (!profileEntries.length) {
		warnings.push('Profile has no searchReplace rules — only known identifiers, the date pass + contact backstop will apply.');
	}
	const profileMap = buildRedCodeMap({ patientId, entries });

	// 1) Profile-driven tokens (the deepReplace pass over the profile data).
	let redactedCase = deepReplace(agentInput, forwardPairs(profileMap));

	// 2) Generalize + tag every remaining explicit date (the AI profile
	//    preserves dates, so they would otherwise reach the agent in the clear).
	const dateResult = tokenizeDatesDeep(redactedCase, patientId);
	redactedCase = dateResult.data;

	// 3) Regex backstop for any emails/phones the profile missed.
	const backstopMap = collectBackstop(redactedCase, patientId, [
		...profileMap,
		...dateResult.entries
	]);
	if (backstopMap.length) {
		redactedCase = deepReplace(redactedCase, forwardPairs(backstopMap));
		warnings.push(`Backstop tokenized ${backstopMap.length} contact value(s) missing from the profile.`);
	}

	const redCodeMap = [...profileMap, ...dateResult.entries, ...backstopMap];

	// 4) Hard leak guard: any KNOWN patient identifier still present ⇒ block.
	const residual = collectResidualPHI(redactedCase, [
		knownPatient.name,
		knownPatient.phone,
		knownPatient.email
	]);

	return {
		redactedCase,
		redCodeMap,
		leak: { blocked: residual.length > 0, residual },
		warnings
	};
}

/**
 * Reverse a redCode map over a returned report/SoT (all string leaves),
 * restoring display values for the clinician-facing output.
 */
export function deTokenizeReport(report, redCodeMap) {
	if (!Array.isArray(redCodeMap) || redCodeMap.length === 0) return report;
	return deepReplace(report, reversePairs(redCodeMap));
}

/**
 * Redacted counterpart of {@link deTokenizeReport}: replace every redCode token
 * with a readable de-identified label ([Patient name], [Date of birth], …)
 * instead of the real PHI. Used for a "download a redacted AI report" request so
 * the produced file is safe to share. No-op when there is nothing to mask.
 */
export function maskTokensReport(report, redCodeMap) {
	if (!Array.isArray(redCodeMap) || redCodeMap.length === 0) return report;
	return deepReplace(report, maskPairs(redCodeMap));
}
