import { ReportLogic } from '../../reportLogicSchemas.js';
import depressionTestReportLogic from './jsons/depression_test_report_logic.json';
import generalizedAnxietyTestReportLogic from './jsons/generalized_anxiety_test_report_logic.json';
import manicTestReportLogic from './jsons/manic_test_report_logic.json';
import panicTestReportLogic from './jsons/panic_test_report_logic.json';
import persistentDepressiveTestReportLogic from './jsons/persistent_depressive_test_report_logic.json';
import sleepDisorderTestReportLogic from './jsons/sleep_disorder_test_report_logic.json';
import socialAnxietyTestReportLogic from './jsons/social_anxiety_test_report_logic.json';

/**
 * Test logic initialization data for all diagnostic tests
 */
export const testLogics = {
	depression_test: depressionTestReportLogic,
	generalized_anxiety_test: generalizedAnxietyTestReportLogic,
	manic_test: manicTestReportLogic,
	panic_test: panicTestReportLogic,
	persistent_depressive_test: persistentDepressiveTestReportLogic,
	sleep_disorder_test: sleepDisorderTestReportLogic,
	social_anxiety_test: socialAnxietyTestReportLogic
};

/**
 * Initialize test logics in the database
 * @param {mongoose.Connection} db - MongoDB connection
 * @param {Map<string, mongoose.Types.ObjectId>} questionnaireMap - Map of test codes to questionnaire IDs
 */
export async function initializeTestLogics(questionnaireMap) {
	try {
		// Validate questionnaireMap
		if (!questionnaireMap) {
			throw new Error('questionnaireMap is required but was not provided');
		}
		if (!(questionnaireMap instanceof Map)) {
			throw new Error('questionnaireMap must be an instance of Map');
		}

		console.log('Initializing test logics with questionnaire map:');
		console.log('Map size:', questionnaireMap.size);
		questionnaireMap.forEach((value, key) => {
			console.log(`${key} => ${value}`);
		});

		// Create test logics in parallel for better performance
		await Promise.all(
			Object.entries(testLogics).map(async ([testCode, logic]) => {
				console.log('testCode', testCode);
				console.log('logic');
				console.log(logic);

				const questionnaireId = questionnaireMap.get(testCode);

				// Check if report logic already exists
				const existingLogic = await ReportLogic.findOne({
					questionnaire: questionnaireId
				});

				// Transform test logic to match schema requirements
				const transformedLogic = {
					questionnaire: questionnaireId,
					test_evaluation: {
						variables: logic.test_evaluation.variables
							.map((variable) => {
								// Ensure variable has required fields
								if (!variable.name && !variable.id) {
									console.warn(`Variable missing name/id in ${testCode}, skipping:`, variable);
									return null;
								}
								if (!variable.operation) {
									console.warn(`Variable missing operation in ${testCode}, skipping:`, variable);
									return null;
								}
								return {
									name: variable.name || variable.id,
									operation: variable.operation
								};
							})
							.filter(Boolean), // Remove null entries

						criteria: logic.test_evaluation.criteria,
						report_title: logic.test_evaluation.report_title,
						outcomes: logic.test_evaluation.outcomes.map((outcome) => ({
							...outcome,
							report_sections: outcome.report_sections.map((section) => ({
								...section,
								bullet_points:
									section.bullet_points
										?.map((point) => {
											if (!point.text) {
												console.warn(`Bullet point missing text in ${testCode}, skipping:`, point);
												return null;
											}
											return point;
										})
										.filter(Boolean) || [] // Remove null entries and handle undefined
							}))
						}))
					}
				};

				console.log(
					`Transformed logic for ${testCode}:`,
					JSON.stringify(transformedLogic, null, 2)
				);

				// Validate transformed logic
				console.log(`Validating transformed logic for ${testCode}`);
				const validationError = new ReportLogic(transformedLogic).validateSync();
				if (validationError) {
					console.error(`Validation error for ${testCode}:`, validationError);
					return;
				}

				if (existingLogic) {
					// Update existing logic
					await ReportLogic.updateOne(
						{ questionnaire: questionnaireId },
						{ $set: transformedLogic }
					);
				} else {
					// Create new logic
					await ReportLogic.create(transformedLogic);
				}
			})
		);

		console.log('Test logics initialized successfully');
	} catch (error) {
		console.error('Error initializing test logics:', error);
		throw error;
	}
}
