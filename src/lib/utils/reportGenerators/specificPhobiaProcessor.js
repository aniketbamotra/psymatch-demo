/**
 * Specific Phobia Test Report Processor
 * Processes specific phobia test responses and generates a structured report
 * Specially handles questions 2 and 3 which contain text entries
 */

/**
 * Transform the response data into object format if needed
 */
function normalizeResponses(responseData) {
	// If already in correct format, return as is
	if (!Array.isArray(responseData)) {
		return responseData;
	}

	// Convert from array to object format
	const normalized = {};
	responseData.forEach((response) => {
		normalized[response.questionId] = response.value;
	});

	return normalized;
}

/**
 * Process the text inputs from questions 2 and 3 and format them
 */
function processTextEntries(responses) {
	const textResponses = [];

	// Process question 2 text entry (specific phobia description)
	if (responses.q2 && typeof responses.q2 === 'string' && responses.q2.trim()) {
		textResponses.push({
			text: `Object or situation that client fear the most: "${responses.q2.trim()}"`,
			addPeriod: true,
			id: 'phobia_description_detail',
			position: 5 // Position after the standard bullet points
		});
	}

	// Process question 3 text entry (impact on daily life)
	if (responses.q3 && typeof responses.q3 === 'string' && responses.q3.trim()) {
		textResponses.push({
			text: `Other Phobia: "${responses.q3.trim()}"`,
			addPeriod: true,
			id: 'phobia_impact_detail',
			position: 6 // Position right after the description
		});
	}

	return textResponses;
}

/**
 * Main entry point for processing specific phobia data
 */
export function processSpecificPhobiaData(context) {
	try {
		console.log('SpecificPhobiaProcessor received context:', context);

		// Get responses from context (handle both array and object formats)
		const responseData = context._responses || context.responses || [];
		console.log('Raw response data:', responseData);

		const responses = normalizeResponses(responseData);
		console.log('Normalized responses:', responses);

		// Get patient info
		const patientInfo = context.patientInfo || {};

		// Process text entries from questions 2 and 3
		const textEntrySections = processTextEntries(responses);

		// Get existing evaluation results from report logic
		// but extend it with our custom sections for text entries

		// Find the appropriate outcome in the report logic evaluation
		// This will be either "specific_phobia_positive" or one of the negative outcomes
		let outcome = 'specific_phobia_positive';
		if (!responses.q1 || parseInt(responses.q1) === 0) {
			outcome = 'Specific Phobia Negative A';
		} else if (
			!responses.q4 ||
			!responses.q5 ||
			!responses.q6 ||
			!responses.q7 ||
			!responses.q8 ||
			parseInt(responses.q4) === 0 ||
			parseInt(responses.q5) === 0 ||
			parseInt(responses.q6) === 0 ||
			parseInt(responses.q7) === 0 ||
			parseInt(responses.q8) === 0
		) {
			outcome = 'Specific Phobia Negative B';
		}

		// Simplify the result structure to ensure our text entries are included
		// This simpler approach should ensure the text entries always appear in the correct outcome
		const result = {
			patientInfo: patientInfo,
			outcomes: {
				[outcome]: {
					value: 1,
					report_sections: textEntrySections
				}
			}
		};

		console.log('Generated specific phobia report sections:', result);
		console.log(result.outcomes.specific_phobia_positive.report_sections);
		return result;
	} catch (error) {
		console.error('Error processing specific phobia data:', error);
		// Return a minimal valid structure in case of error
		return {
			outcomes: {
				specific_phobia_error: {
					value: 1,
					report_sections: [
						{
							text: 'Unable to process specific phobia data. Please try again.',
							addPeriod: true
						}
					]
				}
			}
		};
	}
}
