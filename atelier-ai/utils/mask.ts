/**
 * Utility for generating a mask based on pose points.
 */

export interface Point {
    x: number;
    y: number;
}

export interface PosePair {
    handle: Point;
    target: Point;
}

/**
 * Generates a black-and-white mask highlighting the areas between handle and target points.
 */
export const generatePoseMask = async (
    width: number,
    height: number,
    pairs: PosePair[],
    brushSize: number = 120,
    exclusionPoints: Point[] = [],
    silhouetteBase64?: string
): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error("Failed to get canvas context");

    // 1. Fill background black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw white areas for each pose pair
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    pairs.forEach(pair => {
        // Draw a line between handle and target
        ctx.beginPath();
        ctx.moveTo(pair.handle.x, pair.handle.y);
        ctx.lineTo(pair.target.x, pair.target.y);
        ctx.stroke();

        // Also draw circles at both ends to ensure full coverage
        ctx.beginPath();
        ctx.arc(pair.handle.x, pair.handle.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pair.target.x, pair.target.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // 3. Clear exclusion zones (e.g., face)
    if (exclusionPoints.length > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        exclusionPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, brushSize * 1.5, 0, Math.PI * 2); // Large exclusion zone
            ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
    }

    // 4. Silhouette Clipping (Protect Background)
    if (silhouetteBase64) {
        const silhouetteImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = silhouetteBase64;
        });

        const silCanvas = document.createElement('canvas');
        silCanvas.width = width;
        silCanvas.height = height;
        const silCtx = silCanvas.getContext('2d');
        if (silCtx) {
            silCtx.drawImage(silhouetteImg, 0, 0, width, height);
            const imageData = silCtx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Simple white-background silhouette detection
            // We treat anything that isn't white (or near-white) as the silhouette
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const isWhite = r > 245 && g > 245 && b > 245;
                data[i+3] = isWhite ? 0 : 255; // Make white transparent
            }
            silCtx.putImageData(imageData, 0, 0);
            
            // Clip the mask to the silhouette
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(silCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // 3. Apply a blur to soften the edges
    ctx.filter = 'blur(20px)';
    const blurredCanvas = document.createElement('canvas');
    blurredCanvas.width = width;
    blurredCanvas.height = height;
    const blurredCtx = blurredCanvas.getContext('2d');
    if (blurredCtx) {
        blurredCtx.drawImage(canvas, 0, 0);
        return blurredCanvas.toDataURL('image/png');
    }

    return canvas.toDataURL('image/png');
};

/**
 * Surgically blends the AI-generated result back onto the original image using the mask.
 * This ensures that areas outside the mask (like the face and background) remain 100% original.
 */
export const compositeSurgicalResult = async (
    originalBase64: string,
    aiResultBase64: string,
    maskBase64: string
): Promise<string> => {
    const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    };

    const [original, aiResult, mask] = await Promise.all([
        loadImg(originalBase64),
        loadImg(aiResultBase64),
        loadImg(maskBase64)
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = original.width;
    canvas.height = original.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Failed to get canvas context");

    // 1. Draw the original image as the base
    ctx.drawImage(original, 0, 0);

    // 2. Create a temporary canvas for the masked AI result
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = original.width;
    tempCanvas.height = original.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error("Failed to get temp canvas context");

    // 3. Draw the AI result on the temp canvas
    tempCtx.drawImage(aiResult, 0, 0, original.width, original.height);

    // 4. Use the mask to "cut out" the AI result
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(mask, 0, 0, original.width, original.height);

    // 5. Draw the masked AI result on top of the original
    ctx.drawImage(tempCanvas, 0, 0);

    return canvas.toDataURL('image/png');
};
