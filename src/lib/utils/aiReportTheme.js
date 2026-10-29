// Shared design tokens for the in-app AI-report renderers (PDFKit + docx).
//
// Pure data — NO framework imports ($env / $app / $lib) — so the PDF/DOCX
// generators that consume it stay node-testable and route-importable.
//
// One THEME per report `format`. Each theme carries:
//   page      — PDFKit page size + pixel dims (Letter @ 72dpi).
//   margins   — top/bottom/left/right in points.
//   palette   — hex colors (with '#'); docx callers strip the '#').
//   eyebrow   — small uppercase kicker above the title.
//   title     — the document H1.
//   tagline   — (referral only) letterhead sub-line.
//   footerSystem / footerCenter — the two-pass page-number footer strings.

const LETTER = { width: 612, height: 792 }; // 8.5in x 11in @ 72dpi

// Canonical PDF typography, in points. Word converts points to half-points for
// runs and to twips for geometry; it must not maintain its own design scale.
export const REPORT_STYLE = {
	fonts: { sans: 'Inter Display', serif: 'Times New Roman' },
	size: {
		body: 10,
		small: 9.5,
		tiny: 8,
		h2: 14,
		h1: 22,
		title: 13,
		eyebrow: 8.5,
		miniHeading: 11,
		cardTitle: 10.5,
		code: 9,
		cardBody: 8.5,
		phase: 11.5,
		summaryBody: 11.5,
		summaryHeading: 12,
		footer: 7.5
	},
	footer: { top: 46, textOffset: 10 },
	lineGap: 2.5
};

export function identificationRows(data) {
	const id = data.identification || {};
	const meta = data.meta || {};
	return [
		['Patient Name', meta.patient],
		['Patient ID', meta.patientId],
		['Date of Assessment', meta.dateOfAssessment],
		['Age', id.age],
		['Gender', id.gender],
		['Marital Status', id.maritalStatus],
		['Education / Career Training', id.education],
		['Occupation', id.occupation],
		['Current Medications', id.medications],
		['Prior Psychotherapy', id.priorPsychotherapy],
		['Substance Use', id.substanceUse],
		['Principal Concerns', id.primaryConcerns]
	].filter(([, value]) => String(value ?? '').trim());
}

export function reportSubtitle(meta = {}) {
	const format = /concise/i.test(String(meta.format || '') + String(meta.runType || ''))
		? 'Concise'
		: 'Comprehensive';
	return `Prepared using the PsyMatch structured clinical assessment system. ${format} Clinical Report format under the V2.18 Core Clinical Standard.`;
}

/** @typedef {{accent?:string,deep?:string,heading?:string,body?:string,ink:string,muted:string,rule:string,tint?:string}} Palette */

export const THEMES = {
	comprehensive: {
		page: { size: 'LETTER', width: LETTER.width, height: LETTER.height },
		margins: { top: 64, bottom: 72, left: 64, right: 64 },
		palette: {
			accent: '#8FB9B3',
			deep: '#2F5551',
			heading: '#2F5551',
			ink: '#1F1F1F',
			muted: '#7A7F80',
			rule: '#D7DDDC',
			tint: '#F4F5F6'
		},
		eyebrow: 'CLINICAL REPORT — CONFIDENTIAL',
		title: 'PsyMatch Comprehensive Clinical Assessment Report',
		footerSystem: 'PsyMatch Clinical Assessment System',
		footerCenter: 'Confidential Clinical Report'
	},

	concise: {
		page: { size: 'LETTER', width: LETTER.width, height: LETTER.height },
		margins: { top: 64, bottom: 72, left: 64, right: 64 },
		palette: {
			accent: '#8FB9B3',
			deep: '#2F5551',
			heading: '#2F5551',
			ink: '#1F1F1F',
			muted: '#7A7F80',
			rule: '#D7DDDC',
			tint: '#F4F5F6'
		},
		eyebrow: 'CLINICAL REPORT — CONFIDENTIAL',
		title: 'PsyMatch Concise Clinical Assessment Report',
		footerSystem: 'PsyMatch Clinical Assessment System',
		footerCenter: 'Confidential Clinical Report'
	},

	referral: {
		page: { size: 'LETTER', width: LETTER.width, height: LETTER.height },
		margins: { top: 50, bottom: 65, left: 58, right: 58 },
		palette: {
			accent: '#117DBE',
			deep: '#0A5A8C',
			heading: '#0A5A8C',
			ink: '#1F2937',
			muted: '#6B7280',
			rule: '#D1D5DB',
			tint: '#F4F5F6'
		},
		eyebrow: 'REFERRAL SOURCE LETTER — CONFIDENTIAL',
		title: 'Referral Summary Letter',
		tagline: 'DSM-5 Structured Assessment · Clinician-Ready Reports · psymatchhealth.ai',
		footerSystem: 'PsyMatch Clinical Interview System',
		footerCenter: 'Confidential Referral Summary'
	},

	patient_summary: {
		page: { size: 'LETTER', width: LETTER.width, height: LETTER.height },
		margins: { top: 64, bottom: 72, left: 72, right: 72 },
		palette: {
			accent: '#D4A84B', // gold
			deep: '#5A8FB5',
			heading: '#5A8FB5',
			body: '#1F3A5F',
			ink: '#1F3A5F',
			muted: '#6B7A8A',
			rule: '#D4A84B',
			tint: '#FBF7EE'
		},
		eyebrow: 'PsyMatch Clinical Interview Summary',
		title: 'Clinical Interview Summary',
		subtitle: 'Prepared for you to read and keep',
		footerSystem: 'PsyMatch Clinical Interview System',
		footerCenter: 'Patient Summary'
	}
};

/** Resolve a theme by format, defaulting to comprehensive. */
export function themeFor(format) {
	return THEMES[format] || THEMES.comprehensive;
}
