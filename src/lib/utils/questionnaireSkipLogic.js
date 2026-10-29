/**
 * Questionnaire Skip Logic Integration
 *
 * This module provides functions to integrate skip logic into the questionnaire flow.
 * It handles navigation between questions, skipping questions based on rules,
 * and automatically saving default values for skipped questions.
 */

import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { questionnaireStore } from '$lib/stores/questionnaire';
import {
	shouldSkipQuestion,
	processSkipLogicForRange,
	saveSkippedQuestionResponse
} from './skipLogicHandler';

/**
 * Determines the next question to navigate to based on skip logic
 * @param {string} testName - The name of the test
 * @param {number} currentQuestionIndex - The current question index (1-based)
 * @param {boolean} isBackward - Whether navigation is backward
 * @returns {Promise<Object>} Navigation information
 */
export async function getNextQuestionIndex(testName, currentQuestionIndex, isBackward = false) {
	// If navigating backward, just return the previous question
	if (isBackward) {
		return { nextIndex: currentQuestionIndex - 1 };
	}

	// Get current responses
	const responses = get(questionnaireStore).responses;
	const totalQuestions = get(questionnaireStore).currentQuestionnaire?.questions.length || 0;

	// If we're at the last question, go to thank you page
	if (currentQuestionIndex >= totalQuestions) {
		return { exitTest: true };
	}

	// Check if the next question should be skipped
	const skipInfo = await shouldSkipQuestion(testName, currentQuestionIndex + 1, responses);

	if (skipInfo.skip) {
		// Auto-save default response for the skipped question
		await saveSkippedQuestionResponse(testName, currentQuestionIndex + 1);

		// If we need to exit the test
		if (skipInfo.exitTest) {
			return { exitTest: true };
		}

		// If we need to skip to a specific question
		if (skipInfo.nextQuestion) {
			// Process any further skip logic
			return processSkipLogicForRange(testName, skipInfo.nextQuestion, totalQuestions, responses);
		}

		// Otherwise just go to the next question
		return { nextIndex: currentQuestionIndex + 2 };
	}

	// No skipping needed, go to next question
	return { nextIndex: currentQuestionIndex + 1 };
}

/**
 * Navigates to the appropriate next question or thank you page
 * @param {string} testName - The name of the test
 * @param {number} currentQuestionIndex - The current question index (1-based)
 * @param {boolean} isBackward - Whether navigation is backward
 * @returns {Promise<void>}
 */
export async function navigateToNextQuestion(testName, currentQuestionIndex, isBackward = false) {
	const navInfo = await getNextQuestionIndex(testName, currentQuestionIndex, isBackward);

	if (navInfo.exitTest) {
		// Complete the test and go to thank you page
		await completeTest(testName);
		goto(`/patient/${testName}/thank-you`);
	} else if (navInfo.nextIndex) {
		// Navigate to the next appropriate question
		goto(`/patient/${testName}/${navInfo.nextIndex}`);
	}
}

/**
 * Marks a test as completed by sending an API request
 * @param {string} testName - The name of the test
 * @returns {Promise<void>}
 */
async function completeTest(testName) {
	try {
		await fetch(`/api/questionnaire-results`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ testName })
		});
	} catch (error) {
		console.error('Error completing test:', error);
	}
}

/**
 * Processes skip logic when a questionnaire is first loaded
 * @param {string} testName - The name of the test
 * @param {number} currentQuestionIndex - The current question index (1-based)
 * @returns {Promise<void>}
 */
export async function processInitialSkipLogic(testName, currentQuestionIndex) {
	// First ensure all previous questions have been answered
	// (This handles cases where the user refreshes the page or navigates directly to a URL)
	await ensurePreviousQuestionsAnswered(testName, currentQuestionIndex);

	// Then check if the current question should be skipped
	const responses = get(questionnaireStore).responses;
	const skipInfo = await shouldSkipQuestion(testName, currentQuestionIndex, responses);

	if (skipInfo.skip) {
		// Auto-save default response for the skipped question
		await saveSkippedQuestionResponse(testName, currentQuestionIndex);

		if (skipInfo.exitTest) {
			// Complete the test and go to thank you page
			await completeTest(testName);
			goto(`/patient/${testName}/thank-you`);
			return;
		}

		// Navigate to the next appropriate question
		const nextIndex = skipInfo.nextQuestion || currentQuestionIndex + 1;
		goto(`/patient/${testName}/${nextIndex}`);
	}
}

/**
 * Ensures all questions before the current one have responses
 * This handles edge cases like direct URL navigation or refreshes
 * @param {string} testName - The name of the test
 * @param {number} currentQuestionIndex - The current question index (1-based)
 * @returns {Promise<void>}
 */
async function ensurePreviousQuestionsAnswered(testName, currentQuestionIndex) {
	const responses = get(questionnaireStore).responses;

	// For each question before the current one
	for (let i = 1; i < currentQuestionIndex; i++) {
		// Check if we have a response
		const hasResponse = responses.some((r) => r.questionId === `q${i}`);

		if (!hasResponse) {
			// Check if this question should be skipped
			const skipInfo = await shouldSkipQuestion(testName, i, responses);

			if (skipInfo.skip) {
				// Auto-save default response for the skipped question
				await saveSkippedQuestionResponse(testName, i);
			}
		}
	}
}
