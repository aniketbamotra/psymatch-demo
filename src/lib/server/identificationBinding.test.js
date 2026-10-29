// Pins the §1 demographics cells that must NOT be left to the model.
//
// Found in clinical review 2026-07-28: "Prior Psychotherapy" printed
// "…social worker re: parenting guilt", which is the adult-bio free-text
// "additional details" answer (q30) — not a treatment history. The agent had no
// field→source binding, and the case-context brief surfaces that free text at a
// shallower path than the real prior-therapy answer (q21), so the model
// harvested it. Both cells are now derived from the stored payload, with the
// agent's own value kept only as a fallback for older payloads.

import { describe, it, expect } from 'vitest';
import { buildReportData } from './buildReportData.js';

// The polluted §1 the agent used to produce.
const AGENT_S1 = [
	{ key: 'Name', value: 'Daad Khouri' },
	{ key: 'Age', value: '59' },
	{ key: 'Gender', value: 'Female (she/her)' },
	{ key: 'Prior Psychotherapy', value: 'social worker re: parenting guilt' },
	{ key: 'Primary Concerns', value: 'parenting guilt; binge eating; emotional functioning' }
];

function build({ bio, language = 'en', s1 = AGENT_S1 } = {}) {
	return buildReportData({
		sections: { 1: { identification: s1 } },
		format: 'concise',
		language,
		patientId: '11397',
		agentInput: {
			patient: { name: 'Daad Khouri', first_name: 'Daad' },
			interviews: bio ? { adult_biographical: { structured_result: bio } } : {}
		}
	});
}

describe('§1 Prior Psychotherapy binding', () => {
	it('reads the real prior-therapy answer, not the narrative free text', () => {
		const d = build({
			bio: {
				psychological_history: {
					prior_therapy_reported: true,
					prior_therapy_details: {
						reason: 'OCD',
						length: 'approx. one year',
						location: 'The Royal Ottawa'
					}
				}
			}
		});
		expect(d.identification.priorPsychotherapy).toBe(
			'Yes — OCD; approx. one year; The Royal Ottawa'
		);
		expect(d.identification.priorPsychotherapy).not.toContain('parenting guilt');
	});

	it('says "None reported" when the patient answered no', () => {
		const d = build({
			bio: { psychological_history: { prior_therapy_reported: false, prior_therapy_details: null } }
		});
		expect(d.identification.priorPsychotherapy).toBe('None reported');
	});

	it('says "Yes" with no detail list when the details are absent', () => {
		const d = build({
			bio: { psychological_history: { prior_therapy_reported: true, prior_therapy_details: null } }
		});
		expect(d.identification.priorPsychotherapy).toBe('Yes');
	});

	it('localizes the negative answer for French reports', () => {
		const d = build({
			bio: { psychological_history: { prior_therapy_reported: false } },
			language: 'fr'
		});
		expect(d.identification.priorPsychotherapy).toBe('Aucune signalée');
	});

	it('falls back to the agent value when the payload has no bio interview', () => {
		// Reports generated before the bio interview was part of the payload must
		// still render something rather than an empty cell.
		expect(build().identification.priorPsychotherapy).toBe('social worker re: parenting guilt');
	});
});

describe('§1 Primary Concerns binding', () => {
	it('reads the presenting-concerns list, not the narrative free text', () => {
		const d = build({
			bio: {
				presenting_concerns: ['Obsessive-compulsive symptoms', 'Binge eating', 'Anxiety'],
				narrative_concerns: 'parenting guilt about how I disciplined my daughter'
			}
		});
		expect(d.identification.primaryConcerns).toBe(
			'Obsessive-compulsive symptoms; Binge eating; Anxiety'
		);
		expect(d.identification.primaryConcerns).not.toContain('disciplined');
	});

	it('drops empty entries and falls back when the list is empty', () => {
		const d = build({ bio: { presenting_concerns: ['', '   '] } });
		expect(d.identification.primaryConcerns).toBe(
			'parenting guilt; binge eating; emotional functioning'
		);
	});

	it('resolves raw i18n keys left in payloads stored before the resolver landed', () => {
		// What the cell actually printed on 2026-07-30 — the checkbox group stores
		// option KEYS, so a re-download of an older report must resolve them here.
		const K = 'Questionnaire.Config.AdultBio.reasons_for_cct.options';
		const d = build({
			bio: { presenting_concerns: [`${K}.0`, `${K}.6`, `${K}.15`, `${K}.4`, `${K}.7`] }
		});
		expect(d.identification.primaryConcerns).toBe(
			'Anxiety; Eating/Food Intake; Relationship Related; Obsessive Compulsive; Weight Management'
		);
		expect(d.identification.primaryConcerns).not.toContain('Questionnaire.');
	});
});

describe('patient name precedence', () => {
	it('takes the full legal name from the payload, not from §1', () => {
		// §1's Name entry is the one field the agent could shorten by mistake now
		// that prose uses the first name; the cover page must stay on the full name.
		const d = build({ s1: [{ key: 'Name', value: 'Daad' }] });
		expect(d.meta.patient).toBe('Daad Khouri');
	});

	it('still falls back to §1 when the payload carries no name', () => {
		const d = buildReportData({
			sections: { 1: { identification: [{ key: 'Name', value: 'Daad Khouri' }] } },
			format: 'concise',
			language: 'en',
			agentInput: { patient: {} }
		});
		expect(d.meta.patient).toBe('Daad Khouri');
	});
});
