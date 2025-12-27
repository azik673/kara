import { removeBackground, Config } from '@imgly/background-removal';

/**
 * Refines the edges of a segmented image by eroding the alpha channel.
 * This helps remove white artifacts (halos) often left by segmentation models.
 */
const refineEdges = async (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                resolve(blob);
                return;
            }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;

            // 1. Initial Erosion: Remove the initial white halo completely
            const erodedData = new Uint8ClampedArray(data);
            const erosionRadius = 2;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    if (data[i + 3] > 0) {
                        let hasTransparentNearby = false;
                        for (let ny = -erosionRadius; ny <= erosionRadius; ny++) {
                            for (let nx = -erosionRadius; nx <= erosionRadius; nx++) {
                                const nidx = ((y + ny) * width + (x + nx)) * 4;
                                if (nidx >= 0 && nidx < data.length && data[nidx + 3] < 128) {
                                    hasTransparentNearby = true;
                                    break;
                                }
                            }
                            if (hasTransparentNearby) break;
                        }
                        if (hasTransparentNearby) erodedData[i + 3] = 0;
                    }
                }
            }

            // 2. Color Smear (Decontamination): 
            // Fill transparent areas near the edge with the color of the nearest opaque pixel.
            // This creates a "buffer" of the subject's color.
            const smearedData = new Uint8ClampedArray(erodedData);
            const smearRadius = 5;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    if (erodedData[i + 3] === 0) {
                        let found = false;
                        for (let r = 1; r <= smearRadius; r++) {
                            for (let ny = -r; ny <= r; ny++) {
                                for (let nx = -r; nx <= r; nx++) {
                                    const nidx = ((y + ny) * width + (x + nx)) * 4;
                                    if (nidx >= 0 && nidx < erodedData.length && erodedData[nidx + 3] === 255) {
                                        smearedData[i] = erodedData[nidx];
                                        smearedData[i + 1] = erodedData[nidx + 1];
                                        smearedData[i + 2] = erodedData[nidx + 2];
                                        found = true;
                                        break;
                                    }
                                }
                                if (found) break;
                            }
                            if (found) break;
                        }
                    }
                }
            }

            // 3. Mask Blur: Apply a Gaussian-like blur to the alpha channel only.
            // This reveals the smeared colors softly.
            const finalData = new Uint8ClampedArray(smearedData);
            const blurRadius = 2;
            for (let y = blurRadius; y < height - blurRadius; y++) {
                for (let x = blurRadius; x < width - blurRadius; x++) {
                    const i = (y * width + x) * 4;
                    
                    let sumAlpha = 0;
                    let count = 0;
                    for (let ny = -blurRadius; ny <= blurRadius; ny++) {
                        for (let nx = -blurRadius; nx <= blurRadius; nx++) {
                            const nidx = ((y + ny) * width + (x + nx)) * 4;
                            sumAlpha += smearedData[nidx + 3];
                            count++;
                        }
                    }
                    finalData[i + 3] = sumAlpha / count;
                }
            }

            ctx.putImageData(new ImageData(finalData, width, height), 0, 0);
            canvas.toBlob((refinedBlob) => {
                if (refinedBlob) resolve(refinedBlob);
                else resolve(blob);
            }, 'image/png');
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
};

/**
 * Removes the background from an image using @imgly/background-removal.
 * 
 * @param imageSrc The source URL or Data URL of the image.
 * @returns A Promise that resolves to a Data URL of the image with the background removed.
 */
export const removeImageBackground = async (imageSrc: string): Promise<string> => {
    try {
        const config: Config = {
            // You can configure the model here if needed
        };

        const blob = await removeBackground(imageSrc, config);
        const refinedBlob = await refineEdges(blob);
        return URL.createObjectURL(refinedBlob);
    } catch (error) {
        console.error("Error removing background:", error);
        throw error;
    }
};
