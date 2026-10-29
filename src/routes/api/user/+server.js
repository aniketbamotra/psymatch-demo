import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { User, Status } from '$lib/database/schemas.js';
import { normalizeLanguage } from '$lib/utils/language.js';

export async function GET({ url, locals }) {
	console.log('GET request received at /api/user');
	console.log('Query params:', Object.fromEntries(url.searchParams));
	console.log('locals.user:', locals.user);

	const role = url.searchParams.get('role');
	const fileMakerId = url.searchParams.get('fileMakerId');
	const query = url.searchParams.get('query');
	const email = url.searchParams.get('email');
	const id = url.searchParams.get('id');

	try {
		await connectToDatabase();

		// Check for exact email match
		if (email) {
			const user = await User.findOne({ email: email }).lean();
			if (user) {
				return json({
					exists: true,
					user: {
						_id: user._id,
						email: user.email,
						fullName: user.fullName,
						gender: user.gender,
						userType: user.userType
					}
				});
			}
			return json({ exists: false });
		}

		// New search functionality
		if (query) {
			if (!locals.user || locals.user.userType !== 'admin') {
				console.log('Unauthorized: not admin');
				return new Response(null, {
					status: 302,
					headers: {
						Location: '/login'
					}
				});
			}

			const searchPattern = new RegExp(query, 'i');
			const searchResults = await User.find(
				{
					userType: 'patient',
					$or: [
						{ fullName: searchPattern },
						{ email: searchPattern },
						{ 'patientProfile.phoneNumber': searchPattern },
						{ 'patientProfile.fileMakerId': searchPattern }
					]
				},
				'_id email fullName patientProfile.phoneNumber patientProfile.fileMakerId'
			).lean();

			console.log('Search results:', searchResults);
			return json(
				searchResults.map((user) => ({
					_id: user._id,
					fullName: user.fullName,
					email: user.email,
					phone: user.patientProfile?.phoneNumber || null,
					fileMakerId: user.patientProfile?.fileMakerId || null
				}))
			);
		}

		// Check for FileMaker ID existence
		if (fileMakerId) {
			const existingUser = await User.findOne({ 'patientProfile.fileMakerId': fileMakerId });
			return json({ exists: !!existingUser });
		}

		// Get users by role
		if (role === 'patient' || role === 'admin') {
			if (!locals.user || locals.user.userType !== 'admin') {
				console.log('Unauthorized: not admin');
				return new Response(null, {
					status: 302,
					headers: {
						Location: '/login'
					}
				});
			}

			if (role === 'admin') {
				// Only directors can view admin users
				if (!locals.user.isDirector) {
					return json({ error: 'Unauthorized: not a director' }, { status: 403 });
				}

				// Get all admin users
				const admins = await User.find(
					{ userType: 'admin' },
					'email fullName gender _id isDirector createdAt'
				).lean();

				return json(admins);
			} else {
				// First check if there are any patients
				const count = await User.countDocuments({ userType: 'patient' });
				console.log('Patient count:', count);

				// Get all patients with complete profile
				const patients = await User.find(
					{ userType: 'patient' },
					'email fullName gender _id patientProfile.phoneNumber patientProfile.preferredCommunication patientProfile.preferredLanguage patientProfile.intakeNote patientProfile.fileMakerId patientProfile.intakeAdmin createdAt'
				).lean();

				// Get last activity for each patient from Status collection
				const patientIds = patients.map((p) => p._id);
				const statuses = await Status.find(
					{ patientId: { $in: patientIds } },
					'patientId lastActivity'
				).lean();

				// Create a map of patientId to lastActivity
				const activityMap = new Map(statuses.map((s) => [s.patientId.toString(), s.lastActivity]));

				// Transform data to ensure consistent structure
				const transformedPatients = patients.map((patient) => ({
					...patient,
					dateOfReg: patient.createdAt,
					lastActivity: activityMap.get(patient._id.toString()) || patient.createdAt,
					patientProfile: {
						phoneNumber: patient.patientProfile?.phoneNumber || null,
						preferredCommunication: patient.patientProfile?.preferredCommunication || null,
						preferredLanguage: normalizeLanguage(patient.patientProfile?.preferredLanguage),
						intakeNote: patient.patientProfile?.intakeNote || null,
						fileMakerId: patient.patientProfile?.fileMakerId || null,
						intakeAdmin: patient.patientProfile?.intakeAdmin || null
					}
				}));

				console.log('Found patients:', patients);

				// Log each patient for debugging
				if (patients.length > 0) {
					patients.forEach((patient, index) => {
						console.log(`Patient ${index + 1}:`, {
							_id: patient._id,
							email: patient.email,
							fullName: patient.fullName,
							gender: patient.gender
						});
					});
				} else {
					console.log('No patients found in database');
				}

				return json(transformedPatients);
			}
		}

		// Get current user info
		if (!locals.user) {
			console.log('No user found in locals');
			return new Response(null, {
				status: 302,
				headers: {
					Location: '/login'
				}
			});
		}
		if (id) {
			const user = await User.findById(id);
			return json({ user });
		}
		const userData = {
			id: locals.user._id || locals.user.id,
			email: locals.user.email,
			fullName: locals.user.fullName,
			gender: locals.user.gender,
			userType: locals.user.userType,
			isDirector: locals.user.isDirector
		};

		console.log('Returning user data:', userData);
		return json(userData);
	} catch (error) {
		console.error('Error in user API:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

export async function PUT({ request, url, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	const userId = url.pathname.split('/').pop();
	if (!userId) {
		return json({ error: 'User ID is required' }, { status: 400 });
	}

	try {
		const updates = await request.json();
		await connectToDatabase();

		const allowedUpdates = [
			'fullName',
			'email',
			'patientProfile.phoneNumber',
			'patientProfile.preferredCommunication',
			'patientProfile.preferredLanguage'
		];

		// Filter out any updates that aren't in the allowed list.
		//
		// The nested `patientProfile: { … }` form callers send is flattened to DOTTED
		// paths here. `$set: { patientProfile: {...} }` replaces the entire subdocument
		// in MongoDB, so keeping the nested shape would silently wipe every profile
		// field outside the allow-list — fileMakerId (the patient ID the AI reports
		// print), intakeNote, notes[], passwordHash, anonymizationProfile, aiCost.
		const filteredUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
			if (allowedUpdates.includes(key)) {
				acc[key] = value;
			} else if (key === 'patientProfile' && value && typeof value === 'object') {
				for (const [profileKey, profileValue] of Object.entries(value)) {
					const fullKey = `patientProfile.${profileKey}`;
					if (allowedUpdates.includes(fullKey)) {
						acc[fullKey] = profileValue;
					}
				}
			}
			return acc;
		}, {});

		// Preferred language is mandatory — an edit must never be able to blank it.
		if ('patientProfile.preferredLanguage' in filteredUpdates) {
			filteredUpdates['patientProfile.preferredLanguage'] = normalizeLanguage(
				filteredUpdates['patientProfile.preferredLanguage']
			);
		}

		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $set: filteredUpdates },
			{ new: true, runValidators: true }
		).lean();

		if (!updatedUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		return json(updatedUser);
	} catch (error) {
		console.error('Error updating user:', error);
		return json({ error: 'Error updating user' }, { status: 500 });
	}
}

export async function DELETE({ url, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	const userId = url.pathname.split('/').pop();
	if (!userId) {
		return json({ error: 'User ID is required' }, { status: 400 });
	}

	try {
		await connectToDatabase();

		// Check if user exists
		const user = await User.findById(userId);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// For patients, update Status to 'inactive' instead of deleting
		if (user.userType === 'patient') {
			const status = await Status.findOne({ patientId: userId });
			if (status) {
				status.status = 'inactive';
				status.lastActivity = new Date();
				await status.save();
			}
		}

		// Note: We're keeping the user record and all related data (soft delete via Status)
		// If you need to actually delete the user and all data, uncomment below:
		/*
        // Delete test responses
        await import('$lib/database/schemas.js').then(async ({ Response, Assignment }) => {
            const assignments = await Assignment.find({ patientId: userId });
            const assignmentIds = assignments.map(a => a._id);
            await Response.deleteMany({ assignmentId: { $in: assignmentIds } });
            await Assignment.deleteMany({ patientId: userId });
        });

        // Delete status
        await Status.deleteOne({ patientId: userId });

        // Delete the user
        await user.deleteOne();
        */

		return json({ message: 'User marked as inactive successfully' });
	} catch (error) {
		console.error('Error updating user status:', error);
		return json({ error: 'Error updating user status' }, { status: 500 });
	}
}

export async function POST({ request, locals, url }) {
	console.log('POST request received at /api/user');

	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	try {
		const userData = await request.json();
		const isCreateAdmin = url.searchParams.get('createAdmin') === 'true';
		console.log('Received user data:', { ...userData, passwordHash: '[REDACTED]' });

		await connectToDatabase();

		// Check if user with this email already exists
		const existingUser = await User.findOne({ email: userData.email });
		if (existingUser) {
			return json({ error: 'User with this email already exists' }, { status: 400 });
		}

		// Validate gender
		const validGenders = ['He', 'She', 'They', 'Ze'];
		if (!validGenders.includes(userData.gender)) {
			return json({ error: 'Invalid gender value' }, { status: 400 });
		}

		let newUser;
		if (isCreateAdmin) {
			// Create new admin user
			newUser = new User({
				email: userData.email,
				fullName: userData.fullName,
				gender: userData.gender,
				userType: 'admin',
				isDirector: userData.isDirector || false,
				adminProfile: {
					isPasswordSet: false
				}
			});
		} else {
			// Check if FileMaker ID is unique if provided
			if (userData.fileMakerId) {
				const existingFileMakerId = await User.findOne({
					'patientProfile.fileMakerId': userData.fileMakerId
				});
				if (existingFileMakerId) {
					return json({ error: 'User ID already exists' }, { status: 400 });
				}
			}

			// Create new patient user
			newUser = new User({
				email: userData.email,
				fullName: userData.fullName,
				gender: userData.gender,
				userType: 'patient',
				patientProfile: {
					phoneNumber: userData.patientProfile.phoneNumber,
					preferredCommunication: userData.patientProfile.preferredCommunication,
					// Never store a blank language: '' fails the enum and would fail the
					// whole create, and null would slip past the schema default.
					preferredLanguage: normalizeLanguage(userData.patientProfile.preferredLanguage),
					intakeNote: userData.patientProfile.intakeNote,
					fileMakerId: userData.patientProfile.fileMakerId,
					isPasswordSet: false,
					intakeAdmin: userData.patientProfile.intakeAdmin
						? {
								id: userData.patientProfile.intakeAdmin.id,
								name: userData.patientProfile.intakeAdmin.name
							}
						: null,
					notes: []
				}
			});
		}

		await newUser.save();
		console.log('New user created:', {
			id: newUser._id,
			email: newUser.email,
			gender: newUser.gender
		});

		// Create Status record for new patients
		if (!isCreateAdmin) {
			const newStatus = new Status({
				patientId: newUser._id,
				status: 'onboarded',
				assignmentIds: [],
				lastActivity: new Date()
			});
			await newStatus.save();
			console.log('Status record created for new patient');
		}

		return json({
			message: 'User created successfully',
			_id: newUser._id,
			email: newUser.email,
			gender: newUser.gender
		});
	} catch (error) {
		console.error('Error creating user:', error);
		return json({ error: 'Error creating user' }, { status: 500 });
	}
}
