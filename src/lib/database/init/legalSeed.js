import { Legal, PrivacyOfficer, ActiveJurisdiction } from '../schemas.js';

const TOS_PLACEHOLDER = {
	en: `# Terms of Service

Welcome to PsyMatch. By using this platform you agree to the following terms.

Replace this placeholder via /admin/legals once a director has reviewed the production wording.

## 1. Scope
PsyMatch provides clinical-intake interviews on behalf of your treating clinic.

## 2. Data Handling
All responses are encrypted at rest and accessible only to authorised clinic staff.

## 3. Withdrawal of Consent
You may revoke consent at any time by contacting the privacy officer listed below.`,
	fr: `# Conditions d'utilisation

Bienvenue sur PsyMatch. En utilisant cette plateforme, vous acceptez les conditions suivantes.

Remplacez ce texte placeholder via /admin/legals une fois la formulation finale validée.

## 1. Portée
PsyMatch fournit des entretiens cliniques d'admission pour le compte de votre clinique traitante.

## 2. Traitement des données
Toutes les réponses sont chiffrées au repos et accessibles uniquement au personnel autorisé.

## 3. Retrait du consentement
Vous pouvez révoquer votre consentement à tout moment en contactant l'agent de confidentialité.`
};

// Privacy Officer ships with realistic placeholder fields. English-only by design.
// Directors replace these via /admin/legals after deployment.
const PRIVACY_OFFICER_PLACEHOLDER = {
	name: 'Dr. Sarah Chen',
	email: 'privacy@example.com',
	phone: '+1 (416) 555-0182',
	mailingAddress: '200 University Ave, Suite 1400\nToronto, ON M5H 3C6\nCanada'
};

const JURISDICTIONS = [
	{
		key: 'ontario',
		label: { en: 'Ontario', fr: 'Ontario' },
		content: {
			en: `**Ontario (PHIPA).** Your personal health information is handled in accordance with the Personal Health Information Protection Act, 2004 (Ontario). You may file a complaint with the Information and Privacy Commissioner of Ontario at ipc.on.ca.`,
			fr: `**Ontario (LPRPS).** Vos renseignements personnels sur la santé sont traités conformément à la Loi de 2004 sur la protection des renseignements personnels sur la santé (Ontario). Vous pouvez déposer une plainte auprès du Commissaire à l'information et à la protection de la vie privée de l'Ontario à ipc.on.ca.`
		}
	},
	{
		key: 'canada',
		label: { en: 'Canada', fr: 'Canada' },
		content: {
			en: `**Canada (PIPEDA).** Information collected outside a designated provincial regime is handled under the Personal Information Protection and Electronic Documents Act. Complaints may be filed with the Office of the Privacy Commissioner of Canada at priv.gc.ca.`,
			fr: `**Canada (LPRPDE).** Les renseignements recueillis en dehors d'un régime provincial désigné sont traités en vertu de la Loi sur la protection des renseignements personnels et les documents électroniques. Les plaintes peuvent être déposées auprès du Commissariat à la protection de la vie privée du Canada à priv.gc.ca.`
		}
	},
	{
		key: 'us',
		label: { en: 'United States', fr: 'États-Unis' },
		content: {
			en: `**United States (HIPAA).** Protected health information is handled under the Health Insurance Portability and Accountability Act. Complaints may be filed with the U.S. Department of Health and Human Services Office for Civil Rights at hhs.gov/ocr.`,
			fr: `**États-Unis (HIPAA).** Les renseignements de santé protégés sont traités en vertu du Health Insurance Portability and Accountability Act. Les plaintes peuvent être déposées auprès de l'Office for Civil Rights du U.S. Department of Health and Human Services à hhs.gov/ocr.`
		}
	},
	{
		key: 'other',
		label: { en: 'Other / fallback', fr: 'Autre / par défaut' },
		content: {
			en: `**Other jurisdiction.** Your data is handled in accordance with the applicable local privacy law and any agreement between you and the operating clinic. Contact the privacy officer above for jurisdiction-specific details.`,
			fr: `**Autre juridiction.** Vos données sont traitées conformément à la loi locale applicable en matière de protection de la vie privée et à toute entente entre vous et la clinique opératrice. Contactez l'agent de confidentialité ci-dessus pour des détails spécifiques à la juridiction.`
		}
	}
];

async function upsertLegal(filter, set) {
	const res = await Legal.updateOne(
		filter,
		{
			$set: { ...set, updatedAt: new Date() },
			$setOnInsert: { version: 1, createdAt: new Date() }
		},
		{ upsert: true }
	);
	const action = res.upsertedCount ? 'inserted' : 'matched';
	console.log(`  legal/${action}: ${JSON.stringify(filter)}`);
}

async function upsertSingleton(Model, set, label, unset = {}) {
	const update = {
		$set: { ...set, updatedAt: new Date() },
		$setOnInsert: { key: 'singleton', version: 1, createdAt: new Date() }
	};
	if (Object.keys(unset).length) update.$unset = unset;
	// strict:false lets us $unset fields that have been removed from the schema.
	const res = await Model.updateOne({ key: 'singleton' }, update, { upsert: true, strict: false });
	const action = res.upsertedCount ? 'inserted' : 'matched';
	console.log(`  ${label}/${action}`);
}

/**
 * Upsert the TOS, jurisdiction footers, privacy officer and active jurisdiction.
 * Idempotent; assumes the database connection is already open.
 */
export async function seedLegalDocs() {
	// Migration cleanup: an earlier shape kept privacy_officer + active_jurisdiction
	// inside the `legal` collection. They now live in their own collections, so
	// remove the orphan rows so the dataset stays tidy.
	const removed = await Legal.deleteMany({
		type: { $in: ['privacy_officer', 'active_jurisdiction'] }
	});
	if (removed.deletedCount) {
		console.log(`  legal/cleanup: removed ${removed.deletedCount} orphan row(s)`);
	}

	// 1) legal collection: TOS + jurisdictions
	await upsertLegal({ type: 'tos' }, { type: 'tos', content: TOS_PLACEHOLDER });
	for (const j of JURISDICTIONS) {
		await upsertLegal(
			{ type: 'jurisdiction', jurisdictionKey: j.key },
			{
				type: 'jurisdiction',
				jurisdictionKey: j.key,
				jurisdictionLabel: j.label,
				content: j.content
			}
		);
	}

	// 2) privacy_officer collection: structured contact card.
	// `description` was an earlier field replaced by `mailingAddress`; drop it on existing docs.
	await upsertSingleton(PrivacyOfficer, PRIVACY_OFFICER_PLACEHOLDER, 'privacy_officer', {
		description: ''
	});

	// 3) active_jurisdiction collection: pointer
	await upsertSingleton(ActiveJurisdiction, { value: 'ontario' }, 'active_jurisdiction');
}
