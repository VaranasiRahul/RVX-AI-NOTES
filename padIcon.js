const sharp = require('sharp');
const fs = require('fs');

async function padIcon() {
    try {
        const inputPath = './assets/images/icon.png';
        const outputPath = './assets/images/android-icon-foreground-padded.png';

        // Create a transparent 1024x1024 background
        const background = sharp({
            create: {
                width: 1024,
                height: 1024,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 } // transparent
            }
        });

        // Resize the original icon to fit within the safe zone (around 60% of 1024 = 614x614)
        const resizedIconP = sharp(inputPath)
            .resize(614, 614, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();

        const resizedIcon = await resizedIconP;

        // Composite the resized icon onto the center of the 1024x1024 canvas
        await background
            .composite([{ input: resizedIcon, gravity: 'center' }])
            .png()
            .toFile(outputPath);

        console.log('Successfully created padded icon:', outputPath);
    } catch (err) {
        console.error('Error generating padded icon:', err);
    }
}

padIcon();
