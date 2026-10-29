import { writable } from 'svelte/store';

const createQuestionnaireStore = () => {
	const { subscribe, set, update } = writable({
		isLoading: false,
		currentQuestionnaire: null,
		responses: [],
		questionLeft: 0
	});

	return {
		subscribe,
		setLoading: (loading) => update((store) => ({ ...store, isLoading: loading })),
		setQuestionnaire: (questionnaire) =>
			update((store) => ({ ...store, currentQuestionnaire: questionnaire })),
		setQuestionLeft: (questionNo) => update((store) => ({ ...store, questionLeft: questionNo })),
		addResponse: (questionId, value) => {
			update((store) => {
				console.log('Store:', store);
				console.log('Question ID:', questionId);
				console.log('Value:', value);
				const responses = Array.isArray(store.responses) ? store.responses : [];
				const existingIndex = responses.findIndex((r) => r.questionId === questionId);

				if (existingIndex >= 0) {
					responses[existingIndex] = { questionId, value };
				} else {
					responses.push({ questionId, value });
				}

				console.log('Store Updated:', {
					responses,
					questionId,
					value
				});

				return {
					...store,
					responses
				};
			});
		},
		clearResponsesAheadOfIndex: (currentIndex) => {
			return new Promise((resolve) => {
				update((store) => {
					// Only run the filter if there are responses
					const responses = Array.isArray(store.responses) ? store.responses : [];
					if (responses.length === 0) {
						resolve(store); // Resolve immediately if no responses
						return store;
					}

					// Check if there are any responses ahead of current index
					const hasResponsesAhead = responses.some((r) => {
						// Extract numeric index from questionId (q1, q2, etc.)
						const responseIndex = parseInt(r.questionId.substring(1));
						return responseIndex > currentIndex;
					});

					// Only perform filtering if necessary
					if (!hasResponsesAhead) {
						resolve(store); // Resolve immediately if no responses to clear
						return store;
					}

					const filteredResponses = responses.filter((r) => {
						// Extract numeric index from questionId (q1, q2, etc.)
						const responseIndex = parseInt(r.questionId.substring(1));
						return responseIndex <= currentIndex;
					});

					console.log('Cleared responses ahead of index:', currentIndex, {
						before: responses.length,
						after: filteredResponses.length
					});

					// Sync with database for authenticated users
					const testName = store.currentQuestionnaire?.title;
					if (testName) {
						fetch('/api/questionnaire-results', {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								testName,
								operation: 'clearResponsesAhead',
								parameters: { currentIndex }
							})
						})
							.then(() => {
								console.log('Responses cleared in DB successfully');
								resolve({ ...store, responses: filteredResponses }); // Resolve promise when API call completes
							})
							.catch((err) => {
								console.error('Error syncing response changes to DB:', err);
								// Still resolve since client-side update was successful
								resolve({ ...store, responses: filteredResponses });
							});
					} else {
						resolve({ ...store, responses: filteredResponses }); // Resolve immediately if no testName
					}

					return { ...store, responses: filteredResponses };
				});
			});
		},
		sanitizeResponseSequence: () => {
			return new Promise((resolve) => {
				update((store) => {
					const responses = Array.isArray(store.responses) ? store.responses : [];
					if (responses.length === 0) {
						resolve(store);
						return store;
					}

					// Quick check: map all response indices
					const responseIndices = new Map();
					let highestIndex = 0;

					for (const response of responses) {
						const index = parseInt(response.questionId.substring(1));
						responseIndices.set(index, response);
						highestIndex = Math.max(highestIndex, index);
					}

					// If no responses or only one response, no sanitization needed
					if (highestIndex <= 1) {
						resolve(store);
						return store;
					}

					// Check for gaps in sequence
					let firstGapIndex = null;
					for (let i = 1; i <= highestIndex; i++) {
						if (!responseIndices.has(i)) {
							firstGapIndex = i;
							break;
						}
					}

					// If no gaps found, return unchanged
					if (firstGapIndex === null) {
						resolve(store);
						return store;
					}

					// Remove all responses from the first gap onwards
					const sanitizedResponses = responses.filter((r) => {
						const index = parseInt(r.questionId.substring(1));
						return index < firstGapIndex;
					});

					console.log('Sanitized response sequence:', {
						firstGapFound: firstGapIndex,
						before: responses.length,
						after: sanitizedResponses.length
					});

					// Sync with database for authenticated users
					const testName = store.currentQuestionnaire?.title;
					if (testName && firstGapIndex !== null) {
						fetch('/api/questionnaire-results', {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								testName,
								operation: 'sanitizeSequence'
							})
						})
							.then(() => {
								console.log('Responses sanitized in DB successfully');
								resolve({ ...store, responses: sanitizedResponses });
							})
							.catch((err) => {
								console.error('Error syncing sanitized responses to DB:', err);
								// Continue with client-side update even if DB sync fails
								resolve({ ...store, responses: sanitizedResponses });
							});
					} else {
						resolve({ ...store, responses: sanitizedResponses });
					}

					return { ...store, responses: sanitizedResponses };
				});
			});
		},
		reset: () =>
			set({
				isLoading: false,
				currentQuestionnaire: null,
				responses: [],
				questionLeft: 0
			})
	};
};

export const questionnaireStore = createQuestionnaireStore();
