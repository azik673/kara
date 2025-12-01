

import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ControlMaps } from '../types';
import { translateLightAngle, translateCameraAngle } from './visualControlTranslator';

// Initialize Gemini Client
// Note: API_KEY is expected to be in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-2.5-flash-image';
// We use 2.5-flash-image as it supports image input well and is fast for iterative design.

// Permissive Safety Settings to prevent blocking fashion sketches/mannequins
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

/**
 * Helper function to retry operations with exponential backoff.
 * Handles 429 (Rate Limit) and 503 (Service Unavailable) errors.
 * Updated to be more resilient to Free Tier limits.
 */
async function retryOperation<T>(operation: () => Promise<T>, retries = 5, delay = 5000): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        // Deep inspection of error object to handle various API error formats
        let status = error?.status || error?.response?.status;
        let code = error?.code || error?.error?.code;
        let message = error?.message || error?.error?.message || '';

        // Handle nested error structure
        if (error?.error) {
            status = status || error.error.status;
            code = code || error.error.code;
            message = message || error.error.message;
        }

        // Attempt to parse JSON from message if it looks like a JSON string
        if (typeof message === 'string') {
            const trimmed = message.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.error) {
                        code = code || parsed.error.code;
                        status = status || parsed.error.status;
                        message = parsed.error.message || message;
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }
        }

        const msgStr = typeof message === 'string' ? message.toLowerCase() : '';

        // CRITICAL: FAIL ON HARD DAILY QUOTA
        // Modified to avoid false positives on "check your billing details" which appears in standard Rate Limit errors.
        if (msgStr.includes('daily limit') || msgStr.includes('quota exceeded for the day')) {
            console.error("Gemini Hard Quota Exceeded:", message);
            throw new Error("Gemini API Daily Limit Exceeded. Please check your plan.");
        }

        // Robust check for Rate Limits / Quota Issues (Retryable)
        const isRateLimit =
            status === 429 ||
            status === 'RESOURCE_EXHAUSTED' ||
            code === 429 ||
            code === 'RESOURCE_EXHAUSTED' ||
            msgStr.includes('429') ||
            msgStr.includes('resource_exhausted') ||
            msgStr.includes('quota') ||
            msgStr.includes('limit');

        const isServerOverload = status === 503 || code === 503 || msgStr.includes('overloaded');

        if ((isRateLimit || isServerOverload) && retries > 0) {
            const jitter = Math.random() * 2000;
            const nextDelay = (delay * 1.5) + jitter;

            console.warn(`Gemini API Busy (Status: ${status}, Msg: ${message}). Retrying in ${Math.round(nextDelay)}ms... (${retries} retries left)`);

            await new Promise(resolve => setTimeout(resolve, delay));
            return retryOperation(operation, retries - 1, nextDelay);
        }

        if (retries === 0) {
            console.error("Gemini API Retry Limit Reached.", { status, code, message });
            // If we ran out of retries for 429, give a helpful message
            if (isRateLimit) {
                throw new Error("System is busy (high traffic). Please try again in a moment.");
            }
        }

        throw error;
    }
}

/**
 * Robustly parses a Data URL to extract MIME type and Base64 data.
 * Enforces strict validation to prevent sending garbage (e.g. text) as image data.
 */
const processImage = (dataUrl: string): { mimeType: string, data: string } | null => {
    try {
        if (!dataUrl || typeof dataUrl !== 'string') return null;

        const cleanUrl = dataUrl.trim();

        // Strict check: Must be a Data URL for an image
        if (!cleanUrl.startsWith('data:image/')) return null;

        const commaIdx = cleanUrl.indexOf(',');
        if (commaIdx === -1) return null;

        const meta = cleanUrl.substring(0, commaIdx); // e.g., "data:image/png;base64"
        const data = cleanUrl.substring(commaIdx + 1);

        // Extract Mime Type
        const mimeMatch = meta.match(/^data:(image\/[a-zA-Z0-9+.-]+)/);
        if (!mimeMatch) return null;

        let mimeType = mimeMatch[1];

        // Validate against supported Gemini MIME types
        const supportedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
        if (!supportedMimes.includes(mimeType)) {
            // Common fix for "image/jpg" which is not technically a standard mime but often used
            if (mimeType === 'image/jpg') {
                mimeType = 'image/jpeg';
            } else {
                console.warn(`Unsupported MIME type: ${mimeType}. API may reject this.`);
            }
        }

        return {
            mimeType,
            data
        };
    } catch (e) {
        console.error("Error parsing image data:", e);
        return null;
    }
};


/**
 * PARSE COHERENCE PROMPT
 */
const parseCoherencePrompt = (prompt: string) => {
    const defaults = { active: true, strength: 0.9 };
    const modules = {
        pose: { ...defaults },
        lighting: { ...defaults },
        identity: { ...defaults }
    };

    if (!prompt || !prompt.trim()) return modules;

    const lowerPrompt = prompt.toLowerCase();
    const exclusivityRegex = /\b(only|just|exclusively)\b/i;
    let isExclusive = false;
    const explicitlyMentioned = new Set<string>();

    const keys = {
        pose: /pose|posture|skeleton|structure|shape|body|stance|position/i,
        lighting: /light|color|environment|mood|atmosphere|shader|tone|brightness/i,
        identity: /identity|face|subject|person|character|features|look/i
    };

    if (exclusivityRegex.test(lowerPrompt)) {
        for (const [key, regex] of Object.entries(keys)) {
            if (regex.test(lowerPrompt)) {
                explicitlyMentioned.add(key);
                isExclusive = true;
            }
        }
    }

    if (isExclusive) {
        modules.pose.active = explicitlyMentioned.has('pose');
        modules.lighting.active = explicitlyMentioned.has('lighting');
        modules.identity.active = explicitlyMentioned.has('identity');
    }

    const clauses = lowerPrompt.split(/[,.;]/);
    const highStrength = /strict|hard|strong|heavy|exact|lock|high|maximum/i;
    const mediumStrength = /medium|average|moderate|normal|standard|gently|subtly/i;
    const lowStrength = /weak|low|soft|loose|slight|hint/i;
    const deactivation = /ignore|exclude|don't use|skip|remove|no /i;
    const numberRegex = /(\d{1,3})%|0\.(\d+)|1\.0/;

    const getStrength = (text: string): number | null => {
        if (deactivation.test(text)) return 0.0;
        const numMatch = text.match(numberRegex);
        if (numMatch) {
            if (numMatch[1]) return Math.min(parseInt(numMatch[1]) / 100, 1.0);
            if (numMatch[0]) return parseFloat(numMatch[0]);
        }
        if (highStrength.test(text)) return 0.95;
        if (mediumStrength.test(text)) return 0.60;
        if (lowStrength.test(text)) return 0.35;
        return null;
    };

    clauses.forEach(clause => {
        const strength = getStrength(clause);
        for (const [key, regex] of Object.entries(keys)) {
            if (regex.test(clause)) {
                const k = key as keyof typeof modules;
                if (strength !== null) {
                    modules[k].strength = strength;
                    modules[k].active = strength > 0;
                } else if (!isExclusive) {
                    modules[k].active = true;
                }
            }
        }
    });

    return modules;
};


/**
 * EXTRACT COHERENCE DATA
 */
export const extractCoherenceAttributes = async (
    referenceImage: string,
    focusPrompt?: string
): Promise<any> => {
    try {
        const imgData = processImage(referenceImage);
        if (!imgData) throw new Error("Invalid image for coherence extraction");

        const settings = parseCoherencePrompt(focusPrompt || "");

        const instructions = `
        SYSTEM: DATA EXTRACTION MODE.
        Analyze this reference image and extract strictly formatted JSON data.
        
        FOCUS INSTRUCTIONS:
        ${settings.pose.active
                ? `- Extract POSE data. Strength: ${settings.pose.strength}.`
                : '- IGNORE Pose data.'}
        ${settings.lighting.active
                ? `- Extract LIGHTING data. Strength: ${settings.lighting.strength}.`
                : '- IGNORE Lighting data.'}
        ${settings.identity.active
                ? `- Extract IDENTITY data. Strength: ${settings.identity.strength}.`
                : '- IGNORE Identity data.'}
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "lock_id": "unique_hash",
            "data_timestamp": "${new Date().toISOString()}",
            "pose_data": ${settings.pose.active ? `{ "type": "ControlNet/OpenPose", "strength": ${settings.pose.strength}, "description": "Detailed body pose description." }` : 'null'},
            "lighting_data": ${settings.lighting.active ? `{ "type": "HDR/EnvironmentMap", "intensity": ${settings.lighting.strength}, "description": "Detailed light source analysis." }` : 'null'},
            "subject_identity": ${settings.identity.active ? `{ "type": "IP_Adapter/SubjectID", "strength": ${settings.identity.strength}, "description": "Detailed subject physical description." }` : 'null'}
        }
    `;

        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { inlineData: { mimeType: imgData.mimeType, data: imgData.data } },
                    { text: instructions }
                ]
            },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Failed to extract coherence data");

        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Coherence Extraction Error:", error);
        throw error;
    }
};

/**
 * PBR FABRIC SIMULATION ANALYSIS
 * Analyzes a fabric swatch and pose to determine physics properties.
 */
export const analyzeFabricPhysics = async (
    fabricImage: string,
    poseData: any
): Promise<any> => {
    try {
        const imgData = processImage(fabricImage);
        if (!imgData) throw new Error("Invalid fabric image");

        const instructions = `
            SYSTEM: PHYSICS SIMULATION ENGINE.
            TASK: Analyze the attached FABRIC SWATCH image.
            CONTEXT: This fabric will be draped onto a model with the following POSE: "${poseData?.description || 'Standing neutral'}".
            
            CALCULATE THE FOLLOWING PBR PROPERTIES:
            1. WEIGHT/MASS: (e.g., Heavy denim vs. light silk).
            2. STIFFNESS: (e.g., rigid folds vs. soft fluid drape).
            3. WEAVE/TEXTURE: (e.g., coarse, satin, matte).
            
            OUTPUT FORMAT (JSON ONLY):
            {
                "fabric_physics": {
                    "weight_class": "string (Light/Medium/Heavy)",
                    "drape_coefficient": "number (0.0 - 1.0)",
                    "stiffness": "number (0.0 - 1.0)",
                    "wrinkle_frequency": "string (Low/High)",
                    "description": "Detailed text describing how this fabric behaves physically."
                },
                "wrinkle_map_logic": {
                    "stress_points": ["List of body parts based on pose where tension occurs"],
                    "fold_type": "string (Tubular/ZigZag/Spiral)",
                    "instruction": "Strict instruction for the renderer on how to draw the folds."
                }
            }
        `;

        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { inlineData: { mimeType: imgData.mimeType, data: imgData.data } },
                    { text: instructions }
                ]
            },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Failed to analyze fabric physics");
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Fabric Physics Analysis Error:", error);
        throw error;
    }
};

/**
 * AUTO PHYSICS INFERENCE
 * Infers fabric physics from text prompt if no swatch is provided.
 */
export const inferAutoPhysics = async (
    userPrompt: string,
    referenceImage: string | null
): Promise<any> => {
    try {
        const parts: any[] = [];
        if (referenceImage) {
            const imgData = processImage(referenceImage);
            if (imgData) parts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
        }

        const instructions = `
            SYSTEM: PHYSICS SIMULATION ENGINE (INFERENCE MODE).
            TASK: Infer the likely FABRIC PHYSICS based on the text prompt below.
            PROMPT: "${userPrompt}"
            
            MANDATE: Ensure physical correctness. If prompt says "silk", simulate fluid drape. If "denim", simulate rigid folds.
            
            OUTPUT FORMAT (JSON ONLY):
            {
                "fabric_physics": {
                    "weight_class": "string",
                    "drape_coefficient": "number",
                    "stiffness": "number",
                    "wrinkle_frequency": "string",
                    "description": "Inferred physical behavior description."
                },
                "wrinkle_map_logic": {
                    "stress_points": ["General body stress points"],
                    "fold_type": "string",
                    "instruction": "Instruction for fold rendering."
                }
            }
        `;
        parts.push({ text: instructions });

        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null; // Fail silently if model refuses, fall back to defaults
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.warn("Auto Physics Inference failed:", error);
        return null;
    }
};

/**
 * ENVIRONMENT LIGHTING ANALYSIS (IBL)
 * Extracts HDR lighting context from an environment image.
 */
export const analyzeEnvironmentLighting = async (
    envImage: string
): Promise<any> => {
    try {
        const imgData = processImage(envImage);
        if (!imgData) throw new Error("Invalid environment image");

        const instructions = `
            SYSTEM: IBL (IMAGE BASED LIGHTING) ANALYZER.
            TASK: Analyze the attached ENVIRONMENT image to extract lighting context for compositing.
            
            EXTRACT:
            1. KEY LIGHT: Direction, intensity, and color temperature.
            2. DIFFUSE AMBIENT: The average shadow color.
            3. REFLECTIONS: High-frequency details for glossy surfaces.
            
            OUTPUT FORMAT (JSON ONLY):
            {
                "light_context": {
                    "key_light_vector": "string (e.g., 'Top-Right, Hard Sun')",
                    "diffuse_ambient_color": "string (Hex or Desc)",
                    "reflection_complexity": "string (Low/High)",
                    "description": "Detailed instruction on how to relight an object placed in this scene."
                },
                "composite_logic": {
                    "shadow_direction": "string",
                    "color_bleed_instruction": "string (e.g., 'Add slight green tint to lower shadows')"
                }
            }
        `;

        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { inlineData: { mimeType: imgData.mimeType, data: imgData.data } },
                    { text: instructions }
                ]
            },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Failed to analyze environment lighting");
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Environment Lighting Analysis Error:", error);
        throw error;
    }
};

/**
 * DEFAULT STUDIO LIGHTING
 * Returns a high-quality preset for mandatory lighting pipeline.
 */
export const getDefaultStudioLighting = (): any => {
    return {
        "light_context": {
            "key_light_vector": "Top-Left 45deg, Softbox",
            "diffuse_ambient_color": "#EFEFEF",
            "reflection_complexity": "Studio Soft",
            "description": "Professional neutral studio lighting. Soft key light from top-left, balanced fill, clean highlights."
        },
        "composite_logic": {
            "shadow_direction": "Diagonal Right",
            "color_bleed_instruction": "Neutral gray shadow falloff, no color contamination."
        }
    };
};

/**
 * Detects user intent for pose transfer from text prompt.
 * Returns whether pose should be extracted from reference or main image.
 */
const detectPoseTransferIntent = (prompt: string): 'from_reference' | 'from_main' => {
    if (!prompt) return 'from_main';

    const lowerPrompt = prompt.toLowerCase();

    // Keywords indicating pose should come from reference
    const refPoseKeywords = [
        /copy.*pose.*from.*ref/i,
        /transfer.*pose.*from.*ref/i,
        /use.*pose.*from.*ref/i,
        /apply.*pose.*from.*ref/i,
        /pose.*of.*ref/i,
        /ref.*pose/i,
        /pose.*from.*reference/i,
        /reference.*pose/i,
        /copy.*pose.*reference/i,
        /paste.*pose.*from.*ref/i
    ];

    for (const pattern of refPoseKeywords) {
        if (pattern.test(lowerPrompt)) {
            return 'from_reference';
        }
    }

    return 'from_main'; // Default behavior
};

/**
 * Generates/Edits a design based on sketches, brush strokes, and prompt.
 * HARDENED AGAINST REFUSALS: Uses Strict Command Mode prompting.
 */
/**
 * EXTRACT POSE DATA (Background Process)
 * Automatically analyzes the main subject to lock pose.
 */
export const extractPoseData = async (
    imageUrl: string
): Promise<any> => {
    try {
        const imgData = processImage(imageUrl);
        if (!imgData) throw new Error("Invalid image for pose extraction");

        // Check Cache (In-memory simple cache could be added here, relying on nodeEngine cache for now)

        const instructions = `
            SYSTEM: POSE EXTRACTION ENGINE.
            TASK: Analyze the image and extract the human pose structure.
            
            OUTPUT FORMAT (JSON ONLY):
            {
                "pose_data": {
                    "type": "ControlNet/OpenPose",
                    "strength": 1.0,
                    "description": "Detailed description of the body position, limb angles, and gesture.",
                    "key_points": "List of visible keypoints (e.g. 'head, shoulders, left-arm-raised')"
                }
            }
        `;

        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { inlineData: { mimeType: imgData.mimeType, data: imgData.data } },
                    { text: instructions }
                ]
            },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Failed to extract pose data");
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.warn("Pose Extraction Failed (Non-fatal):", error);
        return null;
    }
};

/**
 * Generates/Edits a design based on sketches, brush strokes, and prompt.
 * HARDENED AGAINST REFUSALS: Uses Strict Command Mode prompting.
 */
export const enhanceSketch = async (
    mainImage: string | null,
    refImage: string | null,
    userPrompt: string,
    config?: {
        objectAdherence?: number;
        targetPlacement?: string;
        realismWeight?: number;
        // Visual Control Params
        visualLightData?: any;
        visualCameraData?: any;
    },
    maskImage?: string | null,
    autoPoseData?: any,
    autoPhysicsData?: any,
    coherenceData?: any,
    controlMaps?: ControlMaps
): Promise<string> => {
    try {
        console.log("[enhanceSketch] Starting generation...");
        const parts: any[] = [];

        // Process Images
        const processedMain = mainImage ? processImage(mainImage) : null;
        const processedRef = refImage ? processImage(refImage) : null;
        const processedMask = maskImage ? processImage(maskImage) : null;

        if (mainImage && !processedMain) console.warn("Gemini Service: Main Image invalid/unsupported.");
        if (refImage && !processedRef) console.warn("Gemini Service: Ref Image invalid/unsupported.");
        if (maskImage && !processedMask) console.warn("Gemini Service: Mask Image invalid/unsupported.");

        // Process Control Maps
        const processedShadow = controlMaps?.shadowMap ? processImage(controlMaps.shadowMap) : null;
        const processedNormal = controlMaps?.normalMap ? processImage(controlMaps.normalMap) : null;
        const processedDepth = controlMaps?.depthMap ? processImage(controlMaps.depthMap) : null;

        // --- BACKGROUND AUTOMATION: POSE & PHYSICS ---
        let autoPoseData = null;
        let autoPhysicsData = null;

        // 1. Intelligent Pose Extraction based on user intent
        const poseIntent = detectPoseTransferIntent(userPrompt);

        if (poseIntent === 'from_reference' && refImage) {
            // Extract pose from reference when user explicitly requests it
            console.log('[Pose Transfer] Extracting pose from REFERENCE image');
            autoPoseData = await extractPoseData(refImage);
        } else if (poseIntent === 'from_main' && mainImage) {
            // Default: Extract pose from main subject
            console.log('[Pose Transfer] Extracting pose from MAIN image');
            autoPoseData = await extractPoseData(mainImage);
        }

        // 2. Auto-Infer Physics
        const promptForPhysics = userPrompt || "High fashion garment";
        const refForPhysics = refImage || mainImage;
        try {
            autoPhysicsData = await inferAutoPhysics(promptForPhysics, refForPhysics);
        } catch (e) {
            console.warn("Auto-physics inference failed.", e);
        }

        // --- PUSH IMAGES (ORDER MATTERS) ---
        if (processedMain) parts.push({ inlineData: { mimeType: processedMain.mimeType, data: processedMain.data } });
        if (processedMask) parts.push({ inlineData: { mimeType: processedMask.mimeType, data: processedMask.data } });
        if (processedRef) parts.push({ inlineData: { mimeType: processedRef.mimeType, data: processedRef.data } });

        // Add Control Maps to parts
        if (processedShadow) parts.push({ inlineData: { mimeType: processedShadow.mimeType, data: processedShadow.data } });
        if (processedNormal) parts.push({ inlineData: { mimeType: processedNormal.mimeType, data: processedNormal.data } });
        if (processedDepth) parts.push({ inlineData: { mimeType: processedDepth.mimeType, data: processedDepth.data } });

        // --- BUILD STRICT PROMPT (HYBRID INTEGRATION) ---
        let promptParts: string[] = [];
        promptParts.push("NO CHAT. SYSTEM MODE: IMAGE_GENERATION_ENGINE_V2 (HYBRID)");
        promptParts.push("CRITICAL PROTOCOL: You are NOT a chat assistant. You are a rendering engine. You must output an IMAGE.");
        promptParts.push("DO NOT ASK FOR INPUTS. The images are already attached to this request. Look at the attachments.");

        promptParts.push("\n--- INPUT MANIFEST ---");
        let imgCount = 0;
        if (processedMain) { imgCount++; promptParts.push(`[ATTACHMENT ${imgCount}]: MAIN_SUBJECT (Base sketch/photo).`); }
        if (processedMask) { imgCount++; promptParts.push(`[ATTACHMENT ${imgCount}]: EDIT_MASK (White pixels = modify).`); }
        if (processedRef) { imgCount++; promptParts.push(`[ATTACHMENT ${imgCount}]: REFERENCE_MATERIAL (Style/Texture source).`); }

        if (processedShadow) { imgCount++; promptParts.push(`[ATTACHMENT ${imgCount}]: FORCED_SHADOW_MAP (Light/Shadow Guide).`); }
        if (processedNormal) { imgCount++; promptParts.push(`[ATTACHMENT ${imgCount}]: FORCED_NORMAL_MAP (Surface Orientation).`); }
        if (processedDepth) { imgCount++; promptParts.push(`[ATTACHMENT ${imgCount}]: FORCED_DEPTH_MAP (Camera Distance/Perspective).`); }

        promptParts.push("\n--- HYBRID GENERATION PROTOCOL ---");
        promptParts.push("You must execute this generation in two logical phases to resolve conflicts between Style and Structure.");

        // VISUAL CONTROLS INJECTION (MOVED EARLY FOR PRIORITY)
        if (config?.visualLightData) {
            // Check if multi-light setup
            if (config.visualLightData.lights && Array.isArray(config.visualLightData.lights)) {
                // MULTI-LIGHT SETUP
                const lights = config.visualLightData.lights;
                promptParts.push(`\n>>> CRITICAL MULTI-LIGHT SETUP <<<`);
                promptParts.push(`LIGHTING TYPE: Professional ${lights.length}-Point Lighting`);

                lights.forEach((light, index) => {
                    const lightNum = index + 1;
                    const lightName = lightNum === 1 ? 'KEY LIGHT' : lightNum === 2 ? 'FILL LIGHT' : 'RIM LIGHT';
                    promptParts.push(`\nLIGHT ${lightNum} (${lightName}): ${light.preset || 'Custom lighting'}`);
                    promptParts.push(`- Position: Azimuth=${light.azimuth}°, Elevation=${light.elevation}°`);
                });

                promptParts.push(`\nLIGHTING INTERACTION: All lights work together to create dimensional, professional lighting.`);
                promptParts.push(`SHADOW BEHAVIOR: Primary light creates main shadows, additional lights soften and fill.`);
                promptParts.push(`ENFORCEMENT: You MUST position ALL light sources EXACTLY as specified.`);
                promptParts.push(`OVERRIDE PRIORITY: This multi-light directive overrides any lighting suggestions from the text prompt.`);

            } else {
                // SINGLE LIGHT SETUP (backward compatibility)
                const { LIGHT_PRESETS } = await import('../presets');
                const matchingPreset = LIGHT_PRESETS.find(p =>
                    p.azimuth === config.visualLightData.azimuth &&
                    p.elevation === config.visualLightData.elevation
                );

                const lightingPrompt = matchingPreset?.prompt || translateLightAngle(config.visualLightData);
                promptParts.push(`\n>>> CRITICAL LIGHTING OVERRIDE <<<`);
                promptParts.push(`MANDATORY LIGHT SETUP: ${lightingPrompt}`);
                promptParts.push(`LIGHTING ENFORCEMENT: You MUST position the primary light source EXACTLY as specified above.`);
                promptParts.push(`SHADOW ENFORCEMENT: Shadows MUST fall in the direction specified. This is NON-NEGOTIABLE.`);
                promptParts.push(`TECHNICAL SPEC: Light angle azimuth=${config.visualLightData.azimuth}°, elevation=${config.visualLightData.elevation}°`);
                promptParts.push(`OVERRIDE PRIORITY: This lighting directive overrides any lighting suggestions from the text prompt.`);
                promptParts.push(`VERIFICATION: The final image MUST show highlights and shadows consistent with the specified light position.`);
            }

            // CRITICAL SHADOW GENERATION (applies to both single and multi-light)
            promptParts.push(`\n>>> CRITICAL SHADOW REQUIREMENTS <<<`);
            promptParts.push(`GROUND SHADOW: The subject MUST cast a visible shadow on the ground/floor.`);
            promptParts.push(`SHADOW DIRECTION: Shadow must fall on the OPPOSITE side from the light source.`);
            promptParts.push(`SHADOW VISIBILITY: Shadow must be clearly visible, not faint or invisible.`);
            promptParts.push(`CONTACT SHADOW: There must be a dark contact shadow where the subject touches the ground.`);
            promptParts.push(`SHADOW SOFTNESS: Shadow edges should be soft and natural, not hard-edged.`);
            promptParts.push(`SHADOW COLOR: Shadow should be a darker version of the ground color, not pure black.`);
            promptParts.push(`VERIFICATION: The final image MUST show a clear, visible shadow cast by the subject.`);
        }

        if (config?.visualCameraData) {
            // Try to find matching preset for direct prompt use
            const { CAMERA_PRESETS } = await import('../presets');
            const matchingPreset = CAMERA_PRESETS.find(p =>
                p.heightRatio === config.visualCameraData.heightRatio &&
                p.distance === config.visualCameraData.distance
            );

            const cameraPrompt = matchingPreset?.prompt || translateCameraAngle(config.visualCameraData);
            promptParts.push(`\n--- CAMERA DIRECTIVE ---`);
            promptParts.push(`FRAMING: ${cameraPrompt}`);
        }

        // --- CRITICAL POSE LOCK (MOVED EARLY FOR MAXIMUM PRIORITY) ---
        if (autoPoseData && autoPoseData.pose_data) {
            const poseSource = poseIntent === 'from_reference' ? 'REFERENCE_MATERIAL' : 'MAIN_SUBJECT';

            promptParts.push(`\n>>> CRITICAL POSE TRANSFER OVERRIDE <<<`);
            promptParts.push(`STATUS: HARD LOCK - NON-NEGOTIABLE`);
            promptParts.push(`POSE SOURCE: ${poseSource}`);
            promptParts.push(`POSE DESCRIPTION: ${autoPoseData.pose_data.description}`);

            if (poseIntent === 'from_reference') {
                // User wants to copy pose FROM reference TO main subject
                promptParts.push(`CRITICAL MANDATE: You MUST apply the EXACT pose from the REFERENCE_MATERIAL to the subject in MAIN_SUBJECT.`);
                promptParts.push(`TRANSFER INSTRUCTION: Copy the body position, limb angles, and gesture from REFERENCE_MATERIAL and apply to the main subject.`);
                promptParts.push(`PRESERVE FROM MAIN: Only keep the subject's identity, clothing, and styling from MAIN_SUBJECT.`);
                promptParts.push(`CHANGE FROM REFERENCE: Apply the complete body pose, stance, and positioning from REFERENCE_MATERIAL.`);
                promptParts.push(`DO NOT: Keep the original pose from MAIN_SUBJECT. The pose MUST match REFERENCE_MATERIAL.`);
            } else {
                // Default: preserve main subject's pose
                promptParts.push(`CRITICAL MANDATE: You MUST preserve the EXACT body position, limb angles, and gesture of the MAIN_SUBJECT.`);
                promptParts.push(`DO NOT ALTER: Head position, arm position, leg position, torso orientation, hand gestures, facial direction.`);
                promptParts.push(`ONLY MODIFY: Add the requested object/accessory WITHOUT changing the underlying pose.`);
            }

            promptParts.push(`VERIFICATION: The final image MUST show the pose from ${poseSource}.`);
            promptParts.push(`OVERRIDE PRIORITY: This pose constraint overrides ANY pose suggestions from the text prompt.`);
        }

        // PHASE 1: CONCEPT ENCODING
        promptParts.push("\n>>> PHASE 1: CONCEPT ENCODING (PRIORITY: HIGH)");
        promptParts.push(`CONCEPT PROMPT: "${userPrompt}"`);
        promptParts.push("INSTRUCTION: First, establish the visual style, material, and subject matter defined in the CONCEPT PROMPT.");
        promptParts.push("The 'Initial Latent Vector' must be fully aligned with this textual description (e.g., if prompt says 'neon cyberpunk', the base concept MUST be neon cyberpunk).");

        // PHASE 2: STRUCTURAL CONSTRAINT
        promptParts.push("\n>>> PHASE 2: STRUCTURAL CONSTRAINT (PRIORITY: CRITICAL)");
        if (controlMaps) {
            promptParts.push("INSTRUCTION: Now, enforce the physical lighting and geometry from the CONTROL MAPS onto the Concept.");
            if (processedShadow) promptParts.push("- SHADOW MAP: You MUST align all lighting and shadows EXACTLY to the attached Shadow Map. This overrides any default lighting from the concept.");
            if (processedNormal) promptParts.push("- NORMAL MAP: You MUST respect the surface orientation defined in the Normal Map.");
            if (processedDepth) promptParts.push("- DEPTH MAP: You MUST respect the perspective and depth defined in the Depth Map.");
        } else {
            promptParts.push("No external structural maps provided. Infer structure from MAIN_SUBJECT.");
        }

        promptParts.push("\n--- GENERATION TASK ---");
        const adherence = config?.objectAdherence ?? 0.8;
        const placement = config?.targetPlacement || "logical position";
        const realism = config?.realismWeight ?? 1.0;

        if (processedMask && processedMain) {
            promptParts.push(`TYPE: INPAINT_EDIT`);
            promptParts.push(`TARGET: Modify ONLY the white area of the Mask.`);
            promptParts.push(`CONTEXT: The rest of the Main Subject MUST remain unchanged.`);
            if (processedRef) promptParts.push(`ACTION: Transfer the REFERENCE_MATERIAL into the masked area.`);
            else promptParts.push(`ACTION: Generate new content in the masked area.`);
        } else if (processedRef && processedMain) {
            promptParts.push(`TYPE: COMPOSITE_MERGE`);
            promptParts.push(`ACTION: Apply the REFERENCE_MATERIAL onto the MAIN_SUBJECT.`);
            promptParts.push(`BLENDING: ${(adherence * 100).toFixed(0)}% strict adherence.`);
        } else if (processedRef && !processedMain) {
            promptParts.push(`TYPE: STYLE_TRANSFER`);
            promptParts.push(`ACTION: Create a new image using REFERENCE_MATERIAL as source.`);
        } else if (processedMain) {
            promptParts.push(`TYPE: ENHANCEMENT`);
            promptParts.push(`ACTION: Render the MAIN_SUBJECT into a photorealistic image.`);
        } else {
            promptParts.push(`TYPE: TEXT_TO_IMAGE`);
            promptParts.push(`ACTION: Generate a high-fashion image from scratch.`);
        }

        // --- LIGHTING ATMOSPHERE ---
        if (config?.visualLightData) {
            promptParts.push(`\n--- LIGHTING ATMOSPHERE ---`);
            promptParts.push(`Cinematic light cast on the subject, creating strong contrast and deep, soft shadows.`);
            promptParts.push(`High dynamic range (HDR), moody and atmospheric lighting.`);
            promptParts.push(`Volumetric light rays, professional studio quality illumination.`);
        }

        // --- CAMERA COMPOSITION ---
        if (config?.visualCameraData) {
            promptParts.push(`\n--- CAMERA COMPOSITION ---`);
            promptParts.push(`The background is softly blurred (shallow depth of field), focusing entirely on the subject.`);
            promptParts.push(`Professional framing and composition.`);
        }

        // --- PBR FABRIC PHYSICS ---
        if (autoPhysicsData && autoPhysicsData.fabric_physics) {
            promptParts.push(`\n--- PBR FABRIC PHYSICS ---`);
            promptParts.push(`MATERIAL WEIGHT: ${autoPhysicsData.fabric_physics.weight_class}`);
            promptParts.push(`DRAPE LOGIC: ${autoPhysicsData.fabric_physics.description}`);
        }

        promptParts.push(`\n--- TECHNICAL QUALITY SPECIFICATIONS ---`);
        promptParts.push(`QUALITY: Photorealistic, 8K resolution, highly detailed texture, sharp focus, professionally color-graded.`);
        promptParts.push(`RENDERING: Volumetric light, rendered in Octane Render quality, using Sony A7R IV camera simulation.`);
        promptParts.push(`STYLE: High Fashion Editorial, professional photography, magazine quality.`);
        promptParts.push(`REALISM WEIGHT: ${(realism * 100).toFixed(0)}%.`);

        promptParts.push(`\n--- NEGATIVE CONSTRAINTS (AVOID) ---`);
        promptParts.push(`DO NOT INCLUDE: Ugly, tiling, poorly drawn, out of frame, blurry, low resolution, watermark, amateur quality.`);
        promptParts.push(`DO NOT INCLUDE: Low quality shadows, harsh reflection, oversaturated colors, noise, artifacts.`);
        promptParts.push(`DO NOT INCLUDE: Distorted proportions, unrealistic lighting, flat lighting, muddy colors.`);

        promptParts.push(`\n--- FINAL OUTPUT MANDATE ---`);

        promptParts.push(`\n--- MANDATE ---`);
        promptParts.push(`EXECUTE GENERATION IMMEDIATELY.`);

        parts.push({ text: promptParts.join('\n') });

        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const candidate = response.candidates?.[0];
        if (!candidate) throw new Error("No response candidates returned.");

        if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("No image generated.");

    } catch (error) {
        console.error("Gemini Enhancement Error:", error);
        throw error;
    }
};

/**
 * Visualizes the design on a model/body.
 */
export const visualizeOnModel = async (
    imageDataUrl: string,
    userPrompt: string
): Promise<string> => {
    try {
        const imgData = processImage(imageDataUrl);
        if (!imgData) throw new Error("Invalid image input provided for visualization");

        // WRAP API CALL IN RETRY LOGIC
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: imgData.mimeType,
                            data: imgData.data,
                        },
                    },
                    {
                        text: `SYSTEM MODE: VISUALIZATION_RENDERER.
            CRITICAL: You are a fashion rendering engine. You are NOT a chat bot.
            
            INPUT: The image above is a flat design or sketch.
            TASK: Render this design worn by a realistic fashion model.
            CONTEXT: ${userPrompt}
            STYLE: Editorial fashion photography, 8k resolution.
            
            MANDATE: Output an IMAGE only. Do not speak. If the design is abstract, interpret it creatively.`
                    },
                ],
            },
            config: { safetySettings: SAFETY_SETTINGS }
        }));

        const candidate = response.candidates?.[0];
        if (!candidate) throw new Error("No response candidates returned.");

        if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("No visualization generated. Model refusal.");

    } catch (error) {
        console.error("Gemini Visualization Error:", error);
        throw error;
    }
};
