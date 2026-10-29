import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password) {
	return bcrypt.hash(password, SALT_ROUNDS);
}
