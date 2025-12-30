import { Layer } from '../types';

const API_URL = 'http://localhost:8000';

export interface PosePoint {
    x: number;
    y: number;
}

export interface PosePair {
    handle: PosePoint;
    target: PosePoint;
    label?: string;
}

export const processTransformation = async (
    imageBase64: string, 
    points: PosePair[]
): Promise<string> => {
    try {
        const response = await fetch(`${API_URL}/pose`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageBase64,
                points: points.map(p => [p.handle, p.target])
            }),
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.image;
    } catch (error) {
        console.error('Pose API Error:', error);
        throw error;
    }
};

export const checkBackendStatus = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_URL}/`);
        return response.ok;
    } catch (e) {
        return false;
    }
};

export interface DetectedPoint {
    x: number;
    y: number;
    label: string;
}


