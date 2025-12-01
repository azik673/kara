
export type LightPreset = 'frontal' | 'side-left' | 'side-right' | 'back-top' | 'harsh-top';
export type CameraPreset = 'eye-level' | 'top-down' | 'low-angle' | 'profile';

export interface LightPresetConfig {
    id: LightPreset;
    label: string;
    icon: string;
    prompt: string;
    description: string;
    azimuth: number;
    elevation: number;
}

export interface CameraPresetConfig {
    id: CameraPreset;
    label: string;
    icon: string;
    prompt: string;
    description: string;
    heightRatio: number;
    distance: 'close' | 'medium' | 'far' | 'wide';
}

export const LIGHT_PRESETS: LightPresetConfig[] = [
    {
        id: 'frontal',
        label: 'Frontal Light',
        icon: '☀️',
        description: 'Soft, even illumination',
        prompt: 'Frontal fill light, soft focus, even illumination, balanced shadows, beauty lighting',
        azimuth: 0,
        elevation: 45
    },
    {
        id: 'side-left',
        label: 'Side Light (Left)',
        icon: '◀️',
        description: 'Strong contrast from left',
        prompt: 'Hard side lighting from left, strong contrast, emphasizes texture and depth, rembrandt style, dramatic shadows',
        azimuth: 90,
        elevation: 30
    },
    {
        id: 'side-right',
        label: 'Side Light (Right)',
        icon: '▶️',
        description: 'Strong contrast from right',
        prompt: 'Hard side lighting from right, strong contrast, emphasizes texture and depth, volumetric shadows, dimensional lighting',
        azimuth: 270,
        elevation: 30
    },
    {
        id: 'back-top',
        label: 'Back-Top Light',
        icon: '⬆️',
        description: 'Dramatic rim lighting',
        prompt: 'Dramatic rim light from high-elevation source, subtle volumetric effects, halo lighting, silhouette emphasis',
        azimuth: 180,
        elevation: 70
    },
    {
        id: 'harsh-top',
        label: 'Harsh Top Light',
        icon: '☀️',
        description: 'Midday sunlight style',
        prompt: 'Top-down harsh shadow, midday sunlight style, stark shadows directly beneath subject, high-contrast lighting',
        azimuth: 0,
        elevation: 90
    }
];

export const CAMERA_PRESETS: CameraPresetConfig[] = [
    {
        id: 'eye-level',
        label: 'Eye-Level',
        icon: '👁️',
        description: 'Standard perspective',
        prompt: 'Eye-level shot, intimate and standard perspective, medium close-up, natural framing',
        heightRatio: 0,
        distance: 'medium'
    },
    {
        id: 'top-down',
        label: 'Top-Down',
        icon: '🦅',
        description: 'Bird\'s eye view',
        prompt: 'High-angle perspective, from bird\'s eye view, subject looking down, dramatic framing, overhead shot',
        heightRatio: 0.8,
        distance: 'medium'
    },
    {
        id: 'low-angle',
        label: 'Low-Angle',
        icon: '🐛',
        description: 'Heroic perspective',
        prompt: 'Low-angle perspective, heroic shot, subject looking up, commanding presence, powerful framing',
        heightRatio: -0.6,
        distance: 'medium'
    },
    {
        id: 'profile',
        label: 'Profile View',
        icon: '👤',
        description: 'Side perspective',
        prompt: 'Medium shot, strict profile view, cinematic framing, side perspective, editorial style',
        heightRatio: 0,
        distance: 'medium'
    }
];
