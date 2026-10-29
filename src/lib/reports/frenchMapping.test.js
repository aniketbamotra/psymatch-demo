// French variants must map as completely as English ones.
//
// buildReportData/buildLetterData locate content by matching the agent's section
// KEYS and TITLES against regexes. The agent's FR translate pass renders those
// keys in French ("Âge", "Médicaments actuels", "État civil"), so English-only
// patterns silently returned '' and the FR report lost most of its §1 table —
// it showed only Patient Name / ID / Date. These tests pin the FR mapping.

import { describe, it, expect } from 'vitest';
import { buildReportData, buildLetterData } from '../server/buildReportData.js';

// §1 identification as the agent emits it for a FR variant.
const FR_ID_PAIRS = [
	{ key: 'Nom du patient', value: 'Talia Test' },
	{ key: 'Âge', value: '25' },
	{ key: 'Genre', value: 'Femme (elle)' },
	{ key: 'État civil', value: 'Mariée' },
	{ key: 'Éducation / Formation professionnelle', value: 'Maîtrise' },
	{ key: 'Profession', value: 'Administration — temps plein' },
	{ key: 'Médicaments actuels', value: 'Wellbutrin 4 mg deux fois par jour' },
	{ key: 'Psychothérapie antérieure', value: 'Oui — une séance' },
	{ key: "Consommation de substances", value: 'Cannabis (rapporté); alcool nié' },
	{ key: 'Préoccupations principales', value: 'Anxiété, stress, sommeil' }
];

const EN_ID_PAIRS = [
	{ key: 'Patient Name', value: 'Talia Test' },
	{ key: 'Age', value: '25' },
	{ key: 'Gender', value: 'Female (she/her)' },
	{ key: 'Marital Status', value: 'Married' },
	{ key: 'Education / Career Training', value: "Master's Degree" },
	{ key: 'Occupation', value: 'admin — Full Time' },
	{ key: 'Current Medications', value: 'Wellbutrin 4mg twice daily' },
	{ key: 'Prior Psychotherapy', value: 'Yes — 1-hour session' },
	{ key: 'Substance Use', value: 'Marijuana (reported); alcohol denied' },
	{ key: 'Primary Concerns', value: 'Anxiety, stress, sleep' }
];

const build = (pairs, language) =>
	buildReportData({
		sections: { 1: { identification: pairs } },
		format: 'comprehensive',
		language,
		patientId: '12366'
	});

// Every field the §1 table renders.
const FIELDS = [
	'age',
	'gender',
	'maritalStatus',
	'education',
	'occupation',
	'medications',
	'priorPsychotherapy',
	'substanceUse',
	'primaryConcerns'
];

describe('French report mapping', () => {
	it('resolves every §1 identification field from FRENCH keys', () => {
		const { identification } = build(FR_ID_PAIRS, 'fr');
		const empty = FIELDS.filter((f) => !identification[f]);
		expect(empty, `FR fields that failed to map: ${empty.join(', ')}`).toEqual([]);
	});

	it('maps the FR patient name', () => {
		expect(build(FR_ID_PAIRS, 'fr').meta.patient).toBe('Talia Test');
	});

	it('fills exactly the same fields for FR as for EN', () => {
		const en = build(EN_ID_PAIRS, 'en').identification;
		const fr = build(FR_ID_PAIRS, 'fr').identification;
		const filled = (o) => FIELDS.filter((f) => !!o[f]).sort();
		expect(filled(fr)).toEqual(filled(en));
	});

	it('routes FRENCH letter section titles to the right letter slots', () => {
		const letterSections = {
			1: { id: 1, title: "Objet et contexte de l'évaluation", paragraphs: ['Ouverture FR.'] },
			2: { id: 2, title: 'Évaluation du risque', paragraphs: ['Risque FR.'] },
			3: { id: 3, title: 'Résumé biographique et psychosocial', paragraphs: ['Psychosocial FR.'] },
			4: { id: 4, title: 'Formulation clinique', paragraphs: ['Conceptualisation FR.'] },
			5: { id: 5, title: 'Plan de traitement recommandé', paragraphs: ['Traitement FR.'] },
			6: { id: 6, title: 'Conclusion', paragraphs: ['Clôture FR.'] }
		};
		const d = buildLetterData({
			letterSections,
			comprehensiveSections: {},
			language: 'fr',
			patient: 'Talia Test',
			patientId: '12366'
		});
		expect(d.opening).toEqual(['Ouverture FR.']);
		expect(d.riskNote).toEqual(['Risque FR.']);
		expect(d.psychosocial).toEqual(['Psychosocial FR.']);
		expect(d.conceptualization).toEqual(['Conceptualisation FR.']);
		expect(d.treatment).toEqual(['Traitement FR.']);
		expect(d.closing.body).toEqual(['Clôture FR.']);
	});
});
