const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourceIcon = path.join(__dirname, '../src/assets/icon.png');
const outputDir = path.join(__dirname, '../public/assets/icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Generate icons for each size
async function generateIcons() {
    for (const size of sizes) {
        try {
            await sharp(sourceIcon)
                .resize(size, size)
                .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
            console.log(`Generated ${size}x${size} icon`);
        } catch (error) {
            console.error(`Error generating ${size}x${size} icon:`, error);
        }
    }
}

generateIcons(); 