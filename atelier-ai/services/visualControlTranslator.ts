
/**
 * Visual Control Translation Engine
 * Converts visual widget inputs into optimized prompt text.
 */

import { LightAngleData, CameraAngleData } from '../types';

/**
 * Translates Light Angle Data (Azimuth/Elevation) into descriptive lighting prompts.
 */
export const translateLightAngle = (data: LightAngleData): string => {
    // Handle multi-light data by using the first light or defaulting
    if (data.lights && data.lights.length > 0) {
        const primary = data.lights[0];
        return translateLightAngle({ azimuth: primary.azimuth, elevation: primary.elevation });
    }

    const azimuth = data.azimuth ?? 0;
    const elevation = data.elevation ?? 45;

    // 1. Determine Vertical Angle (Elevation)
    let verticalDesc = "";
    if (elevation > 60) verticalDesc = "overhead top-down";
    else if (elevation > 30) verticalDesc = "high-angle";
    else if (elevation > -10) verticalDesc = "eye-level";
    else if (elevation > -45) verticalDesc = "low-angle up-lighting";
    else verticalDesc = "dramatic under-lighting";


    // 2. Determine Horizontal Direction (Azimuth)
    // Normalize to 0-360
    const az = (azimuth % 360 + 360) % 360;

    let horizontalDesc = "";
    let styleDesc = "";
    let shadowDirection = "";

    // CORRECTED MAPPING: Light position determines shadow on opposite side
    if (az >= 315 || az < 45) {
        horizontalDesc = "front";
        styleDesc = "soft beauty lighting, balanced fill";
        shadowDirection = "shadows falling backward";
    } else if (az >= 45 && az < 135) {
        // Light from RIGHT → Shadow on LEFT
        horizontalDesc = "left-side";
        styleDesc = "cinematic side lighting, rembrandt style";
        shadowDirection = "shadows falling to the right side";
    } else if (az >= 135 && az < 225) {
        horizontalDesc = "back";
        styleDesc = "rim lighting, silhouette effect, halo hair light";
        shadowDirection = "shadows falling forward toward camera";
    } else { // 225 - 315
        // Light from LEFT → Shadow on RIGHT
        horizontalDesc = "right-side";
        styleDesc = "volumetric side lighting, dimensional shadows";
        shadowDirection = "shadows falling to the left side";
    }

    return `${verticalDesc} ${horizontalDesc} lighting, ${styleDesc}, ${shadowDirection}`;
};

/**
 * Translates Camera Angle Data into framing prompts.
 */
export const translateCameraAngle = (data: CameraAngleData): string => {
    const { distance, heightRatio, framing } = data;

    let promptParts = [];

    // 1. Distance / Framing
    const framingMap: Record<string, string> = {
        'close': 'extreme close-up macro shot',
        'medium': 'medium portrait shot',
        'far': 'wide establishing shot',
        'wide': 'ultra-wide panoramic shot'
    };
    promptParts.push(framingMap[distance] || 'medium shot');

    // 2. Height / Perspective
    if (heightRatio > 0.6) promptParts.push("bird's eye view, top-down perspective");
    else if (heightRatio > 0.2) promptParts.push("high angle perspective");
    else if (heightRatio < -0.6) promptParts.push("worm's eye view, dramatic low angle");
    else if (heightRatio < -0.2) promptParts.push("low angle fashion shot");
    else promptParts.push("eye-level perspective");

    // 3. Subject Framing
    if (framing === 'full-body') promptParts.push("full body visible");
    if (framing === 'portrait') promptParts.push("focus on face and shoulders");

    return promptParts.join(", ");
};

/**
 * Merges visual prompts with user text, overriding conflicts.
 */
export const injectVisualControls = (
    basePrompt: string,
    lightData?: LightAngleData,
    cameraData?: CameraAngleData
): string => {
    let finalPrompt = basePrompt;

    // Terms to remove if visual controls are active (Conflict Resolution)
    const lightingTerms = ['lighting', 'shadow', 'sun', 'lamp', 'rim', 'backlight', 'softbox', 'rembrandt'];
    const cameraTerms = ['angle', 'shot', 'view', 'close-up', 'wide', 'zoom', 'perspective'];

    if (lightData) {
        // Remove existing lighting terms to avoid conflict
        // This is a naive removal, a more advanced NLP approach could be used in future
        // For now, we append the visual control with high weight
        const lightPrompt = translateLightAngle(lightData);
        finalPrompt += `, ((${lightPrompt}))`;
    }

    if (cameraData) {
        const cameraPrompt = translateCameraAngle(cameraData);
        finalPrompt += `, ((${cameraPrompt}))`;
    }

    return finalPrompt;
};
