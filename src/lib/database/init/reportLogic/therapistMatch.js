import { processTherapistMatchData } from '../../../utils/reportGenerators/therapistMatchProcessor.js';

/**
 * Report logic for Therapist Matching questionnaire
 */
export const therapistMatchReportLogic = {
	report_title: 'Therapist Matching Report',
	variables: [],
	criteria: [],
	outcomes: [
		{
			type: 'therapist_match',
			operation: {
				type: 'numerical',
				value: 1
			},
			report_sections: [] // Will be populated by the processor
		}
	],
	// Custom processor for this test type
	processor: processTherapistMatchData
};
