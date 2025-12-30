/**
 * Service for interacting with the Reve API for drag-and-drop transformations.
 */

interface Point {
    x: number;
    y: number;
}

interface ReveRequestPoints {
    handle_points: number[][]; // [Y, X] normalized
    target_points: number[][]; // [Y, X] normalized
}

/**
 * Prepares the points data for the Reve API by normalizing coordinates
 * and converting them to [Y, X] format.
 */
export const prepareReveRequest = (
    posePoints: { handle: Point; target: Point }[],
    canvasWidth: number,
    canvasHeight: number
): ReveRequestPoints => {
    const handle_points: number[][] = [];
    const target_points: number[][] = [];

    posePoints.forEach(pair => {
        // Normalize and flip to [Y, X]
        // Ensure values are within 0.0 - 1.0 range
        const handleY = Math.max(0, Math.min(1, pair.handle.y / canvasHeight));
        const handleX = Math.max(0, Math.min(1, pair.handle.x / canvasWidth));
        
        const targetY = Math.max(0, Math.min(1, pair.target.y / canvasHeight));
        const targetX = Math.max(0, Math.min(1, pair.target.x / canvasWidth));

        handle_points.push([handleY, handleX]);
        target_points.push([targetY, targetX]);
    });

    return {
        handle_points,
        target_points
    };
};

/**
 * Calls the Reve API to perform the drag transformation.
 */
export const callReveAPI = async (imageBase64: string, pointsData: ReveRequestPoints): Promise<string> => {
    // We call our internal API route
    // Note: This requires running with `vercel dev` locally to work
    const response = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            image: imageBase64, 
            edit_type: "drag",
            handle_points: pointsData.handle_points,
            target_points: pointsData.target_points,
            strength: 0.85,
            version: "latest"
        })
    });

    const result = await response.json();
    if (!response.ok) {
        console.error("Reve API Error:", result);
        throw new Error(result.error || result.message || "Transformation failed");
    }
    
    if (!result.output_url) {
        throw new Error("Reve API did not return an output URL.");
    }

    return result.output_url;
};