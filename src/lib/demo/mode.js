import { env } from '$env/dynamic/public';

// This repository is the public interview demo, so demo mode is on unless
// PUBLIC_DEMO_MODE is explicitly set to 'false'. In demo mode the database is
// seeded with synthetic data, emails are not sent, reCAPTCHA is skipped and the
// AI / redaction services are disabled.
export const DEMO_MODE = env.PUBLIC_DEMO_MODE !== 'false';
