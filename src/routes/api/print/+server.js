import { json } from '@sveltejs/kit';
import { generateReport } from '$lib/utils/reportGenerators/index.js';
import { getPatientInfo } from '$lib/database/patientInfo.js';
import { getTestResponsesWithMetadata } from '$lib/database/testResponses.js';
import { getReportLogic } from '$lib/database/reportLogicSchemas.js';
import { Assignment, Questionnaire, Status, QuestionnaireOrder } from '$lib/database/schemas.js';
import { applyAnonymizationProfile } from '$lib/utils/anonymization/applyAnonymization.js';
import { normalizeRuleEngineResponses } from '$lib/utils/reportResponses.js';

/**
 * Fetch questionnaire order and create a sorting map
 * Returns a Map of test_code -> order position
 */
async function getQuestionnaireOrderMap() {
	try {
		const orderDoc = await QuestionnaireOrder.findOne();

		if (!orderDoc || !orderDoc.orderedTestCodes) {
			// No order configured - return empty map (will use default order)
			return new Map();
		}

		// Create map: test_code -> index (position)
		const orderMap = new Map();
		orderDoc.orderedTestCodes.forEach((testCode, index) => {
			orderMap.set(testCode, index);
		});
		console.log('Questionnaire order map:', orderMap);
		return orderMap;
	} catch (error) {
		console.error('Error fetching questionnaire order:', error);
		// Return empty map on error - fall back to default order
		return new Map();
	}
}

/**
 * Handle POST request to generate diagnostic reports for multiple assignment
 */
export async function POST({ request, locals }) {
	// Check if user is authenticated and is an admin
	if (!locals.user) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	if (locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized: admin access required' }, { status: 403 });
	}

	try {
		const { assignments, userId, summary, debug, type = 'pdf', redactPii = false } = await request.json();
		console.log('Received request data:', { assignments, userId, summary, debug, type });

		// Get patient info
		const patientInfo = await getPatientInfo(userId);
		if (!patientInfo) {
			return json({ error: 'Patient not found' }, { status: 404 });
		}

		// Initialize report context
		const reportContext = {
			userId,
			patientInfo,
			assignments,
			testResults: {},
			testLogics: {},
			pdfReports: []
		};

		// Get test results and normalize response values
		for (const assignment of assignments) {
			try {
				const testResult = await getTestResponsesWithMetadata(assignment.id);
				if (testResult) {
					// Get questionnaire to check if this is a special test
					const assignmentDoc = await Assignment.findOne({ _id: assignment.id });
					const questionnaire = await Questionnaire.findById(assignmentDoc.questionnaireId).lean();
					const isSpecialTest =
						questionnaire?.test_code &&
						['THERAPIST_MATCH', 'ADULT_BIO', 'stressful_beliefs_index'].includes(
							questionnaire.test_code
						);

					console.log('Raw test result responses:', testResult.responses);
					console.log('Raw test result responseCount:', testResult.responseCount);

					if (isSpecialTest) {
						// For special tests, preserve the complete response structure
						console.log(`Processing special test responses for ${questionnaire.test_code}`);
						const specialResponses = {};

						// Use responseCount if available, otherwise fall back to responses
						const sourceData = testResult.responseCount || testResult.responses || {};
						console.log('Using source data:', sourceData);

						for (const [key, value] of Object.entries(sourceData)) {
							if (questionnaire.test_code === 'stressful_beliefs_index') {
								// For Stressful Beliefs Index, always extract value from object
								specialResponses[key] = typeof value === 'object' ? value.value : value;
							} else if (key === 'q9') {
								// Handle timing question differently for Therapist Match
								specialResponses[key] = typeof value === 'object' ? value.value : value;
							} else {
								// Preserve complete structure for other special tests
								specialResponses[key] = value;
							}
						}
						console.log('Processed special responses:', specialResponses);
						testResult.responses = specialResponses;
					} else {
						// Shared with the AI-report path (agentInput/ruleEngine.js) so the two
						// reports cannot fire different outcomes for the same answers —
						// they did, on 13 of 117 real evaluations, until 2026-08-04.
						testResult.responses = normalizeRuleEngineResponses(
							testResult.responses,
							questionnaire?.test_code
						);
					}

					reportContext.testResults[assignment.id] = testResult;
				} else {
					console.error('No test results found for assignment:', assignment.id);
					reportContext.testResults[assignment.id] = { error: 'No test results found' };
				}
			} catch (error) {
				console.error(`Error fetching test results for assignment ${assignment.id}:`, error);
				reportContext.testResults[assignment.id] = { error: error.message };
			}
		}

		// Process selected assignments
		const selectedAssignments = assignments.filter((assignment) => assignment.selected);
		if (selectedAssignments.length === 0) {
			return json({
				message: 'No assignments selected for report generation',
				context: reportContext
			});
		}

		// Build reports array with all necessary data
		const reportsData = [];
		for (const assignment of selectedAssignments) {
			try {
				const testResult = reportContext.testResults[assignment.id];
				if (!testResult || testResult.error) {
					continue;
				}
				let assignmentDoc = await Assignment.findOne({ _id: assignment.id });
				console.log('Assignment doc:', assignmentDoc.questionnaireId);

				// Get questionnaire to check for special test types first
				const questionnaire = await Questionnaire.findById(assignmentDoc.questionnaireId).lean();
				const isSpecialTest =
					questionnaire?.test_code &&
					[
						'THERAPIST_MATCH',
						'ADULT_BIO',
						'stressful_beliefs_index',
						'specific_phobia_test'
					].includes(questionnaire.test_code);
				console.log('Test details:', {
					testName: assignment.testName,
					testCode: questionnaire?.test_code,
					isSpecialTest
				});
				// Get report logic from database
				const reportLogic = await getReportLogic(assignmentDoc.questionnaireId);
				console.log('Report logic:', reportLogic);
				console.log('Report logic variables:', reportLogic?.variables);
				if (!reportLogic && !isSpecialTest) {
					console.error(`No report logic found for test: ${assignment.testName}`);
					continue;
				}

				// For special tests, use the responses directly
				if (isSpecialTest) {
					// Update assignment with correct test code and name
					const updatedAssignment = {
						...assignment,
						testCode: questionnaire.test_code,
						testName: questionnaire.test_code // Use test code as name for consistency
					};

					console.log('Processing special test:', {
						originalName: assignment.testName,
						updatedName: updatedAssignment.testName,
						testCode: updatedAssignment.testCode
					});

					reportsData.push({
						assignment: updatedAssignment,
						testResult,
						reportLogic: reportLogic || {}, // Empty object for special tests
						responses: testResult.responses, // Use responses directly for special tests
						variables: [],
						criteria: [],
						outcomes: [],
						report_title:
							questionnaire.title ||
							(questionnaire.test_code === 'stressful_beliefs_index'
								? 'Stressful Beliefs Index Results'
								: 'Therapist Matching Report')
					});
				} else {
					// For regular tests, use the normal report logic
					reportsData.push({
						assignment,
						testResult,
						reportLogic: reportLogic || {},
						responses: testResult.responses,
						variables: reportLogic?.variables || [],
						criteria: reportLogic?.criteria || [],
						outcomes: reportLogic?.outcomes || [],
						report_title: reportLogic?.report_title || assignment.testName
					});
				}
			} catch (assignmentError) {
				console.error(`Error processing assignment ${assignment.id}:`, assignmentError);
			}
		}

		if (reportsData.length === 0) {
			return json(
				{
					error: 'No reports could be generated',
					context: reportContext
				},
				{ status: 500 }
			);
		}
		console.log('Reports data:', reportsData);
		console.log('Response1:', reportsData[0].testResult.responses);

		// Sort reports based on configured questionnaire order
		const orderMap = await getQuestionnaireOrderMap();
		if (orderMap.size > 0) {
			reportsData.sort((a, b) => {
				// Get test codes from the report data
				const testCodeA = a.assignment.testCode || a.testResult.testCode;
				const testCodeB = b.assignment.testCode || b.testResult.testCode;

				// Get order positions (999 for tests not in the order - they go to the end)
				const orderA = orderMap.get(testCodeA) ?? 999;
				const orderB = orderMap.get(testCodeB) ?? 999;

				return orderA - orderB;
			});

			console.log(
				'Reports sorted by questionnaire order:',
				reportsData.map((r) => r.assignment.testCode || r.testResult.testCode)
			);
		} else {
			console.log('No questionnaire order configured, using default order');
		}

		// Apply Anonymization Profile only when redactPii is explicitly requested
		let finalPatientInfo = patientInfo;
		let finalReportsData = reportsData;
		if (redactPii) {
			({ patientInfo: finalPatientInfo, reportsData: finalReportsData } = applyAnonymizationProfile(patientInfo, reportsData));
		}

		// Generate report
		const result = await generateReport({
			userId,
			patientInfo: finalPatientInfo,
			reportsData: finalReportsData,
			summary,
			type
		});

		// Mark selected assignments as downloaded
		const now = new Date();
		for (const assignment of selectedAssignments) {
			await Assignment.findByIdAndUpdate(assignment.id, {
				status: 'downloaded',
				downloadedOn: now
			});
		}

		// Update Status: check if all assignments are downloaded/completed
		const status = await Status.findOne({ patientId: userId });
		if (status) {
			const allAssignments = await Assignment.find({
				_id: { $in: status.assignmentIds }
			});

			const allDownloadedOrCompleted = allAssignments.every(
				(a) => a.status === 'downloaded' || a.status === 'completed'
			);

			if (allDownloadedOrCompleted) {
				status.status = 'completed';
				await status.save();
			}
		}

		// Return based on debug mode
		if (debug) {
			// Return both PDF buffer and debug results
			return json({
				pdfBuffer: Array.from(result.pdfBuffer),
				allEvaluatedResults: result.allEvaluatedResults
			});
		}

		// Return file based on type
		const isDocx = type === 'docx';
		const contentType = isDocx
			? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			: 'application/pdf';
		const extension = isDocx ? 'docx' : 'pdf';

		// Generate filename: YYYY-MM-DD_FirstName_LastName_Report_HHmmss.ext
		const reportDate = new Date();
		const dateStr = reportDate.toISOString().split('T')[0]; // YYYY-MM-DD
		const timeStr = reportDate.toTimeString().split(' ')[0].replace(/:/g, ''); // HHmmss
		const firstName = patientInfo.firstName || 'Patient';
		const lastName = patientInfo.lastName || '';
		const nameStr = lastName ? `${firstName}_${lastName}` : firstName;

		const filename = `${dateStr}_${nameStr}_Report_${timeStr}.${extension}`;

		// Content-Disposition values must be Latin-1 (ByteString). Patient names can contain
		// non-Latin-1 characters (e.g. the curly apostrophe U+2019 in "O’Halloran"), which would
		// otherwise throw "Cannot convert argument to a ByteString". Per RFC 6266 we send an
		// ASCII-only fallback plus a UTF-8 (RFC 5987) encoded variant for modern browsers.
		const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
		const encodedFilename = encodeURIComponent(filename);

		return new Response(result.pdfBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
			}
		});
	} catch (error) {
		console.error('Report generation error:', error);
		return json(
			{
				error: 'Failed to generate reports',
				details: error.message
			},
			{ status: 500 }
		);
	}
}
