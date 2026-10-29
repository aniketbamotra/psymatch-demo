/**
 * Skip Logic Handler for Questionnaires
 *
 * This module handles the evaluation of skip logic conditions and determines
 * which questions should be displayed or skipped during a questionnaire.
 */

import { questionnaireStore } from '$lib/stores/questionnaire';
import skipLogicRulesData from './skip_logic_rules.json';

// Import the skip logic rules directly
const skipLogicRules = skipLogicRulesData.skip_logic_rules;

/**
 * Evaluates a simple condition against a response
 * @param {Object} condition - The condition to evaluate
 * @param {Array} responses - The questionnaire responses
 * @param {Object} userData - User data for attribute conditions
 * @returns {Boolean} Whether the condition is true
 */
function evaluateSimpleCondition(condition, responses, userData = {}) {
	// Handle user attribute conditions
	console.log('Condition1:', condition);
	console.log('Responses1:', responses);
	console.log('User Data1:', userData);
	if (condition.type === 'user_attribute') {
		const attributeValue = userData[condition.attribute];
		if (attributeValue === undefined) return false;

		return compareValues(attributeValue, condition.operator, condition.value);
	}

	// For regular question conditions
	const questionIndex = condition.question - 1; // Convert to 0-based index
	console.log('questionIndex:', questionIndex);
	if (
		!responses ||
		!responses[questionIndex] ||
		!Object.prototype.hasOwnProperty.call(responses[questionIndex], 'value')
	) {
		console.log('Responses Ivalid:', responses[questionIndex]);
		return false;
	}

	const responseValue = responses[questionIndex].value;
	console.log('Response Value1:', responseValue, condition);
	return compareValues(responseValue, condition.operator, condition.value);
}

/**
 * Compares two values using the specified operator
 * @param {any} leftValue - The left-hand value
 * @param {string} operator - The comparison operator
 * @param {any} rightValue - The right-hand value
 * @returns {Boolean} The result of the comparison
 */
function compareValues(leftValue, operator, rightValue) {
	// Parse values if they're strings that look like numbers
	const left =
		typeof leftValue === 'string' && !isNaN(leftValue) ? parseFloat(leftValue) : leftValue;
	const right =
		typeof rightValue === 'string' && !isNaN(rightValue) ? parseFloat(rightValue) : rightValue;
	console.log('Comparing:', left, operator, right);
	switch (operator) {
		case '==':
			return left == right;
		case '===':
			return left === right;
		case '!=':
			return left != right;
		case '!==':
			return left !== right;
		case '>':
			return left > right;
		case '>=':
			return left >= right;
		case '<':
			return left < right;
		case '<=':
			return left <= right;
		default:
			return false;
	}
}

/**
 * Evaluates a complex condition with AND, OR, or other operators
 * @param {Object} condition - The condition to evaluate
 * @param {Array} responses - The questionnaire responses
 * @param {Object} userData - User data for attribute conditions
 * @returns {Boolean} Whether the condition is true
 */
function evaluateComplexCondition(condition, responses, userData = {}) {
	// Handle different types of complex conditions
	switch (condition.type) {
		case 'and':
			return condition.rules.every((rule) => evaluateCondition(rule, responses, userData));

		case 'or':
			return condition.rules.some((rule) => evaluateCondition(rule, responses, userData));

		case 'all_equal':
			// Check if all specified questions have the same value
			return condition.questions.every((question) => {
				const questionIndex = question - 1; // Convert to 0-based index

				if (
					!responses ||
					!responses[questionIndex] ||
					!Object.prototype.hasOwnProperty.call(responses[questionIndex], 'value')
				) {
					return false;
				}

				const responseValue = responses[questionIndex].value;
				return compareValues(responseValue, condition.operator, condition.value);
			});

		case 'count': {
			// Count how many rules evaluate to true
			const trueCount = condition.rules.filter((rule) =>
				evaluateCondition(rule, responses, userData)
			).length;

			// Compare the count to the threshold
			return compareValues(trueCount, condition.count_operator, condition.threshold);
		}

		case 'count_equal': {
			// Count how many questions have the specified value
			const matchCount = condition.questions.filter((question) => {
				const questionIndex = question - 1; // Convert to 0-based index

				if (
					!responses ||
					!responses[questionIndex] ||
					!Object.prototype.hasOwnProperty.call(responses[questionIndex], 'value')
				) {
					return false;
				}

				const responseValue = responses[questionIndex].value;
				return compareValues(responseValue, condition.operator, condition.value);
			}).length;

			// Compare the count to the threshold
			return matchCount === condition.count;
		}

		case 'sum': {
			// Sum the values of the specified questions
			const sum = condition.questions.reduce((total, question) => {
				const questionIndex = question - 1; // Convert to 0-based index

				if (
					!responses ||
					!responses[questionIndex] ||
					!Object.prototype.hasOwnProperty.call(responses[questionIndex], 'value')
				) {
					return total;
				}

				const responseValue = responses[questionIndex].value;
				const numValue = parseFloat(responseValue);

				if (isNaN(numValue)) return total;
				return total + numValue;
			}, 0);

			// Compare the sum to the value
			return compareValues(sum, condition.operator, condition.value);
		}

		default:
			console.error('Unknown condition type:', condition.type);
			return false;
	}
}

/**
 * Evaluates a condition (simple or complex)
 * @param {Object} condition - The condition to evaluate
 * @param {Array} responses - The questionnaire responses
 * @param {Object} userData - User data for attribute conditions
 * @returns {Boolean} Whether the condition is true
 */
function evaluateCondition(condition, responses, userData = {}) {
	// If the condition has a type, it's a complex condition
	console.log('Condition:', condition);
	console.log('Responses:', responses);
	console.log('User Data:', userData);
	if (condition.type) {
		return evaluateComplexCondition(condition, responses, userData);
	}

	// Otherwise, it's a simple condition
	return evaluateSimpleCondition(condition, responses, userData);
}

/**
 * Determines if a question should be skipped based on the skip logic rules
 * @param {string} testCode - The code of the test
 * @param {number} questionIndex - The 1-based index of the question
 * @param {Array} responses - The questionnaire responses
 * @param {Object} userData - User data for attribute conditions
 * @returns {Object} Skip information { skip: boolean, nextQuestion: number, exitTest: boolean }
 */
export function shouldSkipQuestion(testCode, questionIndex, responses, userData = {}) {
	// If no rules for this test, don't skip
	if (!skipLogicRules[testCode]) {
		return {
			skip: false,
			question_to_evaluate: null,
			condition: null
		};
	}

	const testRules = skipLogicRules[testCode];

	// Check if this is a global rule (applies to all questions)
	const globalRules = testRules.filter((rule) => rule.question_to_evaluate === 'all');

	console.log(
		`[${testCode}] Evaluating ${globalRules.length} global rules for question ${questionIndex}`
	);

	// First evaluate global rules
	for (const rule of globalRules) {
		const conditionMet = evaluateCondition(rule.condition, responses, userData);
		console.log('-----------------------------------------------');
		console.log(`[${testCode}] RULE APPLIED: Global rule for all questions`);
		console.log(`Rule condition:`, JSON.stringify(rule.condition));
		console.log(`Rule evaluation result: ${conditionMet ? 'TRUE' : 'FALSE'}`);
		console.log(
			`Action if ${conditionMet ? 'true' : 'false'}: ${conditionMet ? rule.action_if_true : rule.action_if_false}`
		);
		console.log('-----------------------------------------------');

		if (conditionMet && rule.action_if_true === 'exit_test') {
			console.log(`[${testCode}] EXIT TEST triggered by global rule (condition TRUE)`);
			return { skip: true, exitTest: true, question_to_evaluate: 'all', appliedRule: rule };
		}

		if (!conditionMet && rule.action_if_false === 'exit_test') {
			console.log(`[${testCode}] EXIT TEST triggered by global rule (condition FALSE)`);
			return { skip: true, exitTest: true, question_to_evaluate: 'all', appliedRule: rule };
		}
	}

	// Then check for rules specific to this question
	const questionRules = testRules.filter((rule) => {
		// For array-based question_to_evaluate, check if the current index is in the array
		if (Array.isArray(rule.question_to_evaluate)) {
			console.log(
				`[${testCode}] Checking array rule: ${JSON.stringify(rule.question_to_evaluate)}`
			);
			return rule.question_to_evaluate.includes(questionIndex);
		}

		// For numeric question_to_evaluate, check direct match
		if (typeof rule.question_to_evaluate === 'number') {
			return rule.question_to_evaluate === questionIndex;
		}

		// For condition.question based rules
		if (rule.condition && rule.condition.question) {
			return rule.condition.question === questionIndex;
		}

		return false;
	});
	console.log('Question Rules:', questionRules, testRules);
	// If no rules for this question, don't skip
	if (questionRules.length === 0) {
		console.log('No rules for this question:', questionIndex);
		return { skip: false, question_to_evaluate: '' };
	}

	// Evaluate each rule
	for (const rule of questionRules) {
		console.log('-----------------------------------------------');
		console.log(`[${testCode}] RULE APPLIED: Question-specific rule for question ${questionIndex}`);
		console.log(`Question to evaluate:`, rule.question_to_evaluate);
		console.log(`Rule condition:`, JSON.stringify(rule.condition));

		const conditionMet = evaluateCondition(rule.condition, responses, userData);
		console.log(`Rule evaluation result: ${conditionMet ? 'TRUE' : 'FALSE'}`);
		console.log(
			`Action if ${conditionMet ? 'true' : 'false'}: ${conditionMet ? rule.action_if_true : rule.action_if_false}`
		);
		console.log('-----------------------------------------------');

		// Determine action based on condition result
		if (conditionMet) {
			if (rule.action_if_true === 'skip') {
				// Use next_if_skip if available, otherwise default to next question
				const nextQuestion =
					rule.next_if_skip !== undefined ? rule.next_if_skip : questionIndex + 2;
				console.log(
					`[${testCode}] SKIP to question ${nextQuestion} triggered by rule (condition TRUE)`
				);
				console.log(
					`[DEBUG] rule.next_if_skip = ${rule.next_if_skip}, using nextQuestion = ${nextQuestion}`
				);
				return {
					skip: true,
					nextQuestion: nextQuestion,
					question_to_evaluate: rule.question_to_evaluate,
					appliedRule: rule
				};
			} else if (rule.action_if_true === 'exit_test') {
				console.log(`[${testCode}] EXIT TEST triggered by rule (condition TRUE)`);
				return {
					skip: true,
					exitTest: true,
					question_to_evaluate: rule.question_to_evaluate,
					appliedRule: rule
				};
			} else if (rule.action_if_true === 'display') {
				console.log(`[${testCode}] DISPLAY question triggered by rule (condition TRUE)`);
				return {
					skip: false,
					question_to_evaluate: rule.question_to_evaluate,
					appliedRule: rule
				};
			}
		} else {
			if (rule.action_if_false === 'skip') {
				console.log(
					`[${testCode}] SKIP to question ${rule.next_if_skip || questionIndex + 2} triggered by rule (condition FALSE)`
				);
				return {
					skip: true,
					nextQuestion: rule.next_if_skip || questionIndex + 2,
					question_to_evaluate: rule.question_to_evaluate,
					appliedRule: rule
				};
			} else if (rule.action_if_false === 'exit_test') {
				console.log(`[${testCode}] EXIT TEST triggered by rule (condition FALSE)`);
				return {
					skip: true,
					exitTest: true,
					question_to_evaluate: rule.question_to_evaluate,
					appliedRule: rule
				};
			} else if (rule.action_if_false === 'display') {
				console.log(`[${testCode}] DISPLAY question triggered by rule (condition FALSE)`);
				return {
					skip: false,
					question_to_evaluate: rule.question_to_evaluate,
					appliedRule: rule
				};
			}
		}
	}

	// Default: don't skip
	return { skip: false, question_to_evaluate: '' };
}

/**
 * Auto-saves a default response for a single skipped question
 * @param {string} testCode - The code of the test
 * @param {number} questionIndex - The 1-based index of the question
 * @param {string} testName - The name of the test
 * @param {Object} appliedRule - The skip rule that was applied (if available)
 * @returns {Promise<void>}
 */
export async function saveSkippedQuestionResponse(
	testCode,
	questionIndex,
	testName,
	appliedRule = null
) {
	try {
		// Check if this question should be preserved (not auto-saved)
		if (
			appliedRule &&
			appliedRule.preserve_values &&
			appliedRule.preserve_values.includes(questionIndex)
		) {
			console.log(`Preserving original value for ${testCode} question ${questionIndex}`);
			return; // Skip auto-saving for preserved questions
		}

		// Format the question ID as it's stored in the responses
		const questionId = `q${questionIndex}`;

		// Get current responses from the store safely
		let existingResponse = null;
		try {
			let storeValue;
			// Use a safe method to get the current value without subscribing
			const unsubscribe = questionnaireStore.subscribe((state) => {
				storeValue = state;
			});
			unsubscribe(); // Immediately unsubscribe after getting the value

			// Check if responses exist in the store value
			if (storeValue && Array.isArray(storeValue.responses)) {
				existingResponse = storeValue.responses.find((r) => r.questionId === questionId);
			}
		} catch (err) {
			console.warn(`Could not access questionnaireStore: ${err.message}`);
		}

		if (existingResponse) {
			console.log(
				`Using existing value '${existingResponse.value}' for ${testCode} question ${questionIndex}`
			);
			return; // Keep the existing value, no need to save a new one
		}

		// If no existing response, use a default value
		let defaultValue = '0'; // Default fallback value
		console.log(
			'Custom skip values:',
			appliedRule ? appliedRule.custom_skip_values : 'Not Defined'
		);
		if (
			appliedRule &&
			appliedRule.custom_skip_values &&
			appliedRule.custom_skip_values[questionIndex]
		) {
			defaultValue = appliedRule.custom_skip_values[questionIndex];
			console.log(
				`Using custom skip value '${defaultValue}' for ${testCode} question ${questionIndex}`
			);
		}

		// Add response via addResponse method (store update)
		questionnaireStore.addResponse(questionId, defaultValue);

		// Import API module dynamically to avoid circular dependencies
		const api = await import('$lib/api.js');

		// Send to API
		const requestData = {
			testName: testName,
			questionId: `q${questionIndex}`,
			answer: defaultValue
		};

		const response = await api.post('/api/questionnaire-results', requestData);
		console.log('Auto-saved response:', response);
		if (!response.ok) {
			const errorData = await response.json();
			console.error('API Error:', errorData);
		} else {
			console.log(
				`Auto-saved response '${defaultValue}' for ${testCode} question ${questionIndex}`
			);
		}
	} catch (error) {
		console.error('Error saving skipped question response:', error);
	}
}

/**
 * Auto-saves default responses for multiple skipped questions based on skip logic
 * @param {string} testCode - The code of the test
 * @param {number} currentQuestionIndex - The current question index
 * @param {object} skipInfo - The skip info object containing question_to_evaluate
 * @param {string} testName - The name of the test
 * @param {number} totalQuestions - Total number of questions (for "all" case)
 * @returns {Promise<void>}
 */
export async function saveSkippedQuestionResponses(
	testCode,
	currentQuestionIndex,
	skipInfo,
	testName,
	totalQuestions = 0
) {
	try {
		// Check if skipInfo contains question_to_evaluate
		console.log('Skip Info1:', skipInfo);
		if (!skipInfo || (!skipInfo.question_to_evaluate && skipInfo.question_to_evaluate !== 0)) {
			// If no question_to_evaluate, just save for the current question
			await saveSkippedQuestionResponse(
				testCode,
				currentQuestionIndex,
				testName,
				skipInfo.appliedRule
			);
			return;
		}

		// Extract the applied rule for custom handling
		const appliedRule = skipInfo.appliedRule;

		// Special case for ADULT_BIO and marital status question
		if (
			testCode === 'ADULT_BIO' &&
			skipInfo.question_to_evaluate === 14 &&
			appliedRule &&
			appliedRule.custom_skip_values &&
			appliedRule.custom_skip_values['15']
		) {
			console.log(
				`Special handling for ADULT_BIO: Setting q15 to "${appliedRule.custom_skip_values['15']}"`
			);

			// Check if there's already a response for q15
			const existingResponse = false;

			if (existingResponse) {
				console.log(`Using existing value '${existingResponse.value}' for ${testCode} question 15`);
				return; // Keep the existing value, no need to save a new one
			}

			// Don't auto-save q14 (preserved), but explicitly save q15 with custom value if no existing value
			const q15Value = appliedRule.custom_skip_values['15'];

			// Add response via store
			questionnaireStore.addResponse(`q15`, q15Value);

			// Import API module dynamically to avoid circular dependencies
			const api = await import('$lib/api.js');

			// Send to API
			const requestData = {
				testName: testName,
				questionId: `q15`,
				answer: q15Value
			};

			const response = await api.post('/api/questionnaire-results', requestData);
			if (!response.ok) {
				console.error(`Error saving q15 response: ${q15Value}`);
			} else {
				console.log(`Auto-saved q15 response: '${q15Value}'`);
			}

			return; // Skip the regular processing
		}

		// Handle different types of question_to_evaluate values
		if (skipInfo.question_to_evaluate === 'all' && totalQuestions > 0) {
			// Special case: save for all questions except current one
			console.log(`Handling 'all' with total questions: ${totalQuestions}`);
			for (let i = currentQuestionIndex + 1; i <= totalQuestions; i++) {
				console.log(`Auto-saving skipped question response for ${testCode} question ${i}`);
				await saveSkippedQuestionResponse(testCode, i, testName, appliedRule);
			}
		} else if (Array.isArray(skipInfo.question_to_evaluate)) {
			// Save responses for all questions in the array
			for (const questionIndex of skipInfo.question_to_evaluate) {
				await saveSkippedQuestionResponse(testCode, questionIndex, testName, appliedRule);
			}
		} else {
			// If question_to_evaluate is a single value, save a single response
			await saveSkippedQuestionResponse(
				testCode,
				skipInfo.question_to_evaluate,
				testName,
				appliedRule
			);
		}
	} catch (error) {
		console.error('Error saving skipped question responses:', error);
	}
}

/**
 * Processes all skip logic for a range of questions and saves default responses
 * @param {string} testCode - The code of the test
 * @param {number} startIndex - The 1-based index to start from
 * @param {number} endIndex - The 1-based index to end at (inclusive)
 * @param {Array} responses - The questionnaire responses
 * @param {Object} userData - User data for attribute conditions
 * @returns {Promise<Object>} Info about the next question to show
 */
export async function processSkipLogicForRange(
	testCode,
	startIndex,
	endIndex,
	responses,
	userData = {}
) {
	let currentIndex = startIndex;

	while (currentIndex <= endIndex) {
		const skipInfo = shouldSkipQuestion(testCode, currentIndex, responses, userData);

		if (skipInfo.skip) {
			// Auto-save a default response for the skipped question(s)
			// Need to get testName from the calling context
			const testName = responses.testName || testCode;
			await saveSkippedQuestionResponses(testCode, currentIndex, skipInfo, testName);

			if (skipInfo.exitTest) {
				return { exitTest: true, question_to_evaluate: skipInfo.question_to_evaluate };
			}

			if (skipInfo.nextQuestion) {
				currentIndex = skipInfo.nextQuestion;
			} else {
				currentIndex++;
			}
		} else {
			// Found a question that should not be skipped
			return { nextQuestion: currentIndex };
		}
	}

	// If we've processed all questions, return the next index after the range
	return { nextQuestion: endIndex + 1 };
}
