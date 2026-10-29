import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import { DEMO_MODE } from '$lib/demo/mode.js';

/**
 * Mail transport for transactional email.
 * In demo mode messages are rendered but never leave the server: nodemailer's
 * JSON transport returns them, and we log who they would have gone to.
 */
export function createMailTransport() {
	if (DEMO_MODE) {
		const transport = nodemailer.createTransport({ jsonTransport: true });
		const sendMail = transport.sendMail.bind(transport);
		transport.sendMail = async (mailOptions) => {
			const info = await sendMail(mailOptions);
			console.log(`[demo] Email not sent: "${mailOptions.subject}" to ${info.envelope.to}`);
			return info;
		};
		return transport;
	}

	// AWS SES over SMTP
	const transport = nodemailer.createTransport({
		host: `email-smtp.${env.AWS_REGION}.amazonaws.com`,
		port: 587,
		secure: false, // true for 465, false for other ports
		auth: {
			user: env.AWS_SES_USER,
			pass: env.AWS_SES_PASSWORD
		}
	});

	transport.verify((error) => {
		if (error) console.error('SMTP connection error:', error);
	});
	return transport;
}

/**
 * Base URL for links in emails. Falls back to the current request's origin so
 * a fresh deployment works without SITE_URL configured.
 */
export function siteUrl(request) {
	return env.SITE_URL || new URL(request.url).origin;
}
