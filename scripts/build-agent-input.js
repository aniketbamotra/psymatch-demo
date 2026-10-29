#!/usr/bin/env node
/**
 * Build the psymatch.agent_input.v1 JSON for a given patient by pulling
 * everything from the live Mongo DB this Vercel app already connects to.
 *
 * Usage:
 *   node scripts/build-agent-input.js <patientId> [--out <path>]
 *
 * If --out is omitted, the JSON is printed to stdout.
 *
 * Loads MONGODB_URI from .env (same as the rest of the repo).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';

import { connectToDatabase } from '../src/lib/database/connection.js';
import { buildAgentInput } from '../src/lib/server/agentInput/index.js';

function parseArgs(argv) {
	const args = { patientId: null, out: null };
	const rest = argv.slice(2);
	for (let i = 0; i < rest.length; i++) {
		const v = rest[i];
		if (v === '--out' || v === '-o') {
			args.out = rest[++i];
		} else if (v.startsWith('-')) {
			throw new Error(`Unknown flag: ${v}`);
		} else if (!args.patientId) {
			args.patientId = v;
		}
	}
	return args;
}

async function main() {
	const { patientId, out } = parseArgs(process.argv);
	if (!patientId) {
		console.error('Usage: node scripts/build-agent-input.js <patientId> [--out <path>]');
		process.exitCode = 2;
		return;
	}

	console.error(`[build-agent-input] patientId=${patientId}`);
	await connectToDatabase();

	const payload = await buildAgentInput({ patientId });
	const json = JSON.stringify(payload, null, 2);

	if (out) {
		const abs = resolve(process.cwd(), out);
		writeFileSync(abs, json + '\n', 'utf8');
		console.error(`[build-agent-input] wrote ${abs}`);
	} else {
		process.stdout.write(json + '\n');
	}

	const admin = payload.module_coverage.administered;
	const nadmin = payload.module_coverage.not_administered;
	console.error(`[build-agent-input] administered=${admin.length} not_administered=${nadmin.length}`);
}

main()
	.catch((err) => {
		console.error('[build-agent-input] failed:', err.message);
		console.error(err.stack);
		process.exitCode = 1;
	})
	.finally(async () => {
		try {
			await mongoose.connection.close();
		} catch {
			/* ignore */
		}
	});
