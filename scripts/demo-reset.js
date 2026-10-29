// Wipe the demo database and reload the synthetic dataset.
// Usage: `npm run demo:reset` (reads MONGODB_URI from .env)
//
// Runs under vite-node so the seed can use the same JSON imports and $lib
// aliases as the app.
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/database/connection.js';
import { seedDemoData } from '../src/lib/database/init/demoSeed.js';

try {
	await connectToDatabase();
	await seedDemoData({ reset: true });
} catch (error) {
	console.error('Demo reset failed:', error);
	process.exitCode = 1;
} finally {
	await mongoose.disconnect();
}
