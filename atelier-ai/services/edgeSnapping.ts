/**
 * Edge Snapping Service
 * Provides logic to adjust points to the nearest high-contrast edge (silhouette).
 */

export interface Point {
    x: number;
    y: number;
}

/**
 * Snaps a point to the nearest high-contrast edge within a given radius.
 * Uses a simple gradient magnitude search on the image data.
 */
export const snapToEdge = (
    point: Point,
    imageData: ImageData,
    radius: number = 20
): Point => {
    const { width, height, data } = imageData;
    const centerX = Math.round(point.x);
    const centerY = Math.round(point.y);

    let bestX = centerX;
    let bestY = centerY;
    let maxGradient = -1;

    // Search in a square neighborhood
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const x = centerX + dx;
            const y = centerY + dy;

            // Boundary check
            if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) continue;

            // Calculate gradient magnitude using a simple Sobel-like operator
            // We focus on the Green channel contrast (since it's a green screen) 
            // or Alpha if it's already segmented. Let's use Luminance for generality.
            
            const getLum = (px: number, py: number) => {
                const idx = (py * width + px) * 4;
                // Luminance formula: 0.299R + 0.587G + 0.114B
                return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
            };

            // Horizontal gradient (Gx)
            const gx = 
                -1 * getLum(x - 1, y - 1) + 1 * getLum(x + 1, y - 1) +
                -2 * getLum(x - 1, y)     + 2 * getLum(x + 1, y)     +
                -1 * getLum(x - 1, y + 1) + 1 * getLum(x + 1, y + 1);

            // Vertical gradient (Gy)
            const gy = 
                -1 * getLum(x - 1, y - 1) - 2 * getLum(x, y - 1) - 1 * getLum(x + 1, y - 1) +
                 1 * getLum(x - 1, y + 1) + 2 * getLum(x, y + 1) + 1 * getLum(x + 1, y + 1);

            const gradient = Math.sqrt(gx * gx + gy * gy);

            // We want the strongest edge, but we also want to stay close to the original point.
            // Weight the gradient by distance to favor closer edges.
            const dist = Math.sqrt(dx * dx + dy * dy);
            const weightedGradient = gradient / (1 + dist * 0.1);

            if (weightedGradient > maxGradient) {
                maxGradient = weightedGradient;
                bestX = x;
                bestY = y;
            }
        }
    }

    return { x: bestX, y: bestY };
};
