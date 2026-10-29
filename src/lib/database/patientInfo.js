import { User } from './schemas.js';
import { connectToDatabase } from './connection.js';
import { normalizeLanguage } from '../utils/language.js';

/**
 * Get patient information by user ID
 */
export async function getPatientInfo(userId) {
	try {
		if (!userId) {
			throw new Error('User ID is required');
		}

		// Ensure database connection
		await connectToDatabase();

		const user = await User.findById(userId).lean();

		if (!user) {
			console.log('No patient found with ID:', userId);
			return null;
		}

		// Format patient info
		const patientInfo = {
			id: user._id,
			firstName: user.fullName?.split(' ')[0] || user.fullName || 'Unknown',
			lastName: user.fullName?.split(' ').slice(1).join(' ') || '',
			gender: user.gender || 'Not specified',
			email: user.email || 'Not provided',
			phone: user.patientProfile?.phoneNumber || 'Not provided',
			preferredCommunication: user.patientProfile?.preferredCommunication || 'Not specified',
			preferredLanguage: normalizeLanguage(user.patientProfile?.preferredLanguage),
			intakeNote: user.patientProfile?.intakeNote || '',
			fileMakerId: user.patientProfile?.fileMakerId || '',
			createdAt: user.createdAt,
			anonymizationProfile: user.patientProfile?.anonymizationProfile || null
		};

		console.log('Found patient info:', {
			userId,
			name: patientInfo.firstName
		});

		return patientInfo;
	} catch (error) {
		console.error('Error fetching patient info:', error);
		throw error;
	}
}

/**
 * Get multiple patients' information by user IDs
 */
export async function getMultiplePatientInfo(userIds) {
	try {
		if (!Array.isArray(userIds) || userIds.length === 0) {
			throw new Error('User IDs array is required');
		}

		// Ensure database connection
		await connectToDatabase();

		const users = await User.find({
			_id: { $in: userIds }
		}).lean();

		const patientInfos = users.map((user) => ({
			id: user._id,
			firstName: user.fullName?.split(' ')[0] || user.fullName || 'Unknown',
			lastName: user.fullName?.split(' ').slice(1).join(' ') || '',
			gender: user.gender || 'Not specified',
			email: user.email || 'Not provided',
			phone: user.patientProfile?.phoneNumber || 'Not provided',
			preferredCommunication: user.patientProfile?.preferredCommunication || 'Not specified',
			preferredLanguage: normalizeLanguage(user.patientProfile?.preferredLanguage),
			intakeNote: user.patientProfile?.intakeNote || '',
			fileMakerId: user.patientProfile?.fileMakerId || '',
			createdAt: user.createdAt,
			anonymizationProfile: user.patientProfile?.anonymizationProfile || null
		}));

		console.log('Found patient info for multiple users:', {
			requestedCount: userIds.length,
			foundCount: patientInfos.length
		});

		return patientInfos;
	} catch (error) {
		console.error('Error fetching multiple patient info:', error);
		throw error;
	}
}

/**
 * Update patient information
 */
export async function updatePatientInfo(userId, updates) {
	try {
		if (!userId || !updates) {
			throw new Error('User ID and updates are required');
		}

		// Ensure database connection
		await connectToDatabase();

		const allowedUpdates = [
			'fullName',
			'gender',
			'email',
			'patientProfile.phoneNumber',
			'patientProfile.preferredCommunication',
			'patientProfile.preferredLanguage',
			'patientProfile.intakeNote'
		];

		// Filter out any updates that aren't in the allowed list
		const filteredUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
			if (allowedUpdates.includes(key)) {
				acc[key] = value;
			}
			return acc;
		}, {});

		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $set: filteredUpdates },
			{ new: true, runValidators: true }
		).lean();

		if (!updatedUser) {
			throw new Error('Patient not found');
		}

		// Return formatted patient info
		return {
			id: updatedUser._id,
			firstName: updatedUser.fullName?.split(' ')[0] || updatedUser.fullName || 'Unknown',
			lastName: updatedUser.fullName?.split(' ').slice(1).join(' ') || '',
			gender: updatedUser.gender || 'Not specified',
			email: updatedUser.email || 'Not provided',
			phone: updatedUser.patientProfile?.phoneNumber || 'Not provided',
			preferredCommunication: updatedUser.patientProfile?.preferredCommunication || 'Not specified',
			preferredLanguage: normalizeLanguage(updatedUser.patientProfile?.preferredLanguage),
			intakeNote: updatedUser.patientProfile?.intakeNote || '',
			fileMakerId: updatedUser.patientProfile?.fileMakerId || '',
			createdAt: updatedUser.createdAt
		};
	} catch (error) {
		console.error('Error updating patient info:', error);
		throw error;
	}
}
