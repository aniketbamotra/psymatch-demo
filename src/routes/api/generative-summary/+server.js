import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const { GENERATIVE_SUMMARY_WEBHOOK_URL, MONGODB_TOKEN, NODE_ENV } = env;
import { generateReport } from '$lib/utils/reportGenerators/index.js';
import { getPatientInfo } from '$lib/database/patientInfo.js';
import { getTestResponsesWithMetadata } from '$lib/database/testResponses.js';
import { getReportLogic } from '$lib/database/reportLogicSchemas.js';
import { Assignment, Questionnaire, GenerativeReport } from '$lib/database/schemas.js';
import { applyAnonymizationProfile } from '$lib/utils/anonymization/applyAnonymization.js';

/**
 * Handle GET request to check status of generative report for a patient
 */
export async function GET({ url, locals }) {
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
		// Get patientId from query params
		const patientId = url.searchParams.get('patientId');
		if (!patientId) {
			return json({ error: 'Patient ID is required' }, { status: 400 });
		}

		// Query database for existing report
		const existingReport = await GenerativeReport.findOne({ patientId });

		if (!existingReport) {
			return json({ status: 'Need to start' });
		}

		// Clean up failed records
		if (existingReport.status === 'failed') {
			await GenerativeReport.findByIdAndDelete(existingReport._id);
			console.log('Deleted failed report:', existingReport._id);
			return json({ status: 'Need to start' });
		}

		// Clean up completed records with empty PDF buffer
		if (
			existingReport.status === 'completed' &&
			(!existingReport.pdfBuffer || existingReport.pdfBuffer.length === 0)
		) {
			await GenerativeReport.findByIdAndDelete(existingReport._id);
			console.log('Deleted completed report with empty PDF buffer:', existingReport._id);
			return json({ status: 'Need to start' });
		}

		// Return status for valid records
		if (existingReport.status === 'processing') {
			return json({ status: 'processing' });
		} else if (existingReport.status === 'completed') {
			return json({ status: 'completed' });
		}
	} catch (error) {
		console.error('Status check error:', error);
		return json(
			{
				error: 'Failed to check report status',
				details: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * Handle POST request to generate diagnostic reports for specific test codes and send to external webhook
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
		const { patientId } = await request.json();
		console.log('Received request data:', { patientId });

		if (!patientId) {
			return json({ error: 'Patient ID is required' }, { status: 400 });
		}

		// Hardcoded test codes for this endpoint (in desired order)
		const targetTestCodes = [
			'THERAPIST_MATCH',
			'ADULT_BIO',
			'stressful_beliefs_index',
			'depression_test',
			'generalized_anxiety_test'
		];

		// Get questionnaires for the target test codes
		const questionnaires = await Questionnaire.find({ test_code: { $in: targetTestCodes } });
		if (questionnaires.length === 0) {
			return json({ error: 'No questionnaires found for target test codes' }, { status: 404 });
		}

		console.log(
			'Found questionnaires:',
			questionnaires.map((q) => ({ id: q._id, test_code: q.test_code }))
		);

		// Get assignments for the patient with these questionnaires
		const assignments = await Assignment.find({
			patientId,
			questionnaireId: { $in: questionnaires.map((q) => q._id) }
		}).populate('questionnaireId');

		if (assignments.length === 0) {
			return json(
				{ error: 'No assignments found for patient with target test codes' },
				{ status: 404 }
			);
		}

		console.log(
			'Found assignments:',
			assignments.map((a) => ({ id: a._id, test_code: a.questionnaireId.test_code }))
		);

		// Get patient info
		const patientInfo = await getPatientInfo(patientId);
		if (!patientInfo) {
			return json({ error: 'Patient not found' }, { status: 404 });
		}

		// Initialize report context
		const reportContext = {
			userId: patientId,
			patientInfo,
			assignments: assignments.map((a) => ({
				id: a._id,
				testName: a.questionnaireId.title,
				selected: true
			})),
			testResults: {},
			testLogics: {},
			pdfReports: []
		};

		// Validate test completion and get test results
		for (const assignment of assignments) {
			try {
				const testResult = await getTestResponsesWithMetadata(assignment._id);
				if (!testResult) {
					return json(
						{
							error: `Test ${assignment.questionnaireId.title} has no responses`,
							details: 'Test must be completed before generating report'
						},
						{ status: 400 }
					);
				}

				// Check if test is complete by comparing response count to question count
				const questionCount = assignment.questionnaireId.questions.length;
				const responseCount = Object.keys(testResult.responses).length;

				console.log(`Test completion check for ${assignment.questionnaireId.title}:`, {
					questionCount,
					responseCount,
					isComplete: responseCount === questionCount
				});

				if (responseCount !== questionCount) {
					return json(
						{
							error: `Test ${assignment.questionnaireId.title} is incomplete`,
							details: `Found ${responseCount} responses but expected ${questionCount} questions`
						},
						{ status: 400 }
					);
				}

				// Get questionnaire to check if this is a special test
				const questionnaire = assignment.questionnaireId;
				const isSpecialTest =
					questionnaire?.test_code &&
					[
						'THERAPIST_MATCH',
						'ADULT_BIO',
						'stressful_beliefs_index',
						'specific_phobia_test',
						'anorexia_test'
					].includes(questionnaire.test_code);

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
					// For regular tests, normalize as before
					const normalizedResponses = {};
					for (const [key, value] of Object.entries(testResult.responses || {})) {
						console.log('Normalizing response:', { key, value });
						normalizedResponses[key] = typeof value === 'object' ? value.value || value : value;
						console.log('Normalized response:', normalizedResponses[key]);
					}
					testResult.responses = normalizedResponses;
				}

				reportContext.testResults[assignment._id] = testResult;
			} catch (error) {
				console.error(`Error fetching test results for assignment ${assignment._id}:`, error);
				return json(
					{
						error: `Failed to fetch results for test ${assignment.questionnaireId.title}`,
						details: error.message
					},
					{ status: 500 }
				);
			}
		}

		// Build reports array with all necessary data
		const reportsData = [];
		for (const assignment of assignments) {
			try {
				const testResult = reportContext.testResults[assignment._id];
				if (!testResult || testResult.error) {
					continue;
				}

				// Get questionnaire to check for special test types first
				const questionnaire = assignment.questionnaireId;
				const isSpecialTest =
					questionnaire?.test_code &&
					[
						'THERAPIST_MATCH',
						'ADULT_BIO',
						'stressful_beliefs_index',
						'specific_phobia_test',
						'anorexia_test'
					].includes(questionnaire.test_code);
				console.log('Test details:', {
					testName: questionnaire.title,
					testCode: questionnaire?.test_code,
					isSpecialTest
				});

				// Get report logic from database
				const reportLogic = await getReportLogic(assignment.questionnaireId);
				console.log('Report logic:', reportLogic);

				if (!reportLogic && !isSpecialTest) {
					console.error(`No report logic found for test: ${questionnaire.title}`);
					continue;
				}

				// For special tests, use the responses directly
				if (isSpecialTest) {
					// Update assignment with correct test code and name
					const updatedAssignment = {
						id: assignment._id,
						testName: questionnaire.test_code,
						testCode: questionnaire.test_code,
						selected: true
					};

					console.log('Processing special test:', {
						originalName: questionnaire.title,
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
						assignment: {
							id: assignment._id,
							testName: questionnaire.title,
							selected: true
						},
						testResult,
						reportLogic: reportLogic || {},
						responses: testResult.responses,
						variables: reportLogic?.variables || [],
						criteria: reportLogic?.criteria || [],
						outcomes: reportLogic?.outcomes || [],
						report_title: reportLogic?.report_title || questionnaire.title
					});
				}
			} catch (assignmentError) {
				console.error(`Error processing assignment ${assignment._id}:`, assignmentError);
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

		// Sort reports data according to desired order - special tests first
		const testOrder = [
			'THERAPIST_MATCH',
			'ADULT_BIO',
			'stressful_beliefs_index',
			'depression_test',
			'generalized_anxiety_test'
		];
		reportsData.sort((a, b) => {
			// Get test codes for comparison
			const aTestCode = a.assignment.testCode || a.assignment.testName;
			const bTestCode = b.assignment.testCode || b.assignment.testName;

			// Check if tests are special tests
			const specialTests = ['THERAPIST_MATCH', 'ADULT_BIO', 'stressful_beliefs_index'];
			const aIsSpecial = specialTests.includes(aTestCode);
			const bIsSpecial = specialTests.includes(bTestCode);

			// If one is special and other is not, special comes first
			if (aIsSpecial && !bIsSpecial) return -1;
			if (!aIsSpecial && bIsSpecial) return 1;

			// If both are same type (both special or both regular), sort by predefined order
			const aIndex = testOrder.indexOf(aTestCode);
			const bIndex = testOrder.indexOf(bTestCode);
			return aIndex - bIndex;
		});

		// Apply Anonymization Profile (if processing is complete)
		const { patientInfo: finalPatientInfo, reportsData: finalReportsData } = applyAnonymizationProfile(patientInfo, reportsData);

		console.log('Reports data (sorted):', finalReportsData);
		let summary = false; // Disable summary for this endpoint
		// Generate PDF report
		const result = await generateReport({
			userId: patientId,
			patientInfo: finalPatientInfo,
			reportsData: finalReportsData,
			summary
		});

		console.log('Generated PDF buffer length:', result.pdfBuffer.length);
		console.log('PDF buffer (first 100 bytes):', result.pdfBuffer);

		// Write PDF to file on server for debugging

		// Check if there's already an existing report for this patient
		const existingReport = await GenerativeReport.findOne({ patientId });
		if (existingReport && existingReport.status !== 'failed') {
			return json(
				{
					error: 'Report already exists for this patient',
					details: `Existing report ID: ${existingReport._id}, Status: ${existingReport.status}`
				},
				{ status: 409 }
			);
		}

		// If there's a failed report, delete it before creating a new one
		if (existingReport && existingReport.status === 'failed') {
			await GenerativeReport.findByIdAndDelete(existingReport._id);
			console.log('Deleted failed report:', existingReport._id);
		}

		// Create record in generative_reports collection with processing status
		const reportRecord = new GenerativeReport({
			patientId,
			status: 'processing'
		});
		await reportRecord.save();

		console.log('Created generative report record:', reportRecord._id);

		// Send PDF to external webhook
		const webhookUrl = GENERATIVE_SUMMARY_WEBHOOK_URL;
		if (!webhookUrl) {
			// Clean up the record if webhook URL is not configured
			await GenerativeReport.findByIdAndDelete(reportRecord._id);
			return json(
				{
					error: 'Webhook URL not configured',
					details: 'GENERATIVE_SUMMARY_WEBHOOK_URL environment variable is required'
				},
				{ status: 500 }
			);
		}

		try {
			console.log('Sending PDF to webhook:', webhookUrl);
			const webhookResponse = await fetch(webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/pdf',
					bufferId: reportRecord._id.toString(),
					env: NODE_ENV || 'development',
					patientId: patientId,
					mongodb_token: MONGODB_TOKEN
				},
				body: result.pdfBuffer
			});

			if (webhookResponse.ok) {
				// Update status to completed
				console.log('Webhook request successful');

				return json({
					message: 'Reports generated and sent successfully',
					reportId: reportRecord._id,
					processedTests: reportsData.length
				});
			} else {
				// Webhook failed, clean up the record
				await GenerativeReport.findByIdAndDelete(reportRecord._id);
				console.error(
					'Webhook request failed:',
					webhookResponse.status,
					webhookResponse.statusText
				);

				return json(
					{
						error: 'Failed to send report to external service',
						details: `Webhook returned ${webhookResponse.status}: ${webhookResponse.statusText}`
					},
					{ status: 500 }
				);
			}
		} catch (webhookError) {
			// Network error or other webhook failure, clean up the record
			await GenerativeReport.findByIdAndDelete(reportRecord._id);
			console.error('Webhook request error:', webhookError);

			return json(
				{
					error: 'Failed to send report to external service',
					details: webhookError.message
				},
				{ status: 500 }
			);
		}
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
