import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables for standalone scripts
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

let connection = null;

export async function connectToDatabase() {
	try {
		if (connection) {
			console.log('Using existing database connection');
			return connection;
		}

		if (!MONGODB_URI) {
			throw new Error('MONGODB_URI is not defined in environment variables');
		}

		console.log('Creating new database connection');

		// Production-safe connection options
		const options = {
			useNewUrlParser: true,
			useUnifiedTopology: true,
			serverSelectionTimeoutMS: 5000
		};

		// Add development-only options if not in production
		if (process.env.NODE_ENV !== 'production') {
			console.log('Using development database settings');
			options.tlsAllowInvalidHostnames = true;
			options.tlsAllowInvalidCertificates = true;
		}

		connection = await mongoose.connect(MONGODB_URI, options);
		console.log('Database connected successfully');
		return connection;
	} catch (error) {
		console.error('Database connection error:', error);
		throw error;
	}
}
