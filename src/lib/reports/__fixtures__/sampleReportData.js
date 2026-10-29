// Deterministic sample `data` objects for the AI-report renderers — the exact
// shapes buildReportData / buildLetterData / buildPatientSummaryData produce (see
// buildReportData.js SHARED CONTRACT). Used by the render tests so PDF + DOCX can
// be exercised WITHOUT generating an AI report (no agent, no Mongo, no credits).
//
// Values are synthetic (a fictional "Jordan Avery"); no real PHI.

/** Comprehensive/Concise render `data`. Pass a format to stamp meta.title. */
export function sampleReportData(format = 'comprehensive', language = 'en') {
	const isComp = format === 'comprehensive';
	return {
		meta: {
			title: isComp ? 'Comprehensive Clinical Assessment Report' : 'Concise Clinical Assessment Report',
			eyebrow: 'CLINICAL REPORT — CONFIDENTIAL',
			patient: 'Jordan Avery',
			patientId: 'PM-100428',
			dateOfAssessment: '14 Mar 2026',
			format: `${isComp ? 'Comprehensive' : 'Concise'} · V2.18 Core`,
			runType: isComp ? 'Comprehensive Clinical Assessment Report' : 'Concise Clinical Assessment Report',
			language,
			totalPages: isComp ? 12 : 8
		},
		identification: {
			age: '34',
			gender: 'Female',
			maritalStatus: 'Partnered',
			occupation: 'Registered nurse',
			priorPsychotherapy: 'One prior course of CBT (2021)',
			education: "Bachelor's degree",
			medications: 'None current',
			substanceUse: 'Social alcohol use; no other substances',
			primaryConcerns: 'Persistent low mood, worry, and sleep disturbance'
		},
		interviews: ['Adult Biographical', 'Depression', 'Generalized Anxiety', 'Stressful Beliefs Index'],
		snapshot: [
			{ label: 'Presentation', text: 'A 34-year-old partnered nurse presenting with several months of low mood and worry.' },
			{ label: 'Course', text: 'Gradual onset following a workplace stressor; symptoms present most days.' },
			{ label: 'Diagnostic count', text: '1 primary diagnosis with 1 comorbid consideration.' }
		],
		clinicalSummary: [
			'Jordan reports a several-month history of depressed mood, reduced interest, and difficulty concentrating that has affected occupational functioning.',
			'Anxiety features are prominent, with excessive worry across multiple domains and associated restlessness.'
		],
		history: [
			'Raised in a two-parent household with an unremarkable early developmental history.',
			'Reports a supportive partner and stable housing; primary stressors are occupational.'
		],
		risk: {
			lead: 'Risk of harm to self or others was assessed and is currently low.',
			bullets: [
				'No current suicidal ideation, intent, or plan.',
				'No history of self-harm or suicide attempts.',
				'Protective factors include a supportive partner and engagement in care.'
			],
			narrative:
				'Passive thoughts that life is not worth living were denied. The patient is future-oriented and consented to a safety plan.'
		},
		diagnostic: {
			primary: {
				name: 'Major Depressive Disorder, single episode, moderate',
				dsm: 'F32.1',
				icd: '6A70.1',
				severity: 'Moderate',
				rationale:
					'Meets full criteria over a ≥2-week period with functional impairment; supported by structured depression interview responses.',
				selection: ''
			},
			comorbid: [
				{
					name: 'Generalized Anxiety Disorder',
					dsm: 'F41.1',
					icd: '6B00',
					severity: 'Moderate',
					rationale: 'Excessive, difficult-to-control worry across domains for >6 months with somatic features.'
				}
			],
			subthreshold: 'Subthreshold insomnia features were noted but did not meet independent disorder criteria.',
			disclaimer:
				'Diagnostic impressions reflect currently available structured assessment data and may be refined as additional information becomes available.'
		},
		caseConceptualization: [
			'Symptoms are best understood as a stress-linked depressive episode with a strong anxious diathesis.',
			'Maladaptive beliefs about performance and control appear to maintain the worry cycle.'
		],
		treatment: [
			{ phase: 'Phase I', title: 'Stabilization & Engagement', emphasize: false, body: 'Establish a therapeutic alliance, psychoeducation, and sleep hygiene.' },
			{ phase: 'Phase II', title: 'Active Treatment', emphasize: true, body: 'CBT targeting depressive cognitions and worry, with behavioral activation.' },
			{ phase: 'Phase III', title: 'Consolidation', emphasize: false, body: 'Relapse-prevention planning and maintenance of gains.' }
		],
		medication: 'A trial of an SSRI may be considered in collaboration with the primary care provider if symptoms persist.',
		prognosis: {
			body: 'Prognosis is favorable with engagement in evidence-based treatment given good insight and social support.',
			closing: 'Reassessment is recommended in 8–12 weeks to evaluate treatment response.'
		}
	};
}

/** Referral-letter render `data` (business-letter shape). */
export function sampleLetterData(language = 'en') {
	return {
		meta: {
			patient: 'Jordan Avery',
			patientId: 'PM-100428',
			dateOfAssessment: '14 Mar 2026',
			letterDate: '15 Mar 2026',
			eyebrow: 'REFERRAL SOURCE LETTER — CONFIDENTIAL',
			language
		},
		recipient: { name: '', address: '', cityStateZip: '' },
		salutation: 'Dear Colleague,',
		opening: [
			'Thank you for the opportunity to provide a structured assessment summary for Jordan Avery, a 34-year-old registered nurse.'
		],
		snapshot: {
			bullets: [
				{ label: 'Presentation', text: 'Several months of low mood and pervasive worry.' },
				{ label: 'Functioning', text: 'Occupational functioning affected; interpersonal functioning preserved.' }
			]
		},
		riskNote: ['Risk of harm to self or others is currently low; no ideation, intent, or plan.'],
		psychosocial: ['Stable housing and a supportive partner; primary stressors are occupational.'],
		primary: {
			name: 'Major Depressive Disorder, single episode, moderate',
			dsm: 'F32.1',
			icd: '6A70.1',
			severity: 'Moderate',
			rationale: 'Full criteria met with functional impairment.'
		},
		comorbid: [
			{
				name: 'Generalized Anxiety Disorder',
				dsm: 'F41.1',
				icd: '6B00',
				severity: 'Moderate',
				rationale: 'Excessive worry across domains for >6 months.'
			}
		],
		subthreshold: ['Subthreshold insomnia features noted.'],
		conceptualization: ['A stress-linked depressive episode on an anxious diathesis.'],
		treatment: ['CBT with behavioral activation; consider SSRI in collaboration with primary care.'],
		closing: {
			signoff: 'Sincerely,',
			clinician: '[Clinician Name, Credentials]',
			system: 'PsyMatch Clinical Interview System'
		},
		footerNote:
			'Diagnostic impressions reflect currently available structured assessment data and may be refined as additional information becomes available.'
	};
}

/** Patient-summary render `data` (warm 6-section shape; §6 italic). */
export function samplePatientSummaryData(language = 'en') {
	// Mirrors the agent's real §1..§6 titles. §1 is "Opening" and renders BARE —
	// no gold rule, no heading — flowing straight from the subtitle.
	const titles = [
		'Opening',
		'What We Found',
		'Why You Feel the Way You Do',
		'What Can Help',
		'Next Steps',
		'A Note to You'
	];
	return {
		meta: {
			patient: 'Jordan Avery',
			patientId: 'PM-100428',
			dateOfAssessment: '14 Mar 2026',
			language,
			eyebrow: 'PsyMatch Clinical Interview Summary',
			title: 'Clinical Interview Summary'
		},
		sections: titles.map((title, i) => ({
			id: i + 1,
			title,
			paragraphs: [
				`${title}: this is a plain-language paragraph describing your experience in everyday terms, without clinical codes or severity labels.`,
				'It is written for you to read and keep, and to share with anyone you choose.'
			],
			italic: i + 1 === 6
		}))
	};
}

/** All four fixtures keyed by format, for table-driven tests. */
export const SAMPLES = {
	comprehensive: () => sampleReportData('comprehensive'),
	concise: () => sampleReportData('concise'),
	referral: () => sampleLetterData(),
	patient_summary: () => samplePatientSummaryData()
};
