import { Pose, Results, Options } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// Initialize Pose instance
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Custom connector map for a clean "OpenPose-like" look
// We want a simplified skeleton: Limbs and Spine.
const CONNECTIONS_CENTER: [number, number][] = [
    [11, 12], [11, 23], [12, 24], [23, 24] // Torso Box
];
const CONNECTIONS_RIGHT: [number, number][] = [
    [12, 14], [14, 16], // Right Arm
    [24, 26], [26, 28]  // Right Leg
];
const CONNECTIONS_LEFT: [number, number][] = [
    [11, 13], [13, 15], // Left Arm
    [23, 25], [25, 27]  // Left Leg
];

/**
 * Extracts a visual skeleton map from an image URL.
 * Returns a Base64 Data URL of the skeleton on a black background.
 */
export const extractPoseSkeleton = async (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = async () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error("Failed to get canvas context"));
                    return;
                }

                // Wait for Pose to load/process
                // We need to hook into the onResults callback
                const onResults = (results: Results) => {
                    // 1. Fill Background Black
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    if (results.poseLandmarks) {
                        // 2. Draw Skeleton with Distinct Colors

                        // Center (Torso) - White
                        drawConnectors(ctx, results.poseLandmarks, CONNECTIONS_CENTER, {
                            color: '#FFFFFF',
                            lineWidth: 5
                        });

                        // Right Side - Red
                        drawConnectors(ctx, results.poseLandmarks, CONNECTIONS_RIGHT, {
                            color: '#FF0000',
                            lineWidth: 5
                        });

                        // Left Side - Blue
                        drawConnectors(ctx, results.poseLandmarks, CONNECTIONS_LEFT, {
                            color: '#0000FF',
                            lineWidth: 5
                        });

                        // 3. Draw Joints (Manually for full control)
                        results.poseLandmarks.forEach((landmark, index) => {
                            // Only draw landmarks that are part of our skeleton (11-28)
                            if (index < 11 || index > 28) return;

                            const x = landmark.x * canvas.width;
                            const y = landmark.y * canvas.height;

                            ctx.beginPath();
                            ctx.arc(x, y, 5, 0, 2 * Math.PI);

                            // Color logic: Even = Right (Red/Orange), Odd = Left (Blue/Cyan)
                            if (index % 2 === 0) {
                                ctx.fillStyle = '#FF8800'; // Right
                            } else {
                                ctx.fillStyle = '#0088FF'; // Left
                            }

                            ctx.fill();
                        });
                    }

                    resolve(canvas.toDataURL('image/png'));
                };

                // Set callback just for this execution? 
                // MediaPipe is singleton-ish here. We might need a queue if concurrent.
                // For now, assuming sequential execution or simple race handling.
                pose.onResults(onResults);

                await pose.send({ image: img });

            } catch (error) {
                console.error("Pose extraction error:", error);
                reject(error);
            }
        };
        img.onerror = (err) => reject(new Error(`Failed to load image: ${err}`));
        img.src = imageUrl;
    });
};
