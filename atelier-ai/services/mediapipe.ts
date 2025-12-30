import { Pose, POSE_LANDMARKS, PoseLandmark } from '@mediapipe/pose';

// Initialize the Pose instance
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

export interface DetectedPoint {
    x: number;
    y: number;
    label: string;
}

// Map MediaPipe landmarks to our labels
const LANDMARK_MAP: Record<number, string> = {
    [POSE_LANDMARKS.NOSE]: "Nose",
    [POSE_LANDMARKS.LEFT_EYE]: "Left Eye",
    [POSE_LANDMARKS.RIGHT_EYE]: "Right Eye",
    [POSE_LANDMARKS.LEFT_SHOULDER]: "Left Shoulder",
    [POSE_LANDMARKS.RIGHT_SHOULDER]: "Right Shoulder",
    [POSE_LANDMARKS.LEFT_ELBOW]: "Left Elbow",
    [POSE_LANDMARKS.RIGHT_ELBOW]: "Right Elbow",
    [POSE_LANDMARKS.LEFT_WRIST]: "Left Wrist",
    [POSE_LANDMARKS.RIGHT_WRIST]: "Right Wrist",
    [POSE_LANDMARKS.LEFT_HIP]: "Left Hip",
    [POSE_LANDMARKS.RIGHT_HIP]: "Right Hip",
    [POSE_LANDMARKS.LEFT_KNEE]: "Left Knee",
    [POSE_LANDMARKS.RIGHT_KNEE]: "Right Knee",
    [POSE_LANDMARKS.LEFT_ANKLE]: "Left Ankle",
    [POSE_LANDMARKS.RIGHT_ANKLE]: "Right Ankle"
};

export const detectPoseInImage = async (imageBase64: string, width: number, height: number): Promise<DetectedPoint[]> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
            try {
                // We need to wait for the results
                const onResults = (results: any) => {
                    if (!results.poseLandmarks) {
                        resolve([]);
                        return;
                    }

                    const detectedPoints: DetectedPoint[] = [];
                    
                    for (const [index, label] of Object.entries(LANDMARK_MAP)) {
                        const landmark = results.poseLandmarks[Number(index)];
                        if (landmark && landmark.visibility > 0.5) {
                            detectedPoints.push({
                                x: landmark.x * width,
                                y: landmark.y * height,
                                label: label
                            });
                        }
                    }
                    resolve(detectedPoints);
                };

                pose.onResults(onResults);
                await pose.send({ image: img });
            } catch (error) {
                reject(error);
            }
        };
        img.onerror = (err) => reject(new Error("Failed to load image for pose detection"));
        img.src = imageBase64;
    });
};
