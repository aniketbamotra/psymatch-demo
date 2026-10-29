import {
	evaluateTestExpressions,
	formatTestResult
} from '../reportLogicTransformer/utils/helpers.js';
import { generateJsonBasedPdf } from '../pdfGenerators/jsonBasedPdfGenerator.js';
import { generateJsonBasedDocx } from '../docxGenerators/jsonBasedDocxGenerator.js';
import { Questionnaire, Assignment } from '$lib/database/schemas.js';
import { getTestResponsesWithMetadata } from '$lib/database/testResponses.js';
import { processTherapistMatchData } from './therapistMatchProcessor.js';
import { processStressfulBeliefsData } from './stressfulBeliefsIndexProcessor.js';
import { processAdultBioData } from './adultBioProcessor.js';
import { processSpecificPhobiaData } from './specificPhobiaProcessor.js';

// Special test processors
const SPECIAL_TEST_PROCESSORS = {
	THERAPIST_MATCH: processTherapistMatchData,
	stressful_beliefs_index: processStressfulBeliefsData,
	ADULT_BIO: processAdultBioData,
	specific_phobia_test: processSpecificPhobiaData
};

/**
 * Generate report from test responses
 */
export async function generateReport(context) {
	try {
		const { userId, patientInfo, reportsData, summary, type = 'pdf' } = context;

		console.log('Starting report generation for multiple tests:', {
			testsCount: reportsData.length,
			summary,
			type
		});

		// Get all completed assignments for this patient
		const allAssignments = await Assignment.find({
			patientId: userId,
			status: { $in: ['completed', 'downloaded'] }
		}).lean();

		// Get questionnaire titles for all completed assignments
		const questionnaireTitles = [];
		for (const assignment of allAssignments) {
			const questionnaire = await Questionnaire.findById(assignment.questionnaireId).lean();
			if (questionnaire) {
				questionnaireTitles.push(questionnaire.title);
			}
		}

		// Add questionnaire titles to patientInfo
		const updatedPatientInfo = {
			...patientInfo,
			completedTests: questionnaireTitles
		};

		// Process each report and build formatted reports array
		const formattedReports = [];
		const allEvaluatedResults = [];

		for (const reportData of reportsData) {
			const { assignment, reportLogic, responses } = reportData;

			// Check if this is a special test type that needs custom processing
			// Get test code from assignment (set in print endpoint) or questionnaire
			const testCode =
				assignment.testCode ||
				(await Questionnaire.findById(assignment.questionnaireId).lean())?.test_code;
			console.log(`Processing test with code: ${testCode || assignment.testName}`);
			const specialProcessor = SPECIAL_TEST_PROCESSORS[testCode || assignment.testName];

			let evaluatedResults;
			if (specialProcessor) {
				console.log(`Using special processor for test: ${testCode}`);
				try {
					// Create evaluation context with normalized data and patient info
					const evaluationContext = {
						_responses: responses, // This is already normalized in the print endpoint
						_otherTestResponses: {},
						patientInfo: context.patientInfo // Add patientInfo to context
					};
					console.log('Special processor context:', {
						testName: assignment.testName,
						testCode,
						responses: responses
					});
					evaluatedResults = specialProcessor(evaluationContext);
				} catch (error) {
					console.error(`Error in special processor for ${testCode}:`, error);
					evaluatedResults = null;
				} finally {
					if (assignment.testName === 'specific_phobia_test') {
						const findTestCodes = () => {
							const codes = new Set();
							const traverse = (node) => {
								if (!node || typeof node !== 'object') return;
								if (node.test_code) codes.add(node.test_code);
								Object.values(node).forEach(traverse);
							};
							traverse(reportLogic);
							return Array.from(codes);
						};

						// Get responses for each test_code
						const testCodes = findTestCodes();
						console.log(`Found test_codes in report logic: ${testCodes.join(', ')}`);
						const otherTestResponses = {};

						for (const testCode of testCodes) {
							try {
								// Find questionnaire by test_code
								const questionnaire = await Questionnaire.findOne({ test_code: testCode });
								if (!questionnaire) {
									console.error(`No questionnaire found for test_code: ${testCode}`);
									continue;
								}

								// Find assignment for this questionnaire and patient
								const assignment = await Assignment.findOne({
									patientId: userId,
									questionnaireId: questionnaire._id,
									status: { $in: ['completed', 'downloaded'] }
								});

								if (!assignment) {
									console.error(`No completed assignment found for test_code: ${testCode}`);
									continue;
								}

								// Get responses for this assignment
								const testResult = await getTestResponsesWithMetadata(assignment._id);
								if (testResult && testResult.responses) {
									// Normalize response values
									const normalizedResponses = {};
									for (const [key, value] of Object.entries(testResult.responses)) {
										normalizedResponses[key] = typeof value === 'object' ? value.value : value;
									}
									otherTestResponses[testCode] = normalizedResponses;
								}
							} catch (error) {
								console.error(`Error getting responses for test_code ${testCode}:`, error);
							}
						}

						// Create evaluation context
						const customContext = {
							_responses: responses,
							_otherTestResponses: otherTestResponses
						};

						// Evaluate test logic directly
						console.log(`Evaluating test logic for ${assignment.testName}`);
						let evaluatedResults1 = evaluateTestExpressions(reportLogic, customContext);
						console.log('Evaluated results before merge:', evaluatedResults, evaluatedResults1);

						// Merge the results from both sources
						if (evaluatedResults && evaluatedResults1) {
							// Create a merged result object
							const mergedResults = {
								variables: evaluatedResults1.variables || {},
								criteria: evaluatedResults1.criteria || {},
								...evaluatedResults
							};

							// Special handling for outcomes to preserve report sections from both sources
							if (evaluatedResults.outcomes && evaluatedResults1.outcomes) {
								// Start with evaluatedResults1.outcomes
								const mergedOutcomes = { ...evaluatedResults1.outcomes };
								console.log('Merged outcomes1:', mergedOutcomes);
								console.log('Merged outcomes2:', evaluatedResults.outcomes);
								console.log(
									'outcome keys:',
									mergedOutcomes.specific_phobia_positive?.report_sections
								);
								// Merge outcomes from evaluatedResults (comes last for precedence)
								Object.entries(evaluatedResults.outcomes).forEach(([key, outcome]) => {
									console.log('Processing outcome:', key, outcome);
									if (mergedOutcomes[key]) {
										let combinedSections;

										// Special handling for specific phobia test - insert after 3rd object
										if (assignment.testName === 'specific_phobia_test') {
											const originalSections = mergedOutcomes[key].report_sections || [];

											// Insert outcomes after the 3rd item
											combinedSections = [
												...originalSections.slice(0, 3), // First 3 items
												...(outcome.report_sections || []), // Insert new sections here
												...originalSections.slice(3) // Rest of the original sections
											];
											console.log('Special phobia - inserting after 3rd object:', combinedSections);
										} else {
											// Original logic for other tests - append at the end
											combinedSections = [
												...(mergedOutcomes[key].report_sections || []),
												...(outcome.report_sections || [])
											];
										}

										console.log('Combined sections:', combinedSections);
										// Update with combined sections but keep other properties from evaluatedResults
										mergedOutcomes[key] = {
											...outcome,
											report_sections: combinedSections
										};
									} else {
										// If outcome only exists in evaluatedResults, add it
										mergedOutcomes[key] = outcome;
									}
								});

								mergedResults.outcomes = mergedOutcomes;
							}

							// Use the merged results
							evaluatedResults = mergedResults;
							console.log('Merged results:', evaluatedResults);
						}
					}
				}
			} else {
				// Extract all test_codes referenced in reportLogic
				const findTestCodes = () => {
					const codes = new Set();
					const traverse = (node) => {
						if (!node || typeof node !== 'object') return;
						if (node.test_code) codes.add(node.test_code);
						Object.values(node).forEach(traverse);
					};
					traverse(reportLogic);
					return Array.from(codes);
				};

				// Get responses for each test_code
				const testCodes = findTestCodes();
				console.log(`Found test_codes in report logic: ${testCodes.join(', ')}`);
				const otherTestResponses = {};

				for (const testCode of testCodes) {
					try {
						// Find questionnaire by test_code
						const questionnaire = await Questionnaire.findOne({ test_code: testCode });
						if (!questionnaire) {
							console.error(`No questionnaire found for test_code: ${testCode}`);
							continue;
						}

						// Find assignment for this questionnaire and patient
						const assignment = await Assignment.findOne({
							patientId: userId,
							questionnaireId: questionnaire._id,
							status: { $in: ['completed', 'downloaded'] }
						});

						if (!assignment) {
							console.error(`No completed assignment found for test_code: ${testCode}`);
							continue;
						}

						// Get responses for this assignment
						const testResult = await getTestResponsesWithMetadata(assignment._id);
						if (testResult && testResult.responses) {
							// Normalize response values
							const normalizedResponses = {};
							for (const [key, value] of Object.entries(testResult.responses)) {
								normalizedResponses[key] = typeof value === 'object' ? value.value : value;
							}
							otherTestResponses[testCode] = normalizedResponses;
						}
					} catch (error) {
						console.error(`Error getting responses for test_code ${testCode}:`, error);
					}
				}

				// Create evaluation context with other test responses
				const evaluationContext = {
					_responses: responses,
					_otherTestResponses: otherTestResponses
				};

				// Evaluate test logic directly
				console.log(`Evaluating test logic for ${assignment.testName}`);
				evaluatedResults = evaluateTestExpressions(reportLogic, evaluationContext);
				console.log('Evaluated results:', evaluatedResults);
			}

			if (!evaluatedResults) {
				console.error(`Failed to evaluate test logic for ${assignment.testName}`);
				continue;
			}

			// Format results
			const formattedResults = formatTestResult(evaluatedResults);
			if (!formattedResults) {
				console.error(`Failed to format results for ${assignment.testName}`);
				continue;
			}

			// Build report structure for this test
			const testReport = {
				test_id: assignment.id,
				test_name: assignment.testName,
				report_title: reportLogic?.report_title || 'Diagnostic Report',
				report_sections: [],
				variables: evaluatedResults.variables || {}, // Include evaluated variables for PDF generation
				responses: responses || {} // Include responses for question placeholder replacement
			};

			// Collect all sections with their positions
			const allSections = [];
			Object.entries(formattedResults.outcomes).forEach(([key, outcome]) => {
				console.log(`Processing outcome: ${key}`);
				console.log(outcome);
				if (outcome.value === 1 && outcome.report_sections) {
					outcome.report_sections.forEach((section) => {
						// Add to the collection with position info
						allSections.push(section);
					});
				}
			});

			// Use the sorted sections
			testReport.report_sections = allSections;

			formattedReports.push(testReport);

			// Collect evaluated results for this test
			allEvaluatedResults.push({
				test_name: assignment.testName,
				test_id: assignment.id,
				evaluatedResults
			});
		}

		// Collect all variables and responses from all reports for global access
		const allVariables = {};
		const allResponses = {};
		formattedReports.forEach((report) => {
			if (report.variables) {
				Object.assign(allVariables, report.variables);
			}
			if (report.responses) {
				Object.assign(allResponses, report.responses);
			}
		});

		// Create final combined report structure
		const finalReportData = {
			patientInfo: updatedPatientInfo || {},
			userId,
			summary,
			reports: formattedReports,
			variables: { ...allVariables, ...allResponses } // Merge variables and responses for PDF generator
		};

		console.log('Final Report Structure:', {
			reportsCount: formattedReports.length,
			patientInfo: Object.keys(finalReportData.patientInfo),
			evaluatedResults: allEvaluatedResults.length
		});
		allEvaluatedResults.push(finalReportData);

		// Generate output based on type
		let outputBuffer;
		if (type === 'docx') {
			outputBuffer = await generateJsonBasedDocx(finalReportData);
		} else {
			outputBuffer = await generateJsonBasedPdf(finalReportData);
		}

		// Return both buffer and debug data
		return {
			pdfBuffer: outputBuffer, // Keeping property name for compatibility, but it might be DOCX
			allEvaluatedResults
		};
	} catch (error) {
		console.error('Report generation error:', error);
		throw error;
	}
}
