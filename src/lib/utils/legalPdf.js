import PDFDocument from 'pdfkit';
import { marked } from 'marked';

// Render a small set of markdown tokens into a pdfkit document. Supports
// headings (h1–h3), paragraphs, lists (bullet + ordered), bold/italic/code spans,
// and horizontal rules. Anything richer (images, tables, blockquotes) is
// rendered as plain text — legal copy doesn't need more.
function renderTokens(doc, tokens) {
	for (const token of tokens) {
		switch (token.type) {
			case 'heading': {
				const sizes = { 1: 20, 2: 16, 3: 13 };
				doc.moveDown(0.5);
				doc.font('Helvetica-Bold').fontSize(sizes[token.depth] || 12);
				doc.text(renderInline(token.tokens), { paragraphGap: 6 });
				doc.font('Helvetica').fontSize(11);
				break;
			}
			case 'paragraph': {
				doc.font('Helvetica').fontSize(11);
				doc.text(renderInline(token.tokens), { paragraphGap: 6, align: 'left' });
				break;
			}
			case 'list': {
				doc.font('Helvetica').fontSize(11);
				token.items.forEach((item, i) => {
					const marker = token.ordered ? `${(token.start || 1) + i}. ` : '• ';
					doc.text(marker + renderInline(item.tokens || []), {
						indent: 12,
						paragraphGap: 2
					});
				});
				doc.moveDown(0.3);
				break;
			}
			case 'hr': {
				doc.moveDown(0.3);
				doc
					.moveTo(doc.page.margins.left, doc.y)
					.lineTo(doc.page.width - doc.page.margins.right, doc.y)
					.lineWidth(0.5)
					.strokeColor('#cccccc')
					.stroke();
				doc.moveDown(0.5);
				break;
			}
			case 'space':
				doc.moveDown(0.3);
				break;
			default:
				if (token.text) {
					doc.font('Helvetica').fontSize(11).text(token.text, { paragraphGap: 4 });
				}
		}
	}
}

function renderInline(tokens) {
	if (!tokens) return '';
	return tokens
		.map((t) => {
			if (t.type === 'text') return t.text;
			if (t.type === 'strong') return renderInline(t.tokens);
			if (t.type === 'em') return renderInline(t.tokens);
			if (t.type === 'codespan') return t.text;
			if (t.type === 'link') return `${renderInline(t.tokens)} (${t.href})`;
			if (t.type === 'br') return '\n';
			return t.raw || '';
		})
		.join('');
}

function writeSection(doc, heading, markdown) {
	doc.moveDown(0.6);
	doc.font('Helvetica-Bold').fontSize(14).text(heading);
	doc.moveDown(0.3);
	const tokens = marked.lexer(markdown || '');
	renderTokens(doc, tokens);
}

// Render the structured Privacy Officer contact card directly into the PDF
// (no markdown — we control the fields).
function writePrivacyOfficer(doc, heading, po) {
	doc.moveDown(0.6);
	doc.font('Helvetica-Bold').fontSize(14).text(heading);
	doc.moveDown(0.3);
	doc.fontSize(11);
	const rows = [];
	if (po?.name) rows.push(['Name', po.name]);
	if (po?.email) rows.push(['Email', po.email]);
	if (po?.phone) rows.push(['Phone', po.phone]);
	if (po?.mailingAddress) rows.push(['Mailing address', po.mailingAddress]);
	for (const [label, value] of rows) {
		doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
		doc.font('Helvetica').text(value);
	}
	if (rows.length === 0) {
		doc.font('Helvetica-Oblique').fillColor('#666666').text('Not configured.');
		doc.fillColor('#000000');
	}
}

// Render a TOS + Privacy Officer + Jurisdiction footer bundle into an A4 PDF.
// Returns a Promise<Buffer>.
export function generateLegalPdf(bundle, locale, headings) {
	const lang = locale === 'fr' ? 'fr' : 'en';
	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({
				size: 'A4',
				margins: { top: 50, bottom: 50, left: 50, right: 50 },
				bufferPages: true,
				info: {
					Title: 'PsyMatch — Terms of Service',
					Author: 'PsyMatch',
					Subject: 'Terms of Service, Privacy Officer, Jurisdiction notice',
					CreationDate: new Date()
				}
			});

			const chunks = [];
			doc.on('data', (c) => chunks.push(c));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);

			doc.font('Helvetica-Bold').fontSize(22).text(headings.title);
			doc.moveDown(0.3);
			doc.font('Helvetica').fontSize(10).fillColor('#666666');
			doc.text(`Generated ${new Date().toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}`);
			doc.fillColor('#000000');
			doc.moveDown(0.5);

			writeSection(doc, headings.tos, bundle.tos.content[lang]);
			writePrivacyOfficer(doc, headings.privacyOfficer, bundle.privacyOfficer);
			writeSection(doc, headings.jurisdiction, bundle.activeJurisdiction.content[lang]);

			doc.end();
		} catch (err) {
			reject(err);
		}
	});
}
