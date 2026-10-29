import { Legal, PrivacyOfficer, ActiveJurisdiction } from '$lib/database/schemas';

// Feature flag — when true, an already-accepted patient whose stored snapshot's
// versions no longer match the live docs is re-prompted at login. v1 ships
// with this OFF (one-time acceptance only). The helper below is fully wired
// so flipping the flag enables re-prompt without further code.
export const LEGAL_REPROMPT_ON_CHANGE = false;

// Pulls the live legal bundle from three collections:
//   - `legal`              — TOS body + 4 jurisdiction footers (bilingual MD)
//   - `privacy_officer`    — structured contact card (single doc, English)
//   - `active_jurisdiction`— pointer naming which jurisdiction is active
export async function fetchCurrentLegalBundle() {
	const [tos, privacyOfficer, activeJurisdictionDoc, jurisdictions] = await Promise.all([
		Legal.findOne({ type: 'tos' }).lean(),
		PrivacyOfficer.findOne({}).lean(),
		ActiveJurisdiction.findOne({}).lean(),
		Legal.find({ type: 'jurisdiction' }).lean()
	]);

	const activeKey = activeJurisdictionDoc?.value || 'ontario';
	const activeJurisdiction = jurisdictions.find((j) => j.jurisdictionKey === activeKey) || null;

	return {
		tos: tos
			? { content: tos.content, version: tos.version, updatedAt: tos.updatedAt }
			: { content: { en: '', fr: '' }, version: 0, updatedAt: null },
		privacyOfficer: privacyOfficer
			? {
					name: privacyOfficer.name || '',
					email: privacyOfficer.email || '',
					phone: privacyOfficer.phone || '',
					mailingAddress: privacyOfficer.mailingAddress || '',
					version: privacyOfficer.version
			  }
			: { name: '', email: '', phone: '', mailingAddress: '', version: 0 },
		activeJurisdiction: activeJurisdiction
			? {
					key: activeJurisdiction.jurisdictionKey,
					label: activeJurisdiction.jurisdictionLabel,
					content: activeJurisdiction.content,
					version: activeJurisdiction.version
			  }
			: { key: activeKey, label: { en: '', fr: '' }, content: { en: '', fr: '' }, version: 0 },
		activeJurisdictionVersion: activeJurisdictionDoc?.version || 0,
		jurisdictions: jurisdictions.map((j) => ({
			key: j.jurisdictionKey,
			label: j.jurisdictionLabel,
			content: j.content,
			version: j.version
		}))
	};
}

// Render the structured Privacy Officer fields to a plain-text block. Used for
// the agreement snapshot and the PDF body — both want a stable serialized form.
export function serializePrivacyOfficer(po) {
	if (!po) return '';
	const lines = [];
	if (po.name) lines.push(`Name: ${po.name}`);
	if (po.email) lines.push(`Email: ${po.email}`);
	if (po.phone) lines.push(`Phone: ${po.phone}`);
	if (po.mailingAddress) lines.push(`Mailing address: ${po.mailingAddress}`);
	return lines.join('\n');
}

// Build a server-side snapshot from a freshly-fetched bundle, in the language
// the patient accepted in. Stored under patientProfile.agreement.
export function buildSnapshotFromBundle(bundle, locale) {
	const lang = locale === 'fr' ? 'fr' : 'en';
	return {
		tos: bundle.tos.content[lang] || '',
		privacyOfficer: serializePrivacyOfficer(bundle.privacyOfficer),
		jurisdictionFooter: bundle.activeJurisdiction.content[lang] || '',
		jurisdictionKey: bundle.activeJurisdiction.key,
		versions: {
			tos: bundle.tos.version,
			privacyOfficer: bundle.privacyOfficer.version,
			jurisdiction: bundle.activeJurisdiction.version,
			activeJurisdiction: bundle.activeJurisdictionVersion
		}
	};
}

// Built but only consulted when LEGAL_REPROMPT_ON_CHANGE is true.
export function legalSnapshotIsStale(user, bundle) {
	const v = user?.patientProfile?.agreement?.snapshot?.versions;
	if (!v) return true;
	return (
		v.tos !== bundle.tos.version ||
		v.privacyOfficer !== bundle.privacyOfficer.version ||
		v.jurisdiction !== bundle.activeJurisdiction.version ||
		v.activeJurisdiction !== bundle.activeJurisdictionVersion
	);
}

// The login-time gate decision. Returns true when the patient must see the modal.
export function patientNeedsTOS(user, bundle) {
	const a = user?.patientProfile?.agreement;
	const s = a?.snapshot;
	const missing =
		!a ||
		a.accepted !== true ||
		!s ||
		!s.tos ||
		!s.privacyOfficer ||
		!s.jurisdictionFooter;
	if (missing) return true;
	if (LEGAL_REPROMPT_ON_CHANGE && bundle && legalSnapshotIsStale(user, bundle)) return true;
	return false;
}
