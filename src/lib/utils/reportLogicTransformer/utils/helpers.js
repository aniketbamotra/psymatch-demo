/**
 * Evaluate test expressions with given context
 */
export function evaluateTestExpressions(reportLogic, context) {
	try {
		if (!reportLogic || !context) {
			console.error('Invalid input for evaluation:', { reportLogic, context });
			return null;
		}

		// First evaluate variables in order
		const variableResults = {};
		for (const variable of reportLogic.variables || []) {
			try {
				variableResults[variable.name] = evaluateOperation(variable.operation, {
					...context,
					...variableResults // Include previously evaluated variables
				});
			} catch (error) {
				console.error(`Error evaluating variable ${variable.name}:`, error);
				variableResults[variable.name] = null;
			}
		}

		// Add variable results to context for criteria evaluation
		const criteriaContext = { ...context, ...variableResults };
		console.log('criteriaContext');
		console.log(criteriaContext);
		// Evaluate criteria
		const criteriaResults = {};
		for (const criterion of reportLogic.criteria || []) {
			try {
				criteriaResults[criterion.id] = evaluateOperation(criterion.operation, {
					...criteriaContext,
					...criteriaResults // Include previously evaluated variables
				});
			} catch (error) {
				console.error(`Error evaluating criterion ${criterion.id}:`, error);
				criteriaResults[criterion.id] = null;
			}
		}

		// Add criteria results to context for outcome evaluation
		const outcomeContext = { ...criteriaContext, ...criteriaResults };
		console.log('outcomeContext');
		console.log(outcomeContext);
		// Evaluate outcomes and their sections
		const outcomeResults = {};
		for (const outcome of reportLogic.outcomes || []) {
			try {
				const outcomeValue = evaluateOperation(outcome.operation, outcomeContext);

				// Evaluate report sections if outcome is true
				let reportSections = [];
				if (outcomeValue === 1 && outcome.report_sections) {
					reportSections = outcome.report_sections
						.map((section) => {
							// Evaluate section
							const evaluatedSection = evaluateReportSection(section, outcomeContext);
							return evaluatedSection;
						})
						.filter(Boolean);
				}

				outcomeResults[outcome.type] = {
					value: outcomeValue,
					report_sections: reportSections
				};
				if (outcomeValue === 1) {
					return {
						variables: variableResults,
						criteria: criteriaResults,
						outcomes: outcomeResults
					};
				}
			} catch (error) {
				console.error(`Error evaluating outcome ${outcome.type}:`, error);
				outcomeResults[outcome.type] = null;
			}
		}

		return {
			variables: variableResults,
			criteria: criteriaResults,
			outcomes: outcomeResults
		};
	} catch (error) {
		console.error('Error evaluating test expressions:', error);
		return null;
	}
}

/**
 * Evaluate operation
 */
export function evaluateOperation(operation, context) {
	try {
		if (!operation) {
			console.error('No operation provided');
			return null;
		}

		// Handle range operations - can appear in multiple places
		const evaluateRangeOperation = (op) => {
			if (op.type === 'range') {
				return evaluateRange(op, context);
			}
			return null;
		};

		// Direct range operation
		if (operation.type === 'range') {
			return evaluateRangeOperation(operation);
		}

		// Handle operations with operands array
		if (operation.operands) {
			const values = operation.operands.map((operand) => {
				// Check for range operation within operand
				const rangeResult = evaluateRangeOperation(operand);
				if (rangeResult !== null) {
					return rangeResult;
				}

				// Otherwise evaluate normally
				const value = evaluateOperand(operand, context);
				return typeof value === 'boolean' ? (value ? 1 : 0) : value;
			});

			switch (operation.operator) {
				case '+':
					return values.reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
				case '&&':
					return values.every((val) => val === 1) ? 1 : 0;
				case '||':
					return values.some((val) => val === 1) ? 1 : 0;
				default:
					console.error('Unsupported operator for operands array:', operation.operator);
					return 0;
			}
		}

		// Handle standard operation with left/right operands
		if (operation.left_operand || operation.right_operand) {
			// Check for range in left operand
			let leftValue;
			if (operation.left_operand) {
				const leftRangeResult = evaluateRangeOperation(operation.left_operand);
				if (leftRangeResult !== null) {
					leftValue = leftRangeResult;
				} else {
					leftValue = evaluateOperand(operation.left_operand, context);
				}
			}

			// Check for range in right operand
			let rightValue;
			if (operation.right_operand) {
				const rightRangeResult = evaluateRangeOperation(operation.right_operand);
				if (rightRangeResult !== null) {
					rightValue = rightRangeResult;
				} else {
					rightValue = evaluateOperand(operation.right_operand, context);
				}
			}

			// Convert boolean values to numbers
			if (typeof leftValue === 'boolean') leftValue = leftValue ? 1 : 0;
			if (typeof rightValue === 'boolean') rightValue = rightValue ? 1 : 0;

			// Handle count_range with thresholds
			if (operation.operator === 'count_range' && operation.thresholds) {
				return evaluateThresholds(leftValue, operation.thresholds);
			}

			console.log('Operation details:');
			console.log('Evaluating operation:', operation.operator);
			console.log('left_operand:', operation.left_operand);
			console.log('leftValue:', leftValue);
			console.log('right_operand:', operation.right_operand);
			console.log('rightValue:', rightValue);

			switch (operation.operator) {
				case '&&':
					return leftValue && rightValue ? 1 : 0;
				case '||':
					return leftValue || rightValue ? 1 : 0;
				case '==':
					return leftValue === rightValue ? 1 : 0;
				case '!=':
					return leftValue !== rightValue ? 1 : 0;
				case '>':
					return leftValue > rightValue ? 1 : 0;
				case '<':
					return leftValue < rightValue ? 1 : 0;
				case '>=':
					return leftValue >= rightValue ? 1 : 0;
				case '<=':
					return leftValue <= rightValue ? 1 : 0;
				case '+':
					return Number(leftValue) + Number(rightValue);
				case '/':
					if (rightValue === 0) {
						console.error('Division by zero error');
						return null;
					}
					return leftValue / rightValue;
				default:
					console.error('Unknown operator:', operation.operator, 'for:', operation);
					return null;
			}
		}

		console.error('Invalid operation structure:', operation);
		return null;
	} catch (error) {
		console.error('Error in evaluateOperation:', error, 'for:', operation);
		return null;
	}
}

/**
 * Evaluate operand
 */
function evaluateOperand(operand, context) {
	try {
		if (!operand) {
			console.error('No operand provided');
			return null;
		}

		// Handle direct values
		if (typeof operand === 'number' || typeof operand === 'boolean') {
			return operand;
		}

		// Handle nested operation
		if (operand.operation) {
			return evaluateOperation(operand.operation, context);
		}

		// Handle operation as operand
		if (operand.operator || operand.type === 'range') {
			return evaluateOperation(operand, context);
		}

		switch (operand.type) {
			case 'question':
				return getResponse(operand.question_id || operand.value, operand.test_code, context);
			case 'variable':
				console.log('variable ref');
				console.log(operand);
				console.log(context);
				return context[operand.name || operand.value];
			case 'criterion':
				return context[operand.id || operand.value];
			case 'constant':
			case 'numerical':
				return operand.value;
			case 'range':
				return evaluateRange(operand, context);
			default:
				console.error('Unknown operand type:', operand.type, 'for:', operand);
				return null;
		}
	} catch (error) {
		console.error('Error in evaluateOperand:', error, 'for:', operand);
		return null;
	}
}

/**
 * Get response value
 */
/**
 * Get responses for a test code
 */
function getTestResponses(testCode, context) {
	if (testCode) {
		if (!context._otherTestResponses || !context._otherTestResponses[testCode]) {
			console.error(`No responses found for test_code '${testCode}'`);
			return null;
		}
		return context._otherTestResponses[testCode];
	}

	if (!context._responses) {
		console.error('No responses in context');
		return null;
	}
	return context._responses;
}

/**
 * Get response value
 */
function getResponse(questionId, testCode, context) {
	const responses = getTestResponses(testCode, context);
	if (!responses) return 0;
	console.log('quesionId:');
	console.log(questionId);

	// Handle dot notation in questionId (e.g., "a.b" should access responses.a.b)
	if (questionId && questionId.includes('.')) {
		const parts = questionId.split('.');
		let value = responses;

		// Traverse the object using the parts
		for (const part of parts) {
			if (value && typeof value === 'object' && part in value) {
				value = value[part];
			} else {
				return 0; // Return 0 if path doesn't exist
			}
		}
		console.log('valueObject:');
		return value || 0;
	}

	return responses[questionId] || responses.questionId || 0;
}

/**
 * Evaluate range
 */
function evaluateRange(range, context) {
	try {
		if (!range || !range.start || !range.end) {
			console.error('Invalid range structure:', range);
			return 0;
		}

		const responses = getTestResponses(range.test_code, context);
		if (!responses) return 0;

		const startNum = parseInt(range.start.replace('q', ''));
		const endNum = parseInt(range.end.replace('q', ''));

		if (isNaN(startNum) || isNaN(endNum)) {
			console.error('Invalid question numbers in range:', { start: range.start, end: range.end });
			return 0;
		}

		let result;
		switch (range.operator) {
			case 'count_all': {
				// Sum all answer values
				let sum = 0;
				for (let i = startNum; i <= endNum; i++) {
					const value = Number(responses[`q${i}`]) || 0;
					sum += value;
				}
				result = sum;
				break;
			}
			case 'count_range': {
				// Count total number of questions in range
				result = endNum - startNum + 1;
				break;
			}
			default: {
				// Default to count_positive
				let count = 0;
				for (let i = startNum; i <= endNum; i++) {
					const value = responses[`q${i}`] || 0;
					if (value > 0) count++;
				}
				result = count;
			}
		}

		return result;
	} catch (error) {
		console.error('Error in evaluateRange:', error, 'for:', range);
		return 0;
	}
}

/**
 * Evaluate thresholds
 */
function evaluateThresholds(value, thresholds) {
	for (const threshold of thresholds) {
		if (threshold.default) return threshold.value;
		if (threshold.min && value < threshold.min) continue;
		if (threshold.max && value > threshold.max) continue;
		return threshold.value;
	}
	return null;
}

/**
 * Format test result
 */
export function formatTestResult(evaluatedResults) {
	try {
		if (!evaluatedResults) {
			console.error('No evaluated results to format');
			return null;
		}

		return {
			variables: formatSection(evaluatedResults.variables),
			criteria: formatSection(evaluatedResults.criteria),
			outcomes: formatOutcomes(evaluatedResults.outcomes)
		};
	} catch (error) {
		console.error('Error formatting test result:', error);
		return null;
	}
}

/**
 * Format section
 */
function formatSection(section) {
	if (!section) return {};

	return Object.entries(section).reduce((acc, [key, value]) => {
		acc[key] = {
			value,
			formatted: formatValue(value)
		};
		return acc;
	}, {});
}

/**
 * Format outcomes
 */
function formatOutcomes(outcomes) {
	if (!outcomes) return {};

	return Object.entries(outcomes).reduce((acc, [key, outcome]) => {
		if (!outcome) {
			acc[key] = { value: null, formatted: 'Not Available' };
			return acc;
		}

		acc[key] = {
			value: outcome.value,
			formatted: formatValue(outcome.value),
			report_sections: outcome.report_sections
		};
		return acc;
	}, {});
}

/**
 * Evaluate report section
 */
function evaluateReportSection(section, context) {
	try {
		// Start with basic section properties
		const evaluatedSection = { ...section };

		// If section has operation, evaluate it
		if (section.operation) {
			evaluatedSection.operation_result =
				evaluateOperation(section.operation, context) === 1 ? 1 : 0;
		}

		// Evaluate bullet points if present
		if (section.bullet_points) {
			evaluatedSection.bullet_points = section.bullet_points.map((point) => {
				const evaluatedPoint = {
					text: point.text,
					text_after: point.text_after,
					continued: point.continued,
					addPeriod: point.addPeriod,
					summary: point.summary
				};

				// Evaluate point operation if exists
				if (point.operation) {
					evaluatedPoint.operation_result =
						evaluateOperation(point.operation, context) === 1 ? 1 : 0;
				}

				// Evaluate nested operations in text if present
				if (point.text_operations) {
					evaluatedPoint.text_operations = point.text_operations.map((op) => ({
						...op,
						operation_result: evaluateOperation(op.operation, context) === 1 ? 1 : 0
					}));
				}

				// Evaluate single_word within bullet point if present
				if (point.single_word) {
					evaluatedPoint.single_word = point.single_word.map((word) => {
						const evaluatedWord = { ...word };
						if (word.operation) {
							evaluatedWord.operation_result =
								evaluateOperation(word.operation, context) === 1 ? 1 : 0;
						}
						// Handle nested operations in word
						if (word.nested_operations) {
							evaluatedWord.nested_operations = word.nested_operations.map((op) => ({
								...op,
								operation_result: evaluateOperation(op.operation, context) === 1 ? 1 : 0
							}));
						}
						return evaluatedWord;
					});
				}

				return evaluatedPoint;
			});
		}

		// Evaluate single_word if present at section level
		if (section.single_word) {
			evaluatedSection.single_word = section.single_word.map((word) => {
				const evaluatedWord = { ...word };
				if (word.operation) {
					evaluatedWord.operation_result = evaluateOperation(word.operation, context) === 1 ? 1 : 0;
				}
				// Handle nested operations in word
				if (word.nested_operations) {
					evaluatedWord.nested_operations = word.nested_operations.map((op) => ({
						...op,
						operation_result: evaluateOperation(op.operation, context) === 1 ? 1 : 0
					}));
				}
				return evaluatedWord;
			});
		}

		return evaluatedSection;
	} catch (error) {
		console.error('Error evaluating report section:', error);
		return null;
	}
}

/**
 * Format value
 */
function formatValue(value) {
	if (typeof value === 'boolean') {
		return value ? 'Yes' : 'No';
	}
	if (typeof value === 'number') {
		return value.toString();
	}
	if (value === null || value === undefined) {
		return 'Not Available';
	}
	return value.toString();
}
