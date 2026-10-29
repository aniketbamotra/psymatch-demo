# PsyMatch (demo)

A demo deployment of PsyMatch, a clinical-intake platform: clinic staff register
patients and assign diagnostic interviews, patients complete them online (with
voiceovers, EN/FR), and staff generate algorithmic DSM-5 reports from the answers.

**Everything in this deployment is synthetic.** No real patients, clinic staff or
clinical data are included.

Stack: SvelteKit 2 (Svelte 4) on Vercel, MongoDB via Mongoose, Tailwind, PDFKit / docx.

## Demo accounts

All accounts use the password `PsyMatchDemo!`. The login page also has
one-click buttons for them.

| Role | Email | What you'll see |
| --- | --- | --- |
| Clinic director | `director@example.com` | Dashboard, patient records, interview sets, legal admin |
| Clinic staff | `staff@example.com` | Dashboard and patient records |
| Patient | `patient@example.com` | Terms of service, then three unstarted interviews |

The dashboard has eight fictional patients at different stages: newly
invited, part-way through, finished, and inactive.

## What demo mode changes

Demo mode is on by default (set `PUBLIC_DEMO_MODE=false` to turn it off):

- **Data:** on the first request, an empty database is seeded from
  `src/lib/demo/demo-data.json` and the interview/scoring JSON files in
  `src/lib/database/init/`.
- **Email** is never sent. When staff create a patient, the account-setup link
  is shown in the popup instead.
- **reCAPTCHA** is skipped.
- **AI reports and redaction** are disabled, because they depend on AWS and a separate
  agent service. Algorithmic (rule-based) reports still work.

## Running it

```bash
npm install
cp .env.example .env   # set MONGODB_URI to an empty database
npm run dev
```

The first request seeds the database.

### Resetting the demo

```bash
npm run demo:reset     # wipes the database and reloads the demo data
```

### Editing the demo data

Patients, assignments and notes live in `src/lib/demo/demo-data.json`.
Completed interviews store their answers in the same file. To regenerate the
answers after changing a patient's interviews or profiles, run:

```bash
npm run demo:answers   # searches for answers that produce a real report outcome
npm run demo:reset
```

## Deploying to Vercel

1. Import the GitHub repository in Vercel. The framework (SvelteKit) is detected
   automatically.
2. Add one environment variable, `MONGODB_URI`, pointing at an empty MongoDB
   database. In MongoDB Atlas, allow network access from `0.0.0.0/0`.
3. Deploy. The first page load seeds the database.

## Known limitations

- Only 7 of the production interviews are included (depression, persistent
  depressive, manic, generalized anxiety, panic, social anxiety, sleep). French
  text falls back to English for interview content.
- The depression interview's scoring rules in this repository are an older
  version, so its section is left out of the algorithmic report.
