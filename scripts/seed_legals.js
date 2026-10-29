import { Legal, PrivacyOfficer, ActiveJurisdiction } from '../src/lib/database/schemas.js';
import { connectToDatabase } from '../src/lib/database/connection.js';
import { seedLegalDocs } from '../src/lib/database/init/legalSeed.js';

async function seedLegals() {
	try {
		await connectToDatabase();
		console.log('Seeding legal documents…');

		await seedLegalDocs();

		const [legalCount, poCount, ajCount] = await Promise.all([
			Legal.countDocuments(),
			PrivacyOfficer.countDocuments(),
			ActiveJurisdiction.countDocuments()
		]);
		console.log(
			`Done. legal: ${legalCount} doc(s); privacy_officer: ${poCount} doc; active_jurisdiction: ${ajCount} doc.`
		);
		process.exit(0);
	} catch (error) {
		console.error('Seed failed:', error);
		process.exit(1);
	}
}

seedLegals();
