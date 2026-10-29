import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	Table,
	TableRow,
	TableCell,
	WidthType,
	BorderStyle,
	AlignmentType,
	Header,
	Footer,
	PageBreak
} from 'docx';

/**
 * Get pronouns based on gender
 */
function getPronouns(gender) {
	console.log('Getting pronouns for gender:', gender);
	const pronounMap = {
		He: { subject: 'he', possessive: 'his' },
		She: { subject: 'she', possessive: 'her' },
		They: { subject: 'they', possessive: 'their' },
		Ze: { subject: 'ze', possessive: 'zir' }
	};
	return pronounMap[gender] || pronounMap['They']; // Default to they/their if gender not found
}

/**
 * Helper to force English text from multilingual objects
 */
function getEnglishText(content) {
	if (!content) return '';
	if (typeof content === 'object') {
		return content.en || '';
	}
	return String(content);
}

/**
 * Check if a string contains JavaScript expression syntax
 */
function isExpression(str) {
	// Check for operators and method calls that indicate JavaScript expressions
	return /[?:==!=><&|()]|\.charAt|\.slice|\.toUpperCase|\.toLowerCase|\.trim|\.substring|\.concat|\.repeat|\.startsWith|\.endsWith|\.includes|\.toLocaleUpperCase|\.toLocaleLowerCase|Math\./i.test(
		str
	);
}

/**
 * Safely evaluate a JavaScript expression with given context
 */
function evaluateExpression(expr, context) {
	try {
		// Validate expression length
		if (expr.length > 500) {
			console.error('Expression too long (max 500 characters):', expr);
			return undefined;
		}

		// Check for dangerous patterns
		const dangerousPatterns =
			/\bprocess\b|\beval\b|\bFunction\b|\brequire\b|\bimport\b|\bwhile\b|\bfor\b/i;
		if (dangerousPatterns.test(expr)) {
			console.error('Forbidden operation in expression:', expr);
			return undefined;
		}

		// Create function with context variables as parameters
		const contextKeys = Object.keys(context);
		const contextValues = Object.values(context);

		// Wrap in try-catch for runtime errors
		const funcBody = `
            try {
                return ${expr};
            } catch (e) {
                console.error('Expression evaluation error:', e.message);
                return undefined;
            }
        `;

		const func = new Function(...contextKeys, funcBody);
		const result = func(...contextValues);

		// Validate result
		if (result === null || result === undefined) {
			return '';
		}

		// Check for invalid numeric results
		if (typeof result === 'number' && !isFinite(result)) {
			console.error('Invalid numeric result:', result);
			return '';
		}

		return result;
	} catch (error) {
		console.error('Error evaluating expression:', expr, error);
		return undefined;
	}
}

/**
 * Replace variables in text with actual values
 * Supports both simple placeholders and JavaScript expressions
 */
function replaceVariables(text, patientInfo, variables = {}) {
	if (!text) return text;

	// Safely extract string from multilingual object
	const textStr = getEnglishText(text);
	if (!textStr) return '';

	const pronouns = getPronouns(patientInfo.gender);

	// Build context object with all available variables
	const context = {
		first_name: patientInfo.firstName || '',
		pronouns: {
			subject: pronouns.subject,
			possessive: pronouns.possessive
		},
		...variables // Include all variables from report logic (BMI, TotalScore, etc.)
	};

	// Replace all placeholders (both simple and expressions)
	const result = textStr.replace(/\{([^}]+)\}/g, (match, content) => {
		try {
			const trimmedContent = content.trim();

			// Check if it's a JavaScript expression
			if (isExpression(trimmedContent)) {
				const evaluated = evaluateExpression(trimmedContent, context);

				// If evaluation failed, return original placeholder
				if (evaluated === undefined) {
					console.warn('Failed to evaluate expression, keeping original:', match);
					return match;
				}

				return evaluated;
			} else {
				// Simple variable lookup
				// Handle nested properties like "pronouns.subject"
				const value = trimmedContent.split('.').reduce((obj, key) => {
					return obj && obj[key] !== undefined ? obj[key] : undefined;
				}, context);

				// Return value or empty string if not found
				return value !== undefined && value !== null ? value.toString() : '';
			}
		} catch (error) {
			console.error('Error replacing placeholder:', match, error);
			return match; // Return original on error
		}
	});

	return result;
}

/**
 * Process multi_words array into a string
 */
function processMultiWords(multiWords, conjunction = 'and', patientInfo = {}, variables = {}) {
	if (!multiWords || !Array.isArray(multiWords)) return '';

	const validItems = multiWords.filter((item) => {
		// If operation_result is not present, treat as 1
		if (typeof item.operation_result === 'undefined') return true;
		return item.operation_result === 1;
	});

	if (validItems.length === 0) return '';

	if (validItems.length === 1) return replaceVariables(validItems[0].text, patientInfo, variables);

	if (validItems.length === 2) {
		return `${replaceVariables(validItems[0].text, patientInfo, variables)} ${conjunction} ${replaceVariables(validItems[1].text, patientInfo, variables)}`;
	}

	return validItems
		.map((item, index) => {
			const replacedText = replaceVariables(item.text, patientInfo, variables);
			if (index === validItems.length - 1) {
				return `${conjunction} ${replacedText}`;
			}
			return replacedText;
		})
		.join(', ');
}

/**
 * Process single_word array to get the first item with operation_result=1
 */
function processSingleWord(singleWord, patientInfo = {}, variables = {}) {
	if (!singleWord || !Array.isArray(singleWord)) return '';

	const validItem = singleWord.find((item) => {
		// If operation_result is not present, treat as 1
		if (typeof item.operation_result === 'undefined') return true;
		return item.operation_result === 1;
	});
	return validItem ? replaceVariables(validItem.text, patientInfo, variables) : '';
}

/**
 * Process table section in DOCX
 */
function processTable(section) {
	const rows = [];

	// Header row
	if (section.headers) {
		const headerCells = section.headers.map((header, i) => {
			return new TableCell({
				children: [
					new Paragraph({
						children: [
							new TextRun({
								text: getEnglishText(header),
								bold: true,
								size: 24, // 12pt
								font: 'Arial'
							})
						],
						alignment: i === 0 ? AlignmentType.RIGHT : AlignmentType.LEFT
					})
				],
				shading: {
					fill: section.style?.headerBackground
						? section.style.headerBackground.replace('#', '')
						: 'D3D3D3'
				},
				width: {
					size: 5233,
					type: WidthType.DXA
				},
				margins: {
					top: 100,
					bottom: 100,
					left: 100,
					right: 100
				}
			});
		});
		rows.push(new TableRow({ children: headerCells }));
	}

	// Data rows
	section.rows.forEach((row, rowIndex) => {
		const isAlternate = rowIndex % 2 === 1;
		const shading =
			isAlternate && section.style?.alternateRowColor
				? { fill: section.style.alternateRowColor.replace('#', '') }
				: undefined;

		const cells = [
			new TableCell({
				children: [
					new Paragraph({
						children: [new TextRun({ text: getEnglishText(row.characteristic), size: 22 })], // 11pt
						alignment: AlignmentType.RIGHT
					})
				],
				shading: shading,
				width: {
					size: 5233,
					type: WidthType.DXA
				},
				margins: {
					top: 100,
					bottom: 100,
					left: 100,
					right: 100
				}
			}),
			new TableCell({
				children: [
					new Paragraph({
						children: [new TextRun({ text: getEnglishText(row.importance), size: 22 })], // 11pt
						alignment: AlignmentType.LEFT
					})
				],
				shading: shading,
				width: {
					size: 5233,
					type: WidthType.DXA
				},
				margins: {
					top: 100,
					bottom: 100,
					left: 100,
					right: 100
				}
			})
		];
		rows.push(new TableRow({ children: cells }));
	});

	return new Table({
		rows: rows,
		width: {
			size: 10466,
			type: WidthType.DXA
		},
		columnWidths: [5233, 5233],
		borders: {
			top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
			bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
			left: { style: BorderStyle.NONE },
			right: { style: BorderStyle.NONE },
			insideVertical: { style: BorderStyle.NONE },
			insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
		}
	});
}

/**
 * Process sections in DOCX
 */
function processSections(sections, reportData) {
	const docxChildren = [];
	const variables = reportData.variables || {};

	sections.forEach((section, index) => {
		// Skip if operation_result is 0
		if (section.operation_result === 0) return;

		// Handle different section types
		if (section.type === 'table') {
			docxChildren.push(processTable(section));
			docxChildren.push(new Paragraph({ text: '' })); // Spacing
		} else {
			let text = '';

			if (section.heading && section.heading.length > 0) {
				const headingText = replaceVariables(section.heading, reportData.patientInfo, variables);
				docxChildren.push(
					new Paragraph({
						children: [
							new TextRun({
								text: headingText,
								bold: true,
								size: 24, // 12pt
								font: 'Arial'
							})
						],
						spacing: { before: 400, after: 200 } // Increased spacing for headings
					})
				);
			}

			if (section.text) {
				text = replaceVariables(section.text, reportData.patientInfo, variables);
			}
			if (section.multi_words && section.multi_words.length > 0) {
				text = processMultiWords(
					section.multi_words,
					section.conjunction,
					reportData.patientInfo,
					variables
				);
			}
			if (section.single_word && section.single_word.length > 0) {
				text = processSingleWord(section.single_word, reportData.patientInfo, variables);
			}

			// Add period/comma if specified and text exists
			if (
				text ||
				(section.text === '' && !section.heading && !section.multi_words && !section.single_word)
			) {
				if (text) {
					text = text.trim();
					if (section.addPeriod) text += '.';
					if (section.addComma) text += ',';
				}

				const textRun = new TextRun({
					text: text,
					bold: section.bold,
					italics: section.italic,
					size: 22 // 11pt
				});

				// Check if we should continue from previous paragraph (not easily doable in DOCX structure without more complex logic,
				// so we'll just add as new paragraph for now, or append to previous if we were tracking it.
				// For simplicity in this first pass, we'll make each section a paragraph unless it's explicitly continued content which is tricky.)
				// Actually, the PDF logic uses `continued: true`. In DOCX, we'd need to accumulate runs into a single paragraph.
				// Let's try to handle simple accumulation if the previous element was a paragraph and we want to continue.

				// For now, just add as a paragraph.
				docxChildren.push(
					new Paragraph({
						children: [textRun],
						alignment:
							section.align === 'center'
								? AlignmentType.CENTER
								: section.align === 'right'
									? AlignmentType.RIGHT
									: AlignmentType.LEFT,
						spacing: { after: 240 } // Increased spacing between paragraphs (12pt)
					})
				);
			}

			if (section.bullet_points) {
				const validPoints = section.bullet_points.filter((point) => {
					if (typeof point.operation_result === 'undefined') return true;
					return point.operation_result === 1;
				});

				validPoints.forEach((point) => {
					const bulletText = replaceVariables(point.text, reportData.patientInfo, variables);
					docxChildren.push(
						new Paragraph({
							children: [
								new TextRun({
									text: `${bulletText}${section.addPeriod ? '.' : ''}${section.addComma ? ',' : ''}`,
									size: 22 // 11pt
								})
							],
							bullet: {
								level: 0
							}
						})
					);
				});
				// Add spacing after list
				if (validPoints.length > 0) {
					docxChildren.push(new Paragraph({ text: '' }));
				}
			}
		}
	});

	return docxChildren;
}

/**
 * Create header for DOCX
 */
function createHeader(reportData) {
	const patientName = `${reportData.patientInfo.firstName} ${reportData.patientInfo.lastName}`;
	const fileMakerId = reportData.patientInfo.fileMakerId || '';
	const dateStr = new Date().toLocaleDateString();

	let arrayToString = (array) => {
		if (!array) return '';
		let str = '';
		array.forEach((element, index) => {
			str += getEnglishText(element);
			if (index < array.length - 2) {
				str += ', ';
			} else if (index < array.length - 1) {
				str += ' and ';
			}
		});
		return str;
	};
	const completedTests = arrayToString(reportData.patientInfo.completedTests);

	return new Header({
		children: [
			new Paragraph({
				children: [
					new TextRun({
						text: getEnglishText(reportData.reports[0].report_title) || 'PsyMatch Report',
						bold: true,
						size: 26, // 13pt
						font: 'Times New Roman'
					})
				],
				alignment: AlignmentType.CENTER,
				spacing: { after: 200 }
			}),
			// We can use a table for the 3-column layout of Patient/ID/Date
			new Table({
				rows: [
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({ text: 'Patient: ', bold: true }),
											new TextRun({ text: patientName })
										]
									})
								],
								borders: {
									top: { style: BorderStyle.NONE },
									bottom: { style: BorderStyle.NONE },
									left: { style: BorderStyle.NONE },
									right: { style: BorderStyle.NONE }
								},
								width: { size: 3489, type: WidthType.DXA }
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({ text: 'ID: ', bold: true }),
											new TextRun({ text: fileMakerId })
										]
									})
								],
								borders: {
									top: { style: BorderStyle.NONE },
									bottom: { style: BorderStyle.NONE },
									left: { style: BorderStyle.NONE },
									right: { style: BorderStyle.NONE }
								},
								width: { size: 3489, type: WidthType.DXA }
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({ text: 'Date: ', bold: true }),
											new TextRun({ text: dateStr })
										],
										alignment: AlignmentType.RIGHT
									})
								],
								borders: {
									top: { style: BorderStyle.NONE },
									bottom: { style: BorderStyle.NONE },
									left: { style: BorderStyle.NONE },
									right: { style: BorderStyle.NONE }
								},
								width: { size: 3488, type: WidthType.DXA }
							})
						]
					})
				],
				width: { size: 10466, type: WidthType.DXA },
				columnWidths: [3489, 3489, 3488],
				borders: {
					top: { style: BorderStyle.NONE },
					bottom: { style: BorderStyle.NONE },
					left: { style: BorderStyle.NONE },
					right: { style: BorderStyle.NONE },
					insideVertical: { style: BorderStyle.NONE }
				}
			}),
			new Paragraph({
				children: [
					new TextRun({ text: 'Interviews Completed: ', bold: true, size: 18 }), // 9pt
					new TextRun({ text: completedTests, size: 18 }) // 9pt
				],
				spacing: { before: 100, after: 100 }
			}),
			new Paragraph({
				border: {
					bottom: {
						color: 'auto',
						space: 1,
						style: BorderStyle.SINGLE,
						size: 6
					}
				},
				spacing: { after: 200 }
			})
		]
	});
}

/**
 * Generate DOCX from report data
 */
export async function generateJsonBasedDocx(finalReportData) {
	let reportData = finalReportData;
	if (reportData.reports[0].report_title === 'Special Report') {
		reportData.reports[0].report_title = 'PsyMatch Report';
	}

	const sections = [];

	// Process each report's sections sequentially
	reportData.reports.forEach((report, reportIndex) => {
		if (report.report_sections && report.report_sections.length > 0) {
			// Add spacing between reports instead of page break
			if (reportIndex > 0) {
				sections.push(
					new Paragraph({
						children: [new TextRun({ text: '', size: 24 })], // Empty line
						spacing: { before: 400, after: 400 },
						border: {
							top: {
								color: 'auto',
								space: 1,
								style: BorderStyle.SINGLE,
								size: 6
							}
						}
					})
				);
			}

			// Create report-specific data with its own variables and responses
			const reportSpecificData = {
				...reportData,
				variables: { ...(report.variables || {}), ...(report.responses || {}) }
			};

			let reportSections = [];
			if (reportData.summary) {
				// Summary mode - only process summary sections
				const summarySections = report.report_sections.filter(
					(section) => section.summary || section.onlySummary
				);
				if (summarySections.length > 0) {
					reportSections = processSections(summarySections, reportSpecificData);
				}
			} else {
				// Full report mode - process all sections except onlySummary
				const fullReportSections = report.report_sections.filter((section) => !section.onlySummary);
				if (fullReportSections.length > 0) {
					reportSections = processSections(fullReportSections, reportSpecificData);
				}
			}

			sections.push(...reportSections);
		}
	});

	const doc = new Document({
		sections: [
			{
				properties: {
					page: {
						size: {
							orientation: 'portrait',
							width: 11906, // A4 width in twips
							height: 16838 // A4 height in twips
						},
						margin: {
							top: 720, // 0.5 inch
							right: 720,
							bottom: 720,
							left: 720
						}
					}
				},
				headers: {
					default: createHeader(reportData)
				},
				children: sections
			}
		]
	});

	return await Packer.toBuffer(doc);
}
