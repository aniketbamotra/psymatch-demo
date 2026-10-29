import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconDirectory = 'static/pwa-icons';

async function generateIcons() {
	try {
		// Create the pwa-icons directory if it doesn't exist
		await fs.mkdir(iconDirectory, { recursive: true });

		// Read the source favicon
		const sourceIcon = 'static/favicon.png';

		// Generate icons for each size
		for (const size of sizes) {
			await sharp(sourceIcon)
				.resize(size, size)
				.toFile(path.join(iconDirectory, `icon-${size}x${size}.png`));

			console.log(`Generated ${size}x${size} icon`);
		}

		console.log('PWA icons generated successfully!');
	} catch (error) {
		console.error('Error generating PWA icons:', error);
		process.exit(1);
	}
}

generateIcons();
