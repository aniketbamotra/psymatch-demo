import { connectToDatabase } from '../connection.js';
import { isDemoDatabaseEmpty, seedDemoData } from './demoSeed.js';
import { DEMO_MODE } from '$lib/demo/mode.js';

/**
 * Initialize the database with required data.
 * In demo mode an empty database is filled with the synthetic demo dataset.
 */
export async function initDatabase() {
	try {
		await connectToDatabase();

		if (DEMO_MODE && (await isDemoDatabaseEmpty())) {
			console.log('Empty demo database, seeding synthetic data...');
			await seedDemoData();
		}
	} catch (error) {
		console.error('Error initializing database:', error);
		throw error;
	}
}
