/**
 * Therapist Match Report Processor
 * Processes therapist matching questionnaire responses and generates a structured report
 */

/**
 * Normalizes response data to a consistent format
 */
function normalizeResponses(responseData) {
	console.log('Normalizing response data:', responseData);

	// Handle array format (from test)
	if (Array.isArray(responseData.responses)) {
		return responseData.responses;
	}

	// Handle object format (from real system)
	const responses = [];
	Object.entries(responseData).forEach(([questionId, value]) => {
		console.log(`Processing ${questionId}:`, value);

		// Skip non-question keys
		if (!questionId.startsWith('q')) return;

		if (questionId === 'q9') {
			responses.push({
				questionId,
				value: value
			});
		} else if (value && typeof value === 'object') {
			responses.push({
				questionId,
				value: {
					preference: value.preference,
					importance: value.importance
				}
			});
		} else if (value) {
			// Handle flat value format
			responses.push({
				questionId,
				value: value
			});
		}
	});

	console.log('Normalized responses:', responses);
	return responses;
}

/**
 * Generates a table of therapist preferences and their importance
 */
function generateTherapistProfile(responseData) {
	const responses = normalizeResponses(responseData);
	const tableRows = [];

	// Process all responses except timing question
	responses.forEach((response) => {
		if (response.questionId === 'q9') return;
		let preference;
		let importance;
		const value = response.value;
		if (!value) return;
		if (response.questionId === 'q8') {
			preference = typeof value === 'object' ? 'Gender Preference: ' + value.preference : value;
			importance = typeof value === 'object' ? value.importance : 'not important';
		} else {
			// Handle both object and string formats
			preference = typeof value === 'object' ? value.preference : value;
			importance = typeof value === 'object' ? value.importance : 'not important';
		}

		if (!preference) return;

		tableRows.push({
			characteristic: preference,
			importance: importance
		});
	});

	// Add timing preference at the end
	const timingResponse = responses.find((r) => r.questionId === 'q9');
	if (timingResponse && timingResponse.value) {
		tableRows.push({
			characteristic: 'Timing Preference',
			importance: timingResponse.value
		});
	}

	if (tableRows.length === 0) {
		return {
			sections: [
				{
					text: 'The client has not indicated any preferences for therapist characteristics.',
					addPeriod: true
				}
			]
		};
	}

	return {
		sections: [
			{
				type: 'table',
				headers: ['Selected Therapist Characteristic', 'Importance of this characteristic'],
				rows: tableRows,
				style: {
					headerBackground: '#D3D3D3', // Light gray for header
					alternateRowColor: '#F5F5F5' // Very light gray for alternating rows
				}
			}
		]
	};
}

/**
 * Builds the final report structure compatible with the PDF generator
 */
function buildReportStructure(profile) {
	const sections = [];

	// Add centered title
	sections.push({
		text: 'THERAPIST PREFERENCES',
		bold: true,
		fontSize: 14,
		align: 'center'
	});

	// Add spacing after title
	sections.push({
		text: ''
	});

	// Add profile sections (table)
	sections.push(...profile.sections);

	return sections;
}

/**
 * Main entry point for processing therapist matching data
 */
export function processTherapistMatchData(context) {
	try {
		const { _responses: responseData } = context;
		console.log('Processing therapist match data:', responseData);

		// Step 1: Generate therapist profile with table format (now includes timing)
		const profile = generateTherapistProfile(responseData);
		console.log('Generated profile:', profile);

		// Step 2: Build report sections with tables
		const report_sections = buildReportStructure(profile);
		console.log('Generated report sections:', report_sections);

		// Return outcome with report sections
		return {
			outcomes: {
				therapist_match: {
					value: 1,
					report_sections: report_sections
				}
			}
		};
	} catch (error) {
		console.error('Error processing therapist match data:', error);
		// Return a minimal valid structure in case of error
		return {
			outcomes: {
				therapist_match: {
					value: 1,
					report_sections: [
						{
							text: 'Unable to process therapist matching data. Please try again.',
							addPeriod: true
						}
					]
				}
			}
		};
	}
}
