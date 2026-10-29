import PDFDocument from 'pdfkit';

// PDFKit's standard-font encoder emits a tab as a single hex digit, shifting
// the bytes that follow it. Expand pasted tabs only at the rendering boundary.
function pdfText(value) {
	return typeof value === 'string' ? value.replace(/\t/g, '    ') : value;
}

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
	return content;
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
		// Filter out keys that are not valid JavaScript identifiers (e.g. containing hyphens)
		const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

		const validContextEntries = Object.entries(context).filter(([key]) =>
			validIdentifierRegex.test(key)
		);

		const contextKeys = validContextEntries.map(([key]) => key);
		const contextValues = validContextEntries.map(([, value]) => value);

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
	// First ensure text is a string
	const textStr = getEnglishText(text);
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

	if (validItems.length === 1)
		return replaceVariables(getEnglishText(validItems[0].text), patientInfo, variables);

	if (validItems.length === 2) {
		return `${replaceVariables(getEnglishText(validItems[0].text), patientInfo, variables)} ${conjunction} ${replaceVariables(getEnglishText(validItems[1].text), patientInfo, variables)}`;
	}

	return validItems
		.map((item, index) => {
			const replacedText = replaceVariables(getEnglishText(item.text), patientInfo, variables);
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
	return validItem ? replaceVariables(getEnglishText(validItem.text), patientInfo, variables) : '';
}

/**
 * Process table section in PDF
 */
function processTable(doc, section) {
	const margins = doc.page.margins;
	const pageWidth = doc.page.width - margins.left - margins.right;
	const colWidth = pageWidth / 2;

	// Save starting position
	// const startY = doc.y;

	// Draw table headers
	if (section.headers) {
		// Draw header background
		doc
			.fillColor(section.style?.headerBackground || '#D3D3D3')
			.rect(margins.left, doc.y, pageWidth, 25)
			.fill()
			.fillColor('black');

		// Draw header text
		doc.font('Helvetica-Bold');
		section.headers.forEach((header, i) => {
			const x = margins.left + i * colWidth;
			const align = i === 0 ? 'right' : 'left';
			const padding = i === 0 ? -10 : 10; // Padding for alignment
			const y = i === 0 ? doc.y + 5 : doc.y - 12;
			doc.text(pdfText(header), x + padding, y, {
				width: colWidth,
				align: align
			});
		});
		doc.moveDown();
	}

	// Draw rows
	doc.font('Helvetica');
	section.rows.forEach((row, rowIndex) => {
		// Save row start position
		const rowStartY = doc.y;

		// Draw row background for alternating rows
		if (rowIndex % 2 === 1 && section.style?.alternateRowColor) {
			doc
				.fillColor(section.style.alternateRowColor)
				.rect(margins.left, doc.y, pageWidth, 25)
				.fill()
				.fillColor('black');
		}

		// Calculate text heights to determine row height
		const charHeight = doc.heightOfString(pdfText(row.characteristic), {
			width: colWidth - 20,
			align: 'right'
		});
		const impHeight = doc.heightOfString(pdfText(row.importance), {
			width: colWidth - 20,
			align: 'left'
		});
		const rowHeight = Math.max(charHeight, impHeight, 25);

		// Draw cell text
		doc.text(pdfText(row.characteristic), margins.left - 10, doc.y + 5, {
			width: colWidth,
			align: 'right'
		});
		doc.text(pdfText(row.importance), margins.left + colWidth + 10, rowStartY + 5, {
			width: colWidth,
			align: 'left'
		});

		// Draw cell borders
		doc
			.strokeColor('#000000')
			.lineWidth(0.5)
			.moveTo(margins.left, rowStartY)
			.lineTo(margins.left + pageWidth, rowStartY)
			.stroke();

		// Move to next row
		doc.y = rowStartY + rowHeight;
	});

	// Draw bottom border
	doc
		.strokeColor('#000000')
		.lineWidth(0.5)
		.moveTo(margins.left, doc.y)
		.lineTo(margins.left + pageWidth, doc.y)
		.stroke();

	// Draw vertical borders
	// doc.strokeColor('#000000')
	//    .lineWidth(0.5)
	//    .moveTo(margins.left, startY)
	//    .lineTo(margins.left, doc.y)
	//    .moveTo(margins.left + colWidth, startY)
	//    .lineTo(margins.left + colWidth, doc.y)
	//    .moveTo(margins.left + pageWidth, startY)
	//    .lineTo(margins.left + pageWidth, doc.y)
	//    .stroke();

	// Add some spacing after the table
	doc.moveDown(2);

	// Save the current positions
	const finalY = doc.y;
	const defaultX = doc.page.margins.left;

	// Reset document settings after table processing
	doc.font('Helvetica').fillColor('black').strokeColor('black').lineWidth(1);

	// Reset positions to default
	doc.x = defaultX;
	doc.y = finalY;
}

/**
 * Process sections in PDF
 */
function processSections(doc, sections, reportData) {
	let lastSection = null;

	// Extract variables from reportData for replacement
	const variables = reportData.variables || {};
	console.log('processSections - variables object:', variables);
	console.log('processSections - reportData keys:', Object.keys(reportData));

	sections.forEach((section, index) => {
		// Skip if operation_result is 0
		if (section.operation_result === 0) return;

		const nextSection = index + 1 < sections.length ? sections[index + 1] : null;
		const shouldContinue = nextSection && nextSection.continued;

		// Handle continued sections
		if (!section.continued && lastSection) {
			doc.moveDown();
		}

		// Handle different section types
		if (section.type === 'table') {
			console.log('Processing table section:', section);
			processTable(doc, section);
		} else {
			// Set formatting
			doc.font(section.italic ? 'Helvetica-Oblique' : 'Helvetica');
			if (section.bold) {
				doc.font(section.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold');
			}

			let text = '';

			if (section.heading) {
				const headingStr = getEnglishText(section.heading);
				if (headingStr && headingStr.length > 0) {
					doc
						.fontSize(12)
						.text(pdfText(replaceVariables(headingStr, reportData.patientInfo, variables)));
					doc.fontSize(10);
				}
			}
			if (section.text) {
				const textStr = getEnglishText(section.text);
				if (textStr && textStr.length > 0) {
					text = replaceVariables(textStr, reportData.patientInfo, variables);
				}
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
			if (section.bullet_points) {
				const validPoints = section.bullet_points.filter((point) => {
					if (typeof point.operation_result === 'undefined') return true;
					return point.operation_result === 1;
				});

				validPoints.forEach((point) => {
					const bulletText = replaceVariables(
						getEnglishText(point.text),
						reportData.patientInfo,
						variables
					);
					doc.text(
						pdfText(`• ${bulletText}${section.addPeriod ? '.' : ''}${section.addComma ? ',' : ''}`),
						{
							indent: 20
						}
					);
					doc.moveDown();
				});
			}

			// Add period/comma if specified and text exists
			if (text) {
				text = text.trim();
				if (section.addPeriod) text += '.';
				if (section.addComma) text += ',';

				if (shouldContinue) {
					text += ' ';
				}

				// Use alignment if specified, otherwise default behavior
				const textOptions = {
					continued: shouldContinue
				};

				if (section.align) {
					textOptions.align = section.align;
				}

				doc.text(pdfText(text), textOptions);
			}

			// Reset formatting
			doc.font('Helvetica');
		}

		lastSection = section;
	});
}

/**
 * Add header with evenly spaced items
 */
function addHeader(doc, reportData) {
	console.log('Adding header');
	// Add title
	doc
		.fontSize(12)
		.font('Helvetica-Bold')
		.text(pdfText(getEnglishText(reportData.reports[0].report_title)) || 'Diagnostic Report', {
			align: 'center'
		});

	// Calculate positions for three columns (left, center, right)
	const pageWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
	const leftX = doc.page.margins.left;
	const centerX = pageWidth / 2 + 30;
	const rightX = doc.page.width - doc.page.margins.right - 80;

	// Save current Y position
	const currentY = 50;

	// Patient info (left)
	doc
		.fontSize(10)
		.font('Helvetica-Bold')
		.text('Patient: ', leftX, currentY, { continued: true, align: 'left' })
		.font('Helvetica')
		.text(pdfText(`${reportData.patientInfo.firstName} ${reportData.patientInfo.lastName}`), {
			align: 'left'
		});

	// ID (center)
	doc
		.fontSize(10)
		.font('Helvetica-Bold')
		.text('ID: ', centerX, currentY, { continued: true, align: 'left' })
		.font('Helvetica')
		.text(pdfText(reportData.patientInfo.fileMakerId), { align: 'left' });

	// Date (right)
	doc
		.fontSize(10)
		.font('Helvetica-Bold')
		.text('Date: ', rightX, currentY, { continued: true, align: 'left' })
		.font('Helvetica')
		.text(new Date().toLocaleDateString(), { align: 'right' });
	let arrayToString = (array) => {
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
	doc.y = 65;
	let testCompleted = arrayToString(reportData.patientInfo.completedTests);
	doc.x = 50;
	doc
		.fontSize(8)
		.font('Helvetica-Bold')
		.text('Interviews Completed: ', { continued: true, align: 'left' })
		.font('Helvetica')
		.text(pdfText(testCompleted), { align: 'left' });
	function addHorizontalRule(doc, spaceFromEdge = 0, linesAboveAndBelow = 0.5) {
		doc.moveDown(linesAboveAndBelow);

		doc
			.moveTo(0 + spaceFromEdge, doc.y)
			.lineTo(doc.page.width - spaceFromEdge, doc.y)
			.stroke();

		doc.moveDown(linesAboveAndBelow);

		return doc;
	}

	addHorizontalRule(doc, 50, 1);
}

/**
 * Generate PDF from report data
 */
export async function generateJsonBasedPdf(finalReportData) {
	let reportData = finalReportData;
	console.log('Final Report Structure2:');
	if (reportData.reports[0].report_title === 'Special Report') {
		reportData.reports[0].report_title = 'PsyMatch Report';
	}
	console.log(finalReportData.variables);
	return new Promise((resolve, reject) => {
		try {
			// Create a document
			const doc = new PDFDocument({
				size: 'A4',
				margins: {
					top: 150, // Larger top margin for header
					bottom: 30,
					left: 50,
					right: 50
				},
				bufferPages: true, // Enable page buffering
				info: {
					Title: getEnglishText(reportData.reports[0].report_title) || 'PsyMatch Report',
					Author: 'Psymatch'
				}
			});

			// Collect PDF chunks
			const chunks = [];
			doc.on('data', (chunk) => chunks.push(chunk));
			doc.on('end', () => resolve(Buffer.concat(chunks)));

			// Start content at appropriate position

			doc.fontSize(10);

			doc.fontSize(10);

			// Process each report's sections sequentially
			reportData.reports.forEach((report, reportIndex) => {
				if (report.report_sections && report.report_sections.length > 0) {
					// Add spacing between reports except for the first one
					if (reportIndex > 0) {
						doc.moveDown(4);
					}

					// Create report-specific data with its own variables and responses
					const reportSpecificData = {
						...reportData,
						variables: { ...(report.variables || {}), ...(report.responses || {}) }
					};

					if (reportData.summary) {
						// Summary mode - only process summary sections
						const summarySections = report.report_sections.filter(
							(section) => section.summary || section.onlySummary
						);
						if (summarySections.length > 0) {
							processSections(doc, summarySections, reportSpecificData);
						}
					} else {
						// Full report mode - process all sections except onlySummary
						const fullReportSections = report.report_sections.filter(
							(section) => !section.onlySummary
						);
						if (fullReportSections.length > 0) {
							processSections(doc, fullReportSections, reportSpecificData);
						}
					}
				}
			});

			// Get the total number of pages
			const range = doc.bufferedPageRange();

			// Add headers to all pages
			for (let i = range.start; i < range.start + range.count; i++) {
				doc.switchToPage(i);

				// Save current position
				const originalY = doc.y;
				const originalX = doc.x;

				// Add header at top of page
				doc.y = 30;
				doc.x = 50;
				addHeader(doc, reportData);

				// Restore original position
				doc.x = originalX;
				doc.y = originalY;
			}

			// Finalize PDF
			doc.end();
		} catch (error) {
			console.error('Error generating PDF:', error);
			reject(error);
		}
	});
}
