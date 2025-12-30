import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { filters as fabricFilters } from 'fabric';
import { Layer, ActiveTool } from '../types';

interface FabricCanvasProps {
    width: number;
    height: number;
    layers: Layer[];
    onLayerUpdate: (id: string, updates: Partial<Layer>) => void;
    onSelectionChange: (selectedId: string | null) => void;
    selectedLayerId: string | null;
    activeTool: ActiveTool;
    onCrop?: (rect: { x: number, y: number, width: number, height: number }) => void;
    brushColor?: string;
    brushSize?: number;
    viewScale?: number;
    posePoints?: { handle: { x: number, y: number }, target?: { x: number, y: number } }[];
    onPosePointsChange?: (points: { handle: { x: number, y: number }, target?: { x: number, y: number } }[]) => void;
}

// Helper to calculate LUT for a single channel
function calculateSingleChannelLUT(points: { x: number; y: number }[]): Uint8Array {
    const lut = new Uint8Array(256);
    if (!points || points.length < 2) {
        // console.log('[FabricCanvas] calculateSingleChannelLUT: No points or insufficient points', points);
        return lut.map((_, i) => i);
    }
    // console.log('[FabricCanvas] calculateSingleChannelLUT: Points', points);

    // Sort points
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const n = sorted.length;
    
    // Monotonic Cubic Spline Interpolation
    const m = new Array(n).fill(0);
    const dx = new Array(n - 1).fill(0);
    const dy = new Array(n - 1).fill(0);
    const slope = new Array(n - 1).fill(0);

    for (let i = 0; i < n - 1; i++) {
        dx[i] = sorted[i + 1].x - sorted[i].x;
        dy[i] = sorted[i + 1].y - sorted[i].y;
        slope[i] = dy[i] / dx[i];
    }

    m[0] = slope[0];
    for (let i = 1; i < n - 1; i++) {
        if (slope[i - 1] * slope[i] <= 0) {
            m[i] = 0;
        } else {
            const common = dx[i - 1] + dx[i];
            m[i] = (3 * common) / ((common + dx[i]) / slope[i - 1] + (common + dx[i - 1]) / slope[i]);
        }
    }
    m[n - 1] = slope[n - 2];

    let pIndex = 0;
    for (let i = 0; i < 256; i++) {
        const x = i / 255;
        
        while (pIndex < n - 1 && x > sorted[pIndex + 1].x) {
            pIndex++;
        }
        
        let val;
        if (x <= sorted[0].x) {
            val = sorted[0].y;
        } else if (x >= sorted[n - 1].x) {
            val = sorted[n - 1].y;
        } else {
            const p0 = sorted[pIndex];
            const p1 = sorted[pIndex + 1];
            const h = p1.x - p0.x;
            const t = (x - p0.x) / h;
            const t2 = t * t;
            const t3 = t2 * t;

            const h00 = 2 * t3 - 3 * t2 + 1;
            const h10 = t3 - 2 * t2 + t;
            const h01 = -2 * t3 + 3 * t2;
            const h11 = t3 - t2;

            val = h00 * p0.y + h10 * h * m[pIndex] + h01 * p1.y + h11 * h * m[pIndex + 1];
        }
        lut[i] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
    return lut;
}

// Calculate combined RGBA LUT
export function calculateCurvesLUT(curves: { 
    master?: { x: number; y: number }[],
    red?: { x: number; y: number }[],
    green?: { x: number; y: number }[],
    blue?: { x: number; y: number }[]
}): Uint8Array {
    const masterLUT = calculateSingleChannelLUT(curves.master || []);
    const redLUT = calculateSingleChannelLUT(curves.red || []);
    const greenLUT = calculateSingleChannelLUT(curves.green || []);
    const blueLUT = calculateSingleChannelLUT(curves.blue || []);

    const combinedLUT = new Uint8Array(256 * 4);

    for (let i = 0; i < 256; i++) {
        // Apply Channel Curve then Master Curve
        // Output = Master(Channel(Input))
        
        const r = masterLUT[redLUT[i]];
        const g = masterLUT[greenLUT[i]];
        const b = masterLUT[blueLUT[i]];
        
        combinedLUT[i * 4] = r;
        combinedLUT[i * 4 + 1] = g;
        combinedLUT[i * 4 + 2] = b;
        combinedLUT[i * 4 + 3] = 255; // Alpha channel (not used for lookup usually, but needed for texture format)
    }

    return combinedLUT;
}

// WebGL Curves Filter
class Curves_v3 extends fabric.filters.BaseFilter {
    static type = 'Curves_v3';
    
    // Fragment shader for WebGL
    // We use a 1D texture (256x1) to look up color values
    // Updated shader to use color values for lookup (Fix for stripes)
    fragmentSource = `
        precision highp float;
        uniform sampler2D uTexture;
        uniform sampler2D uCurveTexture;
        varying vec2 vTexCoord;

        void main() {
            vec4 color = texture2D(uTexture, vTexCoord);
            
            // DEBUG: Output the LUT texture directly to verify binding
            // We use vTexCoord.x to sample the LUT across the screen
            // If correct, we should see a gradient bar representing the curves
            // gl_FragColor = texture2D(uCurveTexture, vec2(vTexCoord.x, 0.5));
            // return;

            // Look up each channel in the curve texture
            // The texture is 256 pixels wide.
            // We map color value (0.0-1.0) to texture coordinate (0.0-1.0).
            
            float r = texture2D(uCurveTexture, vec2(color.r, 0.5)).r;
            float g = texture2D(uCurveTexture, vec2(color.g, 0.5)).g;
            float b = texture2D(uCurveTexture, vec2(color.b, 0.5)).b;
            
            gl_FragColor = vec4(r, g, b, color.a);
        }
    `;

    lut: Uint8Array;

    constructor(options: { lut?: Uint8Array } = {}) {
        super(options);
        console.log('Curves_v3 initialized');
        this.lut = options.lut || new Uint8Array(256 * 4).map((_, i) => i % 4 === 3 ? 255 : (i >> 2));
    }

    isNeutralState() {
        return false; // Force application
    }

    getFragmentSource() {
        return this.fragmentSource;
    }

    applyTo(options: any) {
        if (options.webgl) {
            // super.applyTo should handle the lifecycle if fragmentSource is correctly detected
            super.applyTo(options);
        }
    }

    // Fabric v6: Use getUniformLocations and sendUniformData
    getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        if (!program) {
            return { uCurveTexture: null };
        }
        return {
            uCurveTexture: gl.getUniformLocation(program, 'uCurveTexture'),
        };
    }

    sendUniformData(gl: WebGLRenderingContext, uniformLocations: any) {
        console.log('[Curves_v3] sendUniformData called', uniformLocations);
        // Bind to texture unit 5 to avoid conflicts with Fabric's internal units
        gl.activeTexture(gl.TEXTURE5);
        
        // Create texture (Note: In production, we should cache this)
        const texture = this.createTexture(gl, this.lut);
        
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Set uniform
        if (uniformLocations.uCurveTexture !== null) {
            gl.uniform1i(uniformLocations.uCurveTexture, 5);
        } else {
            console.warn('[Curves_v3] uCurveTexture uniform location not found!');
            // Fallback for manual uniform setting if getUniformLocations failed/wasn't called
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            const loc = gl.getUniformLocation(program, 'uCurveTexture');
            if (loc) {
                gl.uniform1i(loc, 5);
            }
        }
        
        // Restore active texture to 0 for Fabric's main flow
        gl.activeTexture(gl.TEXTURE0);
    }
    
    createTexture(gl: WebGLRenderingContext, data: Uint8Array) {
        console.log('[Curves_v3] createTexture called');
        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Use NEAREST to avoid interpolation artifacts in LUT
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        gl.texImage2D(
            gl.TEXTURE_2D, 
            0, 
            gl.RGBA, 
            256, 
            1, 
            0, 
            gl.RGBA, 
            gl.UNSIGNED_BYTE, 
            data
        );
        
        return texture;
    }

    toObject() {
        return {
            type: 'Curves_v3',
            lut: Array.from(this.lut)
        };
    }
}

// WebGL Color Balance Filter
class ColorBalanceFilter extends fabric.filters.BaseFilter {
    static type = 'ColorBalance';

    // Fragment shader
    fragmentSource = `
        precision highp float;
        uniform sampler2D uTexture;
        uniform vec3 uShadows;
        uniform vec3 uMidtones;
        uniform vec3 uHighlights;
        uniform int uPreserveLuminosity;
        varying vec2 vTexCoord;

        // Helper to calculate luminosity
        float getLuminosity(vec3 color) {
            return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }

        // Helper to apply color balance
        vec3 applyColorBalance(vec3 color, vec3 shadows, vec3 midtones, vec3 highlights) {
            // Calculate luminosity for tonal range masking
            float luma = getLuminosity(color);

            // Smoothstep for tonal ranges
            // Shadows: 0.0 - 0.33
            // Midtones: 0.33 - 0.66
            // Highlights: 0.66 - 1.0
            
            float shadowMask = 1.0 - smoothstep(0.0, 0.33, luma);
            float highlightMask = smoothstep(0.66, 1.0, luma);
            float midtoneMask = 1.0 - shadowMask - highlightMask;

            vec3 newColor = color;

            // Apply shifts
            newColor += shadows * shadowMask;
            newColor += midtones * midtoneMask;
            newColor += highlights * highlightMask;

            return newColor;
        }

        void main() {
            vec4 color = texture2D(uTexture, vTexCoord);
            vec3 rgb = color.rgb;

            float originalLuma = getLuminosity(rgb);

            // Apply color balance
            // Inputs are -1.0 to 1.0, but usually small shifts like +/- 0.2 are enough
            // We scale the inputs in the JS side or here. Let's assume inputs are normalized -1 to 1.
            // For subtle control, we might scale them down.
            
            vec3 balanced = applyColorBalance(rgb, uShadows, uMidtones, uHighlights);

            if (uPreserveLuminosity == 1) {
                float newLuma = getLuminosity(balanced);
                float lumaDiff = originalLuma - newLuma;
                balanced += lumaDiff;
            }

            gl_FragColor = vec4(clamp(balanced, 0.0, 1.0), color.a);
        }
    `;

    shadows: [number, number, number];
    midtones: [number, number, number];
    highlights: [number, number, number];
    preserveLuminosity: boolean;

    constructor(options: { 
        shadows?: [number, number, number], 
        midtones?: [number, number, number], 
        highlights?: [number, number, number],
        preserveLuminosity?: boolean 
    } = {}) {
        super(options);
        console.log('[ColorBalance] Initialized', options);
        this.shadows = options.shadows || [0, 0, 0];
        this.midtones = options.midtones || [0, 0, 0];
        this.highlights = options.highlights || [0, 0, 0];
        this.preserveLuminosity = options.preserveLuminosity || false;
    }

    isNeutralState() {
        return false; // Force application for debugging
    }

    getFragmentSource() {
        return this.fragmentSource;
    }

    applyTo(options: any) {
        if (options.webgl) {
            console.log('[ColorBalance] applyTo called (WebGL)');
            super.applyTo(options);
        } else {
            console.log('[ColorBalance] applyTo called (Canvas2D) - Not supported');
        }
    }

    getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        console.log('[ColorBalance] getUniformLocations called');
        if (!program) return {};
        return {
            uShadows: gl.getUniformLocation(program, 'uShadows'),
            uMidtones: gl.getUniformLocation(program, 'uMidtones'),
            uHighlights: gl.getUniformLocation(program, 'uHighlights'),
            uPreserveLuminosity: gl.getUniformLocation(program, 'uPreserveLuminosity'),
        };
    }

    sendUniformData(gl: WebGLRenderingContext, uniformLocations: any) {
        console.log('[ColorBalance] sendUniformData called', this.shadows, this.midtones, this.highlights);
        // Scale values from -100..100 to -0.2..0.2 for subtle effect, or larger if needed.
        // Photoshop-like behavior usually allows stronger shifts. Let's try scaling by 0.005 (100 * 0.005 = 0.5 shift)
        const scale = 0.002; 

        if (uniformLocations.uShadows) gl.uniform3fv(uniformLocations.uShadows, this.shadows.map(v => v * scale));
        if (uniformLocations.uMidtones) gl.uniform3fv(uniformLocations.uMidtones, this.midtones.map(v => v * scale));
        if (uniformLocations.uHighlights) gl.uniform3fv(uniformLocations.uHighlights, this.highlights.map(v => v * scale));
        if (uniformLocations.uPreserveLuminosity) gl.uniform1i(uniformLocations.uPreserveLuminosity, this.preserveLuminosity ? 1 : 0);
    }

    toObject() {
        return {
            type: 'ColorBalance',
            shadows: this.shadows,
            midtones: this.midtones,
            highlights: this.highlights,
            preserveLuminosity: this.preserveLuminosity
        };
    }
}

class SelectiveColorFilter extends fabric.filters.BaseFilter {
    static type = 'SelectiveColor';

    fragmentSource = `
        precision highp float;
        uniform sampler2D uTexture;
        uniform int uRelative;
        
        // Adjustments for each range: Cyan, Magenta, Yellow, Black
        uniform vec4 uReds;
        uniform vec4 uYellows;
        uniform vec4 uGreens;
        uniform vec4 uCyans;
        uniform vec4 uBlues;
        uniform vec4 uMagentas;
        uniform vec4 uWhites;
        uniform vec4 uNeutrals;
        uniform vec4 uBlacks;

        varying vec2 vTexCoord;

        float getMax(float r, float g, float b) {
            return max(r, max(g, b));
        }

        float getMin(float r, float g, float b) {
            return min(r, min(g, b));
        }

        void main() {
            vec4 color = texture2D(uTexture, vTexCoord);
            float r = color.r;
            float g = color.g;
            float b = color.b;

            float maxVal = getMax(r, g, b);
            float minVal = getMin(r, g, b);
            float lum = (maxVal + minVal) * 0.5; // Simple lightness approximation

            // Calculate range masks (0.0 to 1.0)
            // Logic derived from standard selective color algorithms

            float diff = maxVal - minVal;

            // Reds: Predominantly Red, less Green/Blue
            float reds = (maxVal == r) ? (maxVal - max(g, b)) : 0.0;
            
            // Yellows: Red + Green, less Blue
            float yellows = (minVal == b) ? (min(r, g) - b) : 0.0;

            // Greens: Predominantly Green, less Red/Blue
            float greens = (maxVal == g) ? (maxVal - max(r, b)) : 0.0;

            // Cyans: Green + Blue, less Red
            float cyans = (minVal == r) ? (min(g, b) - r) : 0.0;

            // Blues: Predominantly Blue, less Red/Green
            float blues = (maxVal == b) ? (maxVal - max(r, g)) : 0.0;

            // Magentas: Red + Blue, less Green
            float magentas = (minVal == g) ? (min(r, b) - g) : 0.0;

            // Sharpen the selection masks to avoid affecting neutrals too much
            // Squaring the factor suppresses small values (low saturation)
            // reds = reds * reds;
            // yellows = yellows * yellows;
            // greens = greens * greens;
            // cyans = cyans * cyans;
            // blues = blues * blues;
            // magentas = magentas * magentas;

            // Whites: High brightness
            float whites = (r > 0.5 && g > 0.5 && b > 0.5) ? (minVal - 0.5) * 2.0 : 0.0;
            whites = clamp(whites, 0.0, 1.0);

            // Blacks: Low brightness
            float blacks = (r < 0.5 && g < 0.5 && b < 0.5) ? (0.5 - maxVal) * 2.0 : 0.0;
            blacks = clamp(blacks, 0.0, 1.0);

            // Neutrals: Low saturation, not white or black
            float neutrals = 1.0 - (abs(maxVal - minVal)); 
            neutrals = clamp(neutrals, 0.0, 1.0);


            // Accumulate adjustments
            vec4 totalAdj = vec4(0.0);
            
            if (reds > 0.0) totalAdj += uReds * reds;
            if (yellows > 0.0) totalAdj += uYellows * yellows;
            if (greens > 0.0) totalAdj += uGreens * greens;
            if (cyans > 0.0) totalAdj += uCyans * cyans;
            if (blues > 0.0) totalAdj += uBlues * blues;
            if (magentas > 0.0) totalAdj += uMagentas * magentas;
            if (whites > 0.0) totalAdj += uWhites * whites;
            if (neutrals > 0.0) totalAdj += uNeutrals * neutrals;
            if (blacks > 0.0) totalAdj += uBlacks * blacks;

            // Apply adjustments
            // Convert RGB to CMY (simplified)
            float C = 1.0 - r;
            float M = 1.0 - g;
            float Y = 1.0 - b;
            
            float adjC = totalAdj.x;
            float adjM = totalAdj.y;
            float adjY = totalAdj.z;
            float adjK = totalAdj.w;

            if (uRelative == 1) {
                C += adjC * C + adjK * C;
                M += adjM * M + adjK * M;
                Y += adjY * Y + adjK * Y;
            } else {
                C += adjC + adjK;
                M += adjM + adjK;
                Y += adjY + adjK;
            }

            // Convert back to RGB
            gl_FragColor = vec4(1.0 - C, 1.0 - M, 1.0 - Y, color.a);
        }
    `;

    reds: number[]; yellows: number[]; greens: number[]; cyans: number[];
    blues: number[]; magentas: number[]; whites: number[]; neutrals: number[]; blacks: number[];
    relative: boolean;

    sendUniformData(gl: WebGLRenderingContext, uniformLocations: any) {
        // Scale: Input -100..100 -> Output -1.0..1.0 (or smaller for subtlety)
        // Photoshop 100% usually means full ink density change.
        const scale = 0.01; 

        const hasNeutrals = this.neutrals.some(v => v !== 0);
        console.log('[SelectiveColor] Sending Uniforms', {
            reds: JSON.stringify(this.reds),
            neutrals: JSON.stringify(this.neutrals),
            HAS_NEUTRALS: hasNeutrals ? 'YES - THIS AFFECTS WHOLE IMAGE' : 'NO',
            relative: this.relative
        });

        gl.uniform1i(uniformLocations.uRelative, this.relative ? 1 : 0);
        gl.uniform4fv(uniformLocations.uReds, this.reds.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uYellows, this.yellows.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uGreens, this.greens.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uCyans, this.cyans.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uBlues, this.blues.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uMagentas, this.magentas.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uWhites, this.whites.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uNeutrals, this.neutrals.map(v => v * scale));
        gl.uniform4fv(uniformLocations.uBlacks, this.blacks.map(v => v * scale));
    }

    constructor(options: { 
        reds?: { cyan: number, magenta: number, yellow: number, black: number },
        yellows?: { cyan: number, magenta: number, yellow: number, black: number },
        greens?: { cyan: number, magenta: number, yellow: number, black: number },
        cyans?: { cyan: number, magenta: number, yellow: number, black: number },
        blues?: { cyan: number, magenta: number, yellow: number, black: number },
        magentas?: { cyan: number, magenta: number, yellow: number, black: number },
        whites?: { cyan: number, magenta: number, yellow: number, black: number },
        neutrals?: { cyan: number, magenta: number, yellow: number, black: number },
        blacks?: { cyan: number, magenta: number, yellow: number, black: number },
        relative?: boolean 
    } = {}) {
        super(options);
        const toArr = (o: any) => o ? [o.cyan, o.magenta, o.yellow, o.black] : [0,0,0,0];
        
        this.reds = toArr(options.reds);
        this.yellows = toArr(options.yellows);
        this.greens = toArr(options.greens);
        this.cyans = toArr(options.cyans);
        this.blues = toArr(options.blues);
        this.magentas = toArr(options.magentas);
        this.whites = toArr(options.whites);
        this.neutrals = toArr(options.neutrals);
        this.blacks = toArr(options.blacks);
        this.relative = options.relative ?? true;
    }

    isNeutralState() {
        return false; 
    }

    getFragmentSource() {
        return this.fragmentSource;
    }

    applyTo(options: any) {
        if (options.webgl) {
            super.applyTo(options);
        }
    }

    getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        return {
            uRelative: gl.getUniformLocation(program, 'uRelative'),
            uReds: gl.getUniformLocation(program, 'uReds'),
            uYellows: gl.getUniformLocation(program, 'uYellows'),
            uGreens: gl.getUniformLocation(program, 'uGreens'),
            uCyans: gl.getUniformLocation(program, 'uCyans'),
            uBlues: gl.getUniformLocation(program, 'uBlues'),
            uMagentas: gl.getUniformLocation(program, 'uMagentas'),
            uWhites: gl.getUniformLocation(program, 'uWhites'),
            uNeutrals: gl.getUniformLocation(program, 'uNeutrals'),
            uBlacks: gl.getUniformLocation(program, 'uBlacks'),
        };
    }


}

class GradientMapFilter extends fabric.filters.BaseFilter {
    static type = 'GradientMapFilter';

    fragmentSource = `
        precision highp float;
        uniform sampler2D uTexture;
        uniform sampler2D uGradientTexture;
        uniform float uOpacity;
        varying vec2 vTexCoord;

        void main() {
            vec4 color = texture2D(uTexture, vTexCoord);
            
            // DEBUG: Force output to RED to verify shader is running
            // If you see the image turn red, the shader is working.
            // If you see the original image, the shader is NOT running.
            // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); 
            
            // Calculate Luminance (standard Rec. 709 coefficients)
            float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            
            // Sample the gradient texture based on luminance
            vec4 mapColor = texture2D(uGradientTexture, vec2(luminance, 0.5));
            
            // Mix original color with mapped color based on opacity
            vec3 finalColor = mix(color.rgb, mapColor.rgb, uOpacity);
            
            gl_FragColor = vec4(finalColor, color.a);
        }
    `;

    stops: { offset: number; color: string }[];
    opacity: number;
    gradientTexture: HTMLCanvasElement | null = null;
    webglTexture: WebGLTexture | null = null;
    glContext: WebGLRenderingContext | null = null;

    constructor(options: { stops?: { offset: number; color: string }[], opacity?: number } = {}) {
        super(options);
        this.stops = options.stops || [{ offset: 0, color: '#000000' }, { offset: 1, color: '#000000' }];
        this.opacity = options.opacity ?? 1.0;
        this.updateGradientTexture();
        console.log('[GradientMap] Initialized', { stops: this.stops, opacity: this.opacity });
    }

    updateGradientTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        [...this.stops]
            .sort((a, b) => a.offset - b.offset)
            .forEach(stop => {
                gradient.addColorStop(stop.offset, stop.color);
            });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);
        this.gradientTexture = canvas;
        this.webglTexture = null; // Invalidate WebGL texture
        console.log('[GradientMap] Texture Updated', this.gradientTexture);
    }

    applyTo(options: any) {
        console.log('[GradientMap] applyTo called', { webgl: options.webgl, opacity: this.opacity });
        if (options.webgl) {
            if (!this.gradientTexture) this.updateGradientTexture();
            super.applyTo(options);
        } else {
            // 2D Canvas Fallback
            if (!this.gradientTexture) this.updateGradientTexture();
            const ctx = this.gradientTexture!.getContext('2d');
            if (!ctx) return;
            
            // Get gradient data map (256x1)
            const gradientData = ctx.getImageData(0, 0, 256, 1).data;
            const imageData = options.imageData;
            const data = imageData.data;
            const len = data.length;
            const opacity = this.opacity;

            for (let i = 0; i < len; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // const a = data[i + 3];

                // Calculate luminance
                const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
                
                // Map to gradient
                // luminance is 0-255, which corresponds to index in gradientData
                const gradientIndex = luminance * 4;
                
                const mapR = gradientData[gradientIndex];
                const mapG = gradientData[gradientIndex + 1];
                const mapB = gradientData[gradientIndex + 2];

                // Mix based on opacity
                data[i] = r + (mapR - r) * opacity;
                data[i + 1] = g + (mapG - g) * opacity;
                data[i + 2] = b + (mapB - b) * opacity;
            }
        }
    }

    isNeutralState() {
        return false;
    }

    getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        return {
            uGradientTexture: gl.getUniformLocation(program, 'uGradientTexture'),
            uOpacity: gl.getUniformLocation(program, 'uOpacity'),
        };
    }

    sendUniformData(gl: WebGLRenderingContext, uniformLocations: any) {
        if (!this.gradientTexture) {
            console.warn('[GradientMap] No texture to send!');
            return;
        }

        // Bind gradient texture to unit 5 to avoid conflict
        gl.activeTexture(gl.TEXTURE5);

        // Create or reuse texture
        if (!this.webglTexture || this.glContext !== gl) {
            this.webglTexture = gl.createTexture();
            this.glContext = gl;
            gl.bindTexture(gl.TEXTURE_2D, this.webglTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.gradientTexture);
            
            // Set texture parameters
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            console.log('[GradientMap] Created new WebGL texture');
        } else {
            gl.bindTexture(gl.TEXTURE_2D, this.webglTexture);
        }

        gl.uniform1i(uniformLocations.uGradientTexture, 5); // Tell shader to use texture unit 5
        gl.uniform1f(uniformLocations.uOpacity, this.opacity);
        
        // Reset active texture to 0
        gl.activeTexture(gl.TEXTURE0);
    }

    getFragmentSource() {
        return this.fragmentSource;
    }

    toObject() {
        return {
            type: 'GradientMapFilter',
            stops: this.stops,
            opacity: this.opacity
        };
    }

    static fromObject(object: any) {
        return new GradientMapFilter(object);
    }
}

// Register filter
try {
    if (Object.isExtensible(fabric.filters)) {
        (fabric.filters as any).GradientMapFilter = GradientMapFilter;
    } else {
        console.log('fabric.filters is not extensible, skipping direct assignment');
    }
    
    // Always try classRegistry for modern Fabric versions
    if ((fabric as any).classRegistry) {
        (fabric as any).classRegistry.setClass(GradientMapFilter, 'GradientMapFilter');
        // Some versions use a different path
        try {
            (fabric as any).classRegistry.setClass(GradientMapFilter, 'filters.GradientMapFilter');
        } catch (e) {}
    }
} catch (error) {
    console.warn('Failed to register GradientMapFilter:', error);
}

// Register filter
// @ts-ignore
// fabric.filters.Curves = CurvesFilter;

export interface FabricCanvasRef {
    getDataURL: (options?: { 
        multiplier?: number; 
        backgroundColor?: string;
        fullWorld?: boolean;
        width?: number;
        height?: number;
        left?: number;
        top?: number;
    }) => string;

    getSelectionRect: () => { left: number, top: number, width: number, height: number } | null;
    getLocalSelectionRect: (layerId: string) => { x: number, y: number, width: number, height: number } | null;
}

const CHECKERBOARD_BG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uPzJ96As9f50U2mZ5AE7Ic0DBy0mIDApqnG4UM3CIBCHoIEGhRE9YnKzSAAAAAASUVORK5CYII=';

// Force WebGL Backend for performance - REMOVED to allow fallback and avoid issues with custom filters
// Force WebGL Backend for performance
try {
    // @ts-ignore
    fabric.config.filterBackend = new fabric.WebGLFilterBackend();
} catch (e) {
    console.warn("WebGL Backend failed to initialize, falling back to Canvas2D", e);
}

export const FabricCanvas = React.forwardRef((props: FabricCanvasProps, ref: React.Ref<FabricCanvasRef>) => {
    const {
        width,
        height,
        layers,
        onLayerUpdate,
        onSelectionChange,
        selectedLayerId,
        activeTool,
        brushColor = '#00cc88',
        brushSize = 10,
        viewScale = 1,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isUpdatingRef = useRef(false);
    const pendingLayersRef = useRef<Layer[] | null>(null);

    const activeToolRef = useRef(activeTool);
    const onLayerUpdateRef = useRef(onLayerUpdate);
    const selectedLayerIdRef = useRef(selectedLayerId);
    const layersRef = useRef(layers);
    const cropRectRef = useRef<fabric.Rect | null>(null);
    const cropStartRef = useRef<{ x: number, y: number } | null>(null);

    const isMouseDownRef = useRef(false);
    const isAltPressedRef = useRef(false);
    const onCropRef = useRef(props.onCrop);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const lastPointerRef = useRef<{ x: number, y: number } | null>(null);
    const brushSizeRef = useRef(brushSize);
    const tempPoseHandleRef = useRef<{ x: number, y: number } | null>(null);
    const posePointsRef = useRef(props.posePoints);
    const onPosePointsChangeRef = useRef(props.onPosePointsChange);

    // Render Pose Points
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // Clear existing pose UI
        const existing = canvas.getObjects().filter(obj => (obj as any).id && ((obj as any).id.startsWith('pose-point-') || (obj as any).id.startsWith('pose-arrow-') || (obj as any).id.startsWith('pose-label-')));
        existing.forEach(obj => canvas.remove(obj));

        if (activeTool === 'transformation' && props.posePoints) {
            props.posePoints.forEach((pair, index) => {
                // Handle (Green - Original)
                const handle = new fabric.Circle({
                    left: pair.handle.x,
                    top: pair.handle.y,
                    radius: 5,
                    fill: '#00cc88',
                    stroke: 'white',
                    strokeWidth: 1,
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false,
                    // @ts-ignore
                    id: `pose-point-handle-${index}`
                });

                // Target (Blue - Changed)
                const target = new fabric.Circle({
                    left: pair.target.x,
                    top: pair.target.y,
                    radius: 6,
                    fill: 'blue',
                    stroke: 'white',
                    strokeWidth: 2,
                    originX: 'center',
                    originY: 'center',
                    selectable: true, // Make interactive
                    evented: true,    // Make interactive
                    hasControls: false,
                    hasBorders: false,
                    // @ts-ignore
                    id: `pose-point-target-${index}`
                });

                // Arrow
                const arrow = new fabric.Line([pair.handle.x, pair.handle.y, pair.target.x, pair.target.y], {
                    stroke: 'white',
                    strokeWidth: 2,
                    selectable: false,
                    evented: false,
                    // @ts-ignore
                    id: `pose-arrow-${index}`
                });

                // Label
                if (pair.label) {
                    const label = new fabric.Text(pair.label, {
                        left: pair.target.x + 10,
                        top: pair.target.y - 10,
                        fontSize: 12,
                        fill: 'white',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        selectable: false,
                        evented: false,
                        // @ts-ignore
                        id: `pose-label-${index}`
                    });
                    canvas.add(label);
                }

                canvas.add(arrow);
                canvas.add(handle);
                canvas.add(target);
            });
            canvas.requestRenderAll();
        }
    }, [props.posePoints, activeTool]);

    useEffect(() => {
        activeToolRef.current = activeTool;
        onLayerUpdateRef.current = onLayerUpdate;
        selectedLayerIdRef.current = selectedLayerId;
        layersRef.current = layers;
        onSelectionChangeRef.current = onSelectionChange;
        onCropRef.current = props.onCrop;
        brushSizeRef.current = brushSize;
        posePointsRef.current = props.posePoints;
        onPosePointsChangeRef.current = props.onPosePointsChange;

        // Update cursor immediately when tool or size changes
        if (lastPointerRef.current) {
            updateCursor(lastPointerRef.current);
        }
    }, [activeTool, onLayerUpdate, selectedLayerId, layers, props.onCrop, brushSize, onSelectionChange, viewScale]);




    const getAdjustedPointer = (e: any) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        
        const ev = e.e || e;
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        
        // This ratio accounts for CSS transforms (like scale)
        const scaleX = canvas.upperCanvasEl.offsetWidth / rect.width;
        const scaleY = canvas.upperCanvasEl.offsetHeight / rect.height;
        
        // Local coordinates in CSS pixels
        const localX = (ev.clientX - rect.left) * scaleX;
        const localY = (ev.clientY - rect.top) * scaleY;
        
        // Transform to canvas space (accounting for Fabric zoom/pan)
        const vpt = canvas.viewportTransform;
        return {
            x: (localX - vpt[4]) / vpt[0],
            y: (localY - vpt[5]) / vpt[0]
        };
    };

    const updateCursor = (pointer: { x: number, y: number }) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const tool = activeToolRef.current;
        if (tool !== 'brush' && tool !== 'eraser') return;

        let brushCursor = canvas.getObjects().find(obj => (obj as any).id === 'drawing-cursor') as fabric.Circle;


        const zoom = canvas.getZoom();
        const cursorScale = 1 / (zoom * viewScale);

        // Handle Brush Circle (for Brush and Eraser)
        const showBrushCircle = tool === 'brush' || tool === 'eraser';
        
        if (showBrushCircle) {
            // Always show native crosshair for precision, alongside the brush circle
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';



            if (!brushCursor) {
                brushCursor = new fabric.Circle({
                    radius: (brushSizeRef.current || 20) / 2,
                    fill: 'transparent',
                    stroke: tool === 'eraser' ? '#ff4444' : '#ffffff',
                    strokeWidth: 1.5,
                    strokeUniform: true,
                    shadow: new fabric.Shadow({ color: 'black', blur: 2, offsetX: 1, offsetY: 1 }),
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false,
                    // @ts-ignore
                    id: 'drawing-cursor'
                });
                canvas.add(brushCursor);
            }
            brushCursor.set({ 
                radius: (brushSizeRef.current || 20) / 2,
                left: pointer.x, 
                top: pointer.y,
                stroke: tool === 'eraser' ? '#ff4444' : '#ffffff'
            });
            canvas.bringObjectToFront(brushCursor);

        } else {
            canvas.defaultCursor = 'default';
            canvas.hoverCursor = 'default';
            if (brushCursor) canvas.remove(brushCursor);

        }



        canvas.requestRenderAll();
    };

    React.useImperativeHandle(ref, () => ({
        getDataURL: (options: any = {}) => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return '';
            
            const { fullWorld, ...fabricOptions } = options;
            const originalVpt = [...(canvas.viewportTransform || [1, 0, 0, 1, 0, 0])];
            
            try {
                if (fullWorld) {
                    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
                }
                
                canvas.renderAll();
                
                const dataUrl = canvas.toDataURL(fabricOptions);
                
                if (fullWorld) {
                    canvas.setViewportTransform(originalVpt as any);
                }
                
                return dataUrl;
            } finally {
                canvas.renderAll();
            }
        },

        getSelectionRect: () => {
            if (cropRectRef.current) {
                const rect = cropRectRef.current;
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width * (rect.scaleX || 1),
                    height: rect.height * (rect.scaleY || 1)
                };
            }
            return null;
        },

        getLocalSelectionRect: (layerId: string) => {
            const canvas = fabricCanvasRef.current;
            if (!canvas || !cropRectRef.current) return null;

            // @ts-ignore
            const target = canvas.getObjects().find(obj => obj.id === layerId);
            if (!target) return null;

            const rect = cropRectRef.current;
            const globalRect = {
                left: rect.left!,
                top: rect.top!,
                width: rect.width! * rect.scaleX!,
                height: rect.height! * rect.scaleY!
            };

            // Transform global rect points to local layer space
            const matrix = target.calcTransformMatrix();
            const invertedMatrix = fabric.util.invertTransform(matrix);

            const tl = fabric.util.transformPoint(new fabric.Point(globalRect.left, globalRect.top), invertedMatrix);
            const br = fabric.util.transformPoint(new fabric.Point(globalRect.left + globalRect.width, globalRect.top + globalRect.height), invertedMatrix);

            // Calculate local bounds (handling rotation/flipping implicitly by min/max)
            // Note: This assumes the selection is axis-aligned with the canvas, and we want the corresponding area on the rotated image.
            // If the image is rotated, the selection rect in local space might be rotated. 
            // However, for simple cropping/masking, we usually want the bounding box in local space.
            
            // For now, let's assume we want the local coordinates.
            // Since the crop tool is axis-aligned to the CANVAS, and the image might be rotated,
            // the "local selection" is technically a polygon. 
            // BUT, for "Selection Fill", we usually want to mask the area under the selection.
            
            // Let's return the top-left and dimensions in local space.
            // If rotation is involved, this is an approximation or requires a rotated mask.
            // For this implementation, we'll assume the user wants the area defined by these points.
            
            const x = Math.min(tl.x, br.x);
            const y = Math.min(tl.y, br.y);
            const width = Math.abs(br.x - tl.x);
            const height = Math.abs(br.y - tl.y);
            
            // Shift to be relative to image top-left (0,0) instead of center
            // Fabric images are centered by default (originX/Y: center), so (0,0) is the center.
            // We need coordinates relative to the top-left corner of the image for drawing on a canvas.
            // The local point (0,0) is the center of the image.
            // Image width/height are the full dimensions.
            // So top-left is (-width/2, -height/2).
            
            const imageWidth = target.width || 0;
            const imageHeight = target.height || 0;
            
            const localX = x + (imageWidth / 2);
            const localY = y + (imageHeight / 2);

            return {
                x: localX,
                y: localY,
                width: width,
                height: height
            };
        }
    }));

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = new fabric.Canvas(canvasRef.current, {
            width,
            height,
            backgroundColor: 'transparent',
            preserveObjectStacking: true,
            // @ts-ignore
            alpha: true
        });
        fabricCanvasRef.current = canvas;

        canvas.on('path:created', (e: any) => {
            const path = e.path;
            const currentTool = activeToolRef.current;

            if (currentTool === 'eraser' || currentTool === 'brush') {
                // Always remove the path from the canvas - it will be re-added via state
                canvas.remove(path);

                let activeLayerId = selectedLayerIdRef.current;
                if (!activeLayerId) {
                    const firstImageLayer = layersRef.current.find(l => l.type !== 'group');
                    if (firstImageLayer) {
                        activeLayerId = firstImageLayer.id;
                        selectedLayerIdRef.current = activeLayerId;
                        if (onSelectionChangeRef.current) onSelectionChangeRef.current(activeLayerId);
                    }
                }

                // @ts-ignore
                const target = canvas.getObjects().find(obj => obj.id === activeLayerId);

                if (target && activeLayerId && onLayerUpdateRef.current) {
                    const matrix = target.calcTransformMatrix();
                    const invertedMatrix = fabric.util.invertTransform(matrix);
                    const localPoint = fabric.util.transformPoint(new fabric.Point(path.left, path.top), invertedMatrix);

                    const pId = currentTool + '-' + Date.now();
                    
                    const pOpts = {
                        left: localPoint.x,
                        top: localPoint.y,
                        angle: path.angle - target.angle,
                        scaleX: path.scaleX / target.scaleX,
                        scaleY: path.scaleY / target.scaleY,
                        id: pId,
                        layerId: activeLayerId,
                        selectable: false,
                        evented: false
                    };

                    path.set(pOpts as any);

                    if (currentTool === 'eraser') {
                        path.set({ stroke: 'black', fill: '' });
                        let clipGroup = target.clipPath as fabric.Group;
                        if (!clipGroup || clipGroup.type !== 'group') {
                            const spacer = new fabric.Rect({
                                width: 10000,
                                height: 10000,
                                fill: 'transparent',
                                left: 0,
                                top: 0,
                                originX: 'center',
                                originY: 'center',
                                selectable: false,
                                evented: false,
                                // @ts-ignore
                                id: 'spacer-eraser'
                            });
                            clipGroup = new fabric.Group([spacer], {
                                inverted: true,
                                absolutePositioned: false,
                                originX: 'center',
                                originY: 'center',
                                left: 0,
                                top: 0
                            });
                            target.set({ clipPath: clipGroup });
                        }

                        clipGroup.add(path);
                        clipGroup.set({ left: 0, top: 0 });
                        target.dirty = true;
                        canvas.requestRenderAll();

                        const allEraserPaths = clipGroup.getObjects().filter(obj =>
                            // @ts-ignore
                            obj.id && obj.id.startsWith('eraser-')
                        );

                        onLayerUpdateRef.current(activeLayerId, {
                            eraserPaths: allEraserPaths.map(p => p.toObject(['id', 'layerId', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'path', 'stroke', 'strokeWidth', 'fill', 'originX', 'originY', 'pathOffset']))
                        });
                        // Optimistically update layersRef to avoid race conditions with rapid strokes
                        layersRef.current = layersRef.current.map(l => l.id === activeLayerId ? {
                            ...l,
                            eraserPaths: allEraserPaths.map(p => p.toObject(['id', 'layerId', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'path', 'stroke', 'strokeWidth', 'fill', 'originX', 'originY', 'pathOffset']))
                        } : l);
                    } else {
                        // Brush tool
                        const layer = layersRef.current.find(l => l.id === activeLayerId);
                        const currentBrushPaths = layer?.brushPaths || [];
                        const pathObj = path.toObject(['id', 'layerId', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'path', 'stroke', 'strokeWidth', 'fill', 'originX', 'originY', 'pathOffset']);
                        const nextBrushPaths = [...currentBrushPaths, pathObj];
                        
                        onLayerUpdateRef.current(activeLayerId, {
                            brushPaths: nextBrushPaths
                        });
                        // Optimistically update layersRef to avoid race conditions with rapid strokes
                        layersRef.current = layersRef.current.map(l => l.id === activeLayerId ? {
                            ...l,
                            brushPaths: nextBrushPaths
                        } : l);
                    }
                }
            }
        });

        const updateAttachedPaths = (obj: any) => {
            if (!obj || !obj.id) return;
            const layerId = obj.id;
            const layer = layersRef.current.find(l => l.id === layerId);
            if (!layer || !layer.brushPaths) return;

            const matrix = obj.calcTransformMatrix();

            layer.brushPaths.forEach(pData => {
                const pathObj = canvas.getObjects().find(o => (o as any).id === pData.id);
                if (pathObj) {
                    const worldPoint = fabric.util.transformPoint(new fabric.Point(pData.left, pData.top), matrix);
                    pathObj.set({
                        left: worldPoint.x,
                        top: worldPoint.y,
                        angle: pData.angle + obj.angle,
                        scaleX: pData.scaleX * obj.scaleX,
                        scaleY: pData.scaleY * obj.scaleY
                    });
                }
            });
        };

        canvas.on('object:moving', (e) => {
            updateAttachedPaths(e.target);

            // Handle Pose Point Movement
            const obj = e.target;
            // @ts-ignore
            if (obj && obj.id && obj.id.startsWith('pose-point-target-')) {
                // @ts-ignore
                const id = obj.id;
                const index = parseInt(id.split('-').pop());
                // @ts-ignore
                const arrow = canvas.getObjects().find(o => o.id === `pose-arrow-${index}`) as fabric.Line;
                if (arrow) {
                    arrow.set({ x2: obj.left, y2: obj.top });
                }
                
                // Update Label Position
                // @ts-ignore
                const label = canvas.getObjects().find(o => o.id === `pose-label-${index}`) as fabric.Text;
                if (label) {
                    label.set({ left: obj.left! + 10, top: obj.top! - 10 });
                }
            }
        });
        canvas.on('object:scaling', (e) => updateAttachedPaths(e.target));
        canvas.on('object:rotating', (e) => updateAttachedPaths(e.target));

        canvas.on('object:modified', (e) => {
            const obj = e.target;

            // Handle Pose Point Modified
            // @ts-ignore
            if (obj && obj.id && obj.id.startsWith('pose-point-target-')) {
                // @ts-ignore
                const id = obj.id;
                const index = parseInt(id.split('-').pop());
                
                if (onPosePointsChangeRef.current && posePointsRef.current) {
                    const newPoints = [...posePointsRef.current];
                    if (newPoints[index]) {
                        newPoints[index] = {
                            ...newPoints[index],
                            target: { x: obj.left!, y: obj.top! }
                        };
                        onPosePointsChangeRef.current(newPoints);
                    }
                }
                return; 
            }

            if (obj && (obj as any).id && onLayerUpdateRef.current) {
                onLayerUpdateRef.current((obj as any).id, {
                    x: obj.left,
                    y: obj.top,
                    scale: obj.scaleX,
                    rotation: obj.angle
                });
            }
        });

        canvas.on('selection:created', (e) => {
            const obj = e.selected?.[0];
            if (obj && (obj as any).id && onSelectionChangeRef.current) {
                onSelectionChangeRef.current((obj as any).id);
            }
        });

        canvas.on('selection:cleared', () => {
            onSelectionChange(null);
        });

        canvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            let zoom = canvas.getZoom();
            zoom *= 0.999 ** delta;
            if (zoom > 20) zoom = 20;
            if (zoom < 0.01) zoom = 0.01;
            const pointer = getAdjustedPointer(opt.e);
            canvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), zoom);
            opt.e.preventDefault();
            opt.e.stopPropagation();
        });


        canvas.on('mouse:down', (opt) => {
            canvas.calcOffset();
            isMouseDownRef.current = true;
            const pointer = getAdjustedPointer(opt.e);

            if (activeToolRef.current === 'transformation') {
                // Check if we clicked an existing object (like a pose target)
                if (opt.target) {
                    return;
                }

                // Pose Tool Logic
                // 1. First click: Set Handle (Red)
                // 2. Second click: Set Target (Blue) and commit pair
                
                // We need a way to track if we are waiting for the second click.
                // We'll use a temporary ref for this since it's transient interaction state.
                // Let's add it to the component scope (see below).
                
                if (!tempPoseHandleRef.current) {
                    // First click - Start new pair
                    tempPoseHandleRef.current = { x: pointer.x, y: pointer.y };
                    
                    // Visual feedback for first point
                    const handle = new fabric.Circle({
                        left: pointer.x,
                        top: pointer.y,
                        radius: 5,
                        fill: '#00cc88',
                        originX: 'center',
                        originY: 'center',
                        selectable: false,
                        evented: false,
                        // @ts-ignore
                        id: 'pose-temp-handle'
                    });
                    canvas.add(handle);
                    canvas.requestRenderAll();
                } else {
                    // Second click - Complete pair
                    const handle = tempPoseHandleRef.current;
                    const target = { x: pointer.x, y: pointer.y };
                    
                    // Clear temp state
                    tempPoseHandleRef.current = null;
                    const tempPoint = canvas.getObjects().find(obj => (obj as any).id === 'pose-temp-handle');
                    if (tempPoint) canvas.remove(tempPoint);

                    // Notify parent
                    if (onPosePointsChangeRef.current) {
                        const currentPoints = posePointsRef.current || [];
                        onPosePointsChangeRef.current([...currentPoints, { handle, target }]);
                    }
                }
                return;
            }


            if (activeToolRef.current !== 'crop') return;
            cropStartRef.current = { x: pointer.x, y: pointer.y };
            
            if (cropRectRef.current) {
                canvas.remove(cropRectRef.current);
            }

            const rect = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: 'rgba(0, 204, 136, 0.2)',
                stroke: '#00cc88',
                strokeWidth: 2 / (canvas.getZoom() * viewScale),
                dashArray: [5 / (canvas.getZoom() * viewScale), 5 / (canvas.getZoom() * viewScale)],
                // @ts-ignore
                id: 'crop-rect',
                selectable: false,
                evented: false,
                hasRotatingPoint: false,
                transparentCorners: false,
                cornerColor: '#00cc88',
                cornerSize: 8 / (canvas.getZoom() * viewScale)
            });

            cropRectRef.current = rect;
            canvas.add(rect);
            canvas.setActiveObject(rect);
        });

        canvas.on('mouse:move', (opt) => {
            canvas.calcOffset();
            const pointer = getAdjustedPointer(opt.e);
            lastPointerRef.current = pointer;

            if (activeToolRef.current === 'brush' || activeToolRef.current === 'eraser') {
                updateCursor(pointer);
                return;
            }

            if (activeToolRef.current === 'transformation' && tempPoseHandleRef.current) {
                // Draw dynamic line from handle to current mouse position
                const canvas = fabricCanvasRef.current;
                if (!canvas) return;

                // Remove old temp line
                const oldLine = canvas.getObjects().find(obj => (obj as any).id === 'pose-temp-line');
                if (oldLine) canvas.remove(oldLine);

                const line = new fabric.Line([tempPoseHandleRef.current.x, tempPoseHandleRef.current.y, pointer.x, pointer.y], {
                    stroke: 'white',
                    strokeWidth: 2,
                    strokeDashArray: [5, 5],
                    selectable: false,
                    evented: false,
                    // @ts-ignore
                    id: 'pose-temp-line'
                });
                canvas.add(line);
                canvas.requestRenderAll();
                return;
            }

            if (activeToolRef.current !== 'crop' || !cropRectRef.current || !isMouseDownRef.current || !cropStartRef.current) return;
            
            const rect = cropRectRef.current;
            const startX = cropStartRef.current.x;
            const startY = cropStartRef.current.y;

            const left = Math.min(startX, pointer.x);
            const top = Math.min(startY, pointer.y);
            const width = Math.abs(pointer.x - startX);
            const height = Math.abs(pointer.y - startY);
            
            rect.set({
                left,
                top,
                width,
                height
            });
            canvas.requestRenderAll();
        });

        canvas.on('mouse:up', () => {
            isMouseDownRef.current = false;
            cropStartRef.current = null;

            if (activeToolRef.current === 'crop' && cropRectRef.current) {
                cropRectRef.current.set({
                    selectable: true,
                    evented: true
                });
                canvas.setActiveObject(cropRectRef.current);
                canvas.requestRenderAll();
            }



            if (activeToolRef.current !== 'crop' || !cropRectRef.current) return;
            const rect = cropRectRef.current;
            if (rect.width! < 5 || rect.height! < 5) {
                canvas.remove(rect);
                cropRectRef.current = null;
            } else {
                rect.set({ selectable: true, evented: true });
                canvas.setActiveObject(rect);
                canvas.requestRenderAll();
            }
        });

        canvas.on('mouse:dblclick', (opt) => {
            if (activeToolRef.current === 'crop' && cropRectRef.current) {
                const rect = cropRectRef.current;
                if (onCropRef.current) {
                    onCropRef.current({
                        x: rect.left!,
                        y: rect.top!,
                        width: rect.width! * rect.scaleX!,
                        height: rect.height! * rect.scaleY!
                    });
                }
                canvas.remove(rect);
                cropRectRef.current = null;
            }
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey) isAltPressedRef.current = true;
            if (e.key === 'Enter' && activeToolRef.current === 'crop' && cropRectRef.current) {
                const rect = cropRectRef.current;
                if (onCropRef.current) {
                    onCropRef.current({
                        x: rect.left!,
                        y: rect.top!,
                        width: rect.width! * rect.scaleX!,
                        height: rect.height! * rect.scaleY!
                    });
                }
                canvas.remove(rect);
                cropRectRef.current = null;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.altKey) isAltPressedRef.current = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, []);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // Cleanup logic for tool switching
        if (activeTool !== 'crop') {
            const cropRect = canvas.getObjects().find(obj => (obj as any).id === 'crop-rect');
            if (cropRect) canvas.remove(cropRect);
        }

        if (activeTool !== 'brush' && activeTool !== 'eraser') {
            
            canvas.getObjects().forEach(obj => {
                const id = (obj as any).id;
                if (id === 'drawing-cursor') {
                    canvas.remove(obj);
                }
            });
            
            canvas.defaultCursor = 'default';
            canvas.hoverCursor = 'default';
        } else {
            // Drawing tools (Brush, Eraser)
            
            // updateCursor will handle setting the cursor to 'none' or 'crosshair'
            if (lastPointerRef.current) {
                updateCursor(lastPointerRef.current);
            } else {
                canvas.defaultCursor = 'crosshair';
                canvas.hoverCursor = 'crosshair';
            }
        }

        if (activeTool === 'crop') {
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';
        }



        canvas.requestRenderAll();
    }, [activeTool]);

    useEffect(() => {
        if (fabricCanvasRef.current) {
            fabricCanvasRef.current.setDimensions({ width, height });
        }
    }, [width, height]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        canvas.calcOffset();
        canvas.isDrawingMode = activeTool === 'brush' || activeTool === 'eraser';
        if (canvas.isDrawingMode) {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.width = brushSize;
            if (activeTool === 'eraser') {
                // @ts-ignore
                canvas.freeDrawingBrush.globalCompositeOperation = 'destination-out';
                canvas.freeDrawingBrush.color = 'rgba(0,0,0,1)';
            } else {
                canvas.freeDrawingBrush.color = brushColor;
            }
        }

        canvas.getObjects().forEach(obj => {
            const id = (obj as any).id;
            
            if (id === 'crop-rect') {
                obj.set({
                    selectable: true,
                    evented: true,
                    hasRotatingPoint: false
                });
                return;
            }
            
            if (['drawing-cursor'].includes(id)) {
                obj.set({
                    selectable: false,
                    evented: false
                });
                return;
            }

            if (id && id.startsWith('brush-')) {
                obj.set({
                    selectable: false,
                    evented: false
                });
                return;
            }

            // Image layers and other objects
            obj.set({
                selectable: activeTool === 'move',
                evented: activeTool === 'move'
            });
        });
        canvas.requestRenderAll();
    }, [activeTool, brushColor, brushSize, selectedLayerId, props.viewScale]);

    const updateLayers = (layersToRender: Layer[]) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        if (isUpdatingRef.current) {
            pendingLayersRef.current = layersToRender;
            return;
        }

        isUpdatingRef.current = true;
        pendingLayersRef.current = null;

        const layersToRenderFiltered = layersToRender.filter(l => l.type !== 'group');
        const currentObjects = canvas.getObjects();
        const objMap = new Map<string, fabric.Object>();
        currentObjects.forEach(obj => {
            // @ts-ignore
            if (obj.id) objMap.set(obj.id, obj);
        });

        const layerIds = new Set(layersToRenderFiltered.map(l => l.id));
        const allBrushPathIds = new Set();
        layersToRender.forEach(l => {
            l.brushPaths?.forEach(p => allBrushPathIds.add(p.id));
        });

        currentObjects.forEach(obj => {
            // @ts-ignore
            const id = obj.id;
            if (id && id !== 'crop-rect' && !layerIds.has(id) && id !== 'drawing-cursor' && !id.startsWith('brush-') && !id.startsWith('pose-point-') && !id.startsWith('pose-arrow-') && !id.startsWith('pose-label-')) {
                canvas.remove(obj);
                objMap.delete(id);
            }
            // Also remove brush paths that are not in any layer's state
            if (id && id.startsWith('brush-')) {
                if (!allBrushPathIds.has(id)) {
                    canvas.remove(obj);
                    objMap.delete(id);
                }
            }
            // Remove paths without IDs (transient brush strokes)
            if (!id && obj.type === 'path') {
                canvas.remove(obj);
            }
        });

        const loadPromises = layersToRenderFiltered.map(layer => {
            // @ts-ignore
            let img = objMap.get(layer.id) as fabric.Image;

            if (img) {
                // @ts-ignore
                const currentElement = img.getElement();
                const currentSrc = currentElement?.src;
                const srcPromise = (currentSrc !== layer.image)
                    ? fabric.util.loadImage(layer.image).then(imgElement => {
                        img.setElement(imgElement);
                        // Update natural dimensions if they changed
                        img.set({
                            width: imgElement.width,
                            height: imgElement.height
                        });
                    })
                    : Promise.resolve();

                return (srcPromise as any).then(() => {
                    img.set({
                        left: layer.x,
                        top: layer.y,
                        scaleX: layer.scale,
                        scaleY: layer.scale,
                        angle: layer.rotation,
                        opacity: layer.opacity,
                        visible: layer.visible,
                        // @ts-ignore
                        id: layer.id,
                        originX: 'center',
                        originY: 'center',
                        selectable: !layer.locked,
                        evented: !layer.locked
                    });

                    // Apply Filters (HSL)
                    const filters: any[] = [];
                    
                    if (layer.hue && layer.hue !== 0) {
                        filters.push(new fabric.filters.HueRotation({
                            rotation: layer.hue / 180 
                        }));
                    }

                    if (layer.saturation && layer.saturation !== 0) {
                        filters.push(new fabric.filters.Saturation({
                            saturation: layer.saturation / 100
                        }));
                    }

                    if (layer.brightness && layer.brightness !== 0) {
                        filters.push(new fabric.filters.Brightness({
                            brightness: layer.brightness / 100
                        }));
                    }

                    if (layer.contrast && layer.contrast !== 0) {
                        filters.push(new fabric.filters.Contrast({
                            contrast: layer.contrast / 100 // -1 to 1
                        }));
                    }

                    if (layer.exposure && layer.exposure !== 0) {
                        // Exposure: RGB * 2^Exposure
                        // We use ColorMatrix for this.
                        // Matrix is 5x4 (RGBA + offset). We want to scale RGB.
                        // [ R, 0, 0, 0, 0 ]
                        // [ 0, G, 0, 0, 0 ]
                        // [ 0, 0, B, 0, 0 ]
                        // [ 0, 0, 0, A, 0 ]
                        const exposureFactor = Math.pow(2, layer.exposure);
                        filters.push(new fabric.filters.ColorMatrix({
                            matrix: [
                                exposureFactor, 0, 0, 0, 0,
                                0, exposureFactor, 0, 0, 0,
                                0, 0, exposureFactor, 0, 0,
                                0, 0, 0, 1, 0
                            ]
                        }));
                    }

                    if (layer.gamma && layer.gamma !== 0) {
                         // ... existing gamma logic ...
                         let gVal = 1;
                         if (layer.gamma > 0) gVal = 1 + (layer.gamma / 100) * 1.5;
                         else gVal = 1 - (Math.abs(layer.gamma) / 100) * 0.9; 
                         
                         filters.push(new fabric.filters.Gamma({
                             gamma: [gVal, gVal, gVal]
                         }));
                    }

                    if (layer.levels) {
                        // LEVELS IMPLEMENTATION
                        // 1. Input Levels (Black/White Point)
                        // Map [InputBlack, InputWhite] -> [0, 255]
                        // Scale = 255 / (InputWhite - InputBlack)
                        // Offset = -InputBlack * Scale
                        const inBlack = layer.levels.inputBlack;
                        const inWhite = layer.levels.inputWhite;
                        const inGamma = layer.levels.gamma;
                        const outBlack = layer.levels.outputBlack;
                        const outWhite = layer.levels.outputWhite;

                        // Avoid division by zero
                        if (inWhite !== inBlack) {
                            const scaleIn = 255 / (inWhite - inBlack);
                            const offsetIn = -inBlack * (scaleIn / 255); // Fabric ColorMatrix offset is -1 to 1? No, usually 0-1 or based on implementation.
                            // Fabric ColorMatrix: 
                            // R' = R * m[0] + G * m[1] + B * m[2] + A * m[3] + m[4]
                            // We want: R' = (R - inBlack) * (255 / (inWhite - inBlack))
                            // R' = R * scale - inBlack * scale
                            // So m[0] = scale, m[4] = -inBlack * scale
                            // Wait, Fabric ColorMatrix values are usually normalized?
                            // Let's assume standard behavior: matrix values multiply 0-1 or 0-255?
                            // WebGL backend usually works with 0-1.
                            // Let's normalize everything to 0-1.
                            // Input Black (0-255) -> (0-1): inBlack / 255
                            // Input White (0-255) -> (0-1): inWhite / 255
                            // Scale = 1 / ( (inWhite/255) - (inBlack/255) ) = 255 / (inWhite - inBlack)
                            // Offset = -(inBlack/255) * Scale
                            
                            const scale = 255 / (inWhite - inBlack);
                            const offset = -(inBlack / 255) * scale;

                            filters.push(new fabric.filters.ColorMatrix({
                                matrix: [
                                    scale, 0, 0, 0, offset,
                                    0, scale, 0, 0, offset,
                                    0, 0, scale, 0, offset,
                                    0, 0, 0, 1, 0
                                ]
                            }));
                        }

                        // 2. Gamma
                        if (inGamma !== 1) {
                            filters.push(new fabric.filters.Gamma({
                                gamma: [inGamma, inGamma, inGamma]
                            }));
                        }

                        // 3. Output Levels
                        // Map [0, 255] -> [OutputBlack, OutputWhite]
                        // Scale = (OutputWhite - OutputBlack) / 255
                        // Offset = OutputBlack / 255
                        if (outWhite !== outBlack) {
                            const scaleOut = (outWhite - outBlack) / 255;
                            const offsetOut = outBlack / 255;

                            filters.push(new fabric.filters.ColorMatrix({
                                matrix: [
                                    scaleOut, 0, 0, 0, offsetOut,
                                    0, scaleOut, 0, 0, offsetOut,
                                    0, 0, scaleOut, 0, offsetOut,
                                    0, 0, 0, 1, 0
                                ]
                            }));
                        }
                    }

                    if (layer.curves) {
                        console.log('[FabricCanvas] Applying Curves Filter', layer.curves);
                        const lut = calculateCurvesLUT(layer.curves);
                        // @ts-ignore
                        // @ts-ignore
                        filters.push(new Curves_v3({ lut }));
                    }

                    if (layer.colorBalance) {
                        console.log('[FabricCanvas] Adding ColorBalanceFilter (Existing)', layer.colorBalance);
                        filters.push(new ColorBalanceFilter({
                            shadows: layer.colorBalance.shadows,
                            midtones: layer.colorBalance.midtones,
                            highlights: layer.colorBalance.highlights,
                            preserveLuminosity: layer.colorBalance.preserveLuminosity
                        }));
                    }

                    if (layer.selectiveColor) {
                        console.log('[FabricCanvas] Adding SelectiveColorFilter (Existing)', layer.selectiveColor);
                        filters.push(new SelectiveColorFilter({
                            reds: layer.selectiveColor.reds,
                            yellows: layer.selectiveColor.yellows,
                            greens: layer.selectiveColor.greens,
                            cyans: layer.selectiveColor.cyans,
                            blues: layer.selectiveColor.blues,
                            magentas: layer.selectiveColor.magentas,
                            whites: layer.selectiveColor.whites,
                            neutrals: layer.selectiveColor.neutrals,
                            blacks: layer.selectiveColor.blacks,
                            relative: layer.selectiveColor.relative
                        }));
                    }

                    if (layer.gradientMap && layer.gradientMap.enabled) {
                        console.log('[FabricCanvas] Adding GradientMapFilter (Existing)', layer.gradientMap);
                        filters.push(new GradientMapFilter({
                            stops: layer.gradientMap.stops,
                            opacity: layer.gradientMap.opacity
                        }));
                    }

                    if (layer.blur && layer.blur > 0) {
                        filters.push(new fabric.filters.Blur({
                            blur: layer.blur
                        }));
                    }

                    if (layer.noise && layer.noise > 0) {
                        filters.push(new fabric.filters.Noise({
                            noise: layer.noise
                        }));
                    }

                    if (layer.sharpen && layer.sharpen > 0) {
                        // Sharpen matrix
                        // [  0 -1  0 ]
                        // [ -1  5 -1 ]
                        // [  0 -1  0 ]
                        // We can scale the effect by blending with original or adjusting matrix weights.
                        // For simplicity, we'll use a standard convolution.
                        // Fabric's Convolute filter doesn't have a simple 'amount', so we might need to adjust the matrix based on the value.
                        // A simple sharpen matrix:
                        // [ 0, -s, 0 ]
                        // [ -s, 4s+1, -s ]
                        // [ 0, -s, 0 ]
                        const s = layer.sharpen;
                        filters.push(new fabric.filters.Convolute({
                            matrix: [
                                0, -s, 0,
                                -s, 4 * s + 1, -s,
                                0, -s, 0
                            ]
                        }));
                    }


                    img.filters = filters;
                    img.applyFilters();

                    img.dirty = true;

                    if (layer.eraserPaths) {
                        let clipGroup = img.clipPath as fabric.Group;
                        if (!clipGroup || clipGroup.type !== 'group') {
                            const spacer = new fabric.Rect({
                                width: 10000,
                                height: 10000,
                                fill: 'transparent',
                                left: 0,
                                top: 0,
                                originX: 'center',
                                originY: 'center',
                                selectable: false,
                                evented: false,
                                // @ts-ignore
                                id: 'spacer-eraser'
                            });
                            clipGroup = new fabric.Group([spacer], {
                                inverted: true,
                                absolutePositioned: false,
                                originX: 'center',
                                originY: 'center',
                                left: 0,
                                top: 0
                            });
                            img.set({ clipPath: clipGroup });
                        }

                        const currentEraserIds = new Set(layer.eraserPaths.map(p => p.id));
                        clipGroup.getObjects().forEach(obj => {
                            // @ts-ignore
                            if (obj.id?.startsWith('eraser-') && !currentEraserIds.has(obj.id)) {
                                clipGroup.remove(obj);
                            }
                        });

                        const existingIds = new Set(clipGroup.getObjects().map(o => (o as any).id));
                        const newPathPromises = layer.eraserPaths
                            .filter(p => !existingIds.has(p.id))
                            .map(pData => fabric.Path.fromObject(pData).then(path => {
                                path.set({
                                    left: pData.left,
                                    top: pData.top,
                                    scaleX: pData.scaleX,
                                    scaleY: pData.scaleY,
                                    angle: pData.angle,
                                    stroke: 'black',
                                    fill: '',
                                    selectable: false,
                                    evented: false,
                                    // @ts-ignore
                                    id: pData.id,
                                    originX: pData.originX || 'left',
                                    originY: pData.originY || 'top',
                                    pathOffset: pData.pathOffset || { x: 0, y: 0 }
                                });
                                clipGroup.add(path);
                            }));
                        return Promise.all(newPathPromises).then(() => {
                            clipGroup.set({ left: 0, top: 0 });
                            img.dirty = true;
                        });
                    } else {
                        img.set({ clipPath: undefined });
                    }

                    // Render brush paths
                    const brushPromises = (layer.brushPaths || []).map(pData => {
                        // @ts-ignore
                        let path = objMap.get(pData.id) as fabric.Path;
                        const matrix = img.calcTransformMatrix();
                        const worldPoint = fabric.util.transformPoint(new fabric.Point(pData.left, pData.top), matrix);

                        if (!path) {
                            return fabric.Path.fromObject(pData).then(newPath => {
                                newPath.set({
                                    left: worldPoint.x,
                                    top: worldPoint.y,
                                    angle: pData.angle + img.angle,
                                    scaleX: pData.scaleX * img.scaleX,
                                    scaleY: pData.scaleY * img.scaleY,
                                    selectable: false,
                                    evented: false,
                                    // @ts-ignore
                                    id: pData.id
                                });
                                canvas.add(newPath);
                                // Update objMap so stack management can find it
                                // @ts-ignore
                                objMap.set(pData.id, newPath);
                                return newPath;
                            });
                        } else {
                            path.set({
                                left: worldPoint.x,
                                top: worldPoint.y,
                                angle: pData.angle + img.angle,
                                scaleX: pData.scaleX * img.scaleX,
                                scaleY: pData.scaleY * img.scaleY,
                                selectable: false,
                                evented: false
                            });
                            return Promise.resolve(path);
                        }
                    });
                    
                    return Promise.all(brushPromises);
                });
            } else {
                return fabric.Image.fromURL(layer.image).then(async (newImg) => {
                    newImg.set({
                        left: layer.x,
                        top: layer.y,
                        scaleX: layer.scale,
                        scaleY: layer.scale,
                        angle: layer.rotation,
                        opacity: layer.opacity,
                        visible: layer.visible,
                        // @ts-ignore
                        id: layer.id,
                        originX: 'center',
                        originY: 'center',
                        selectable: !layer.locked,
                        evented: !layer.locked
                    });

                    // Apply Filters (HSL) for new image
                    const filters: any[] = [];
                    
                    if (layer.hue && layer.hue !== 0) {
                        filters.push(new fabric.filters.HueRotation({
                            rotation: layer.hue / 180 
                        }));
                    }

                    if (layer.saturation && layer.saturation !== 0) {
                        filters.push(new fabric.filters.Saturation({
                            saturation: layer.saturation / 100
                        }));
                    }

                    if (layer.brightness && layer.brightness !== 0) {
                        filters.push(new fabric.filters.Brightness({
                            brightness: layer.brightness / 100
                        }));
                    }

                    if (layer.contrast && layer.contrast !== 0) {
                        filters.push(new fabric.filters.Contrast({
                            contrast: layer.contrast / 100
                        }));
                    }

                    if (layer.exposure && layer.exposure !== 0) {
                        const exposureFactor = Math.pow(2, layer.exposure);
                        filters.push(new fabric.filters.ColorMatrix({
                            matrix: [
                                exposureFactor, 0, 0, 0, 0,
                                0, exposureFactor, 0, 0, 0,
                                0, 0, exposureFactor, 0, 0,
                                0, 0, 0, 1, 0
                            ]
                        }));
                    }

                    if (layer.gamma && layer.gamma !== 0) {
                         let gVal = 1;
                         if (layer.gamma > 0) gVal = 1 + (layer.gamma / 100) * 1.5;
                         else gVal = 1 - (Math.abs(layer.gamma) / 100) * 0.9;
                         
                         filters.push(new fabric.filters.Gamma({
                             gamma: [gVal, gVal, gVal]
                         }));
                    }

                    if (layer.levels) {
                        const inBlack = layer.levels.inputBlack;
                        const inWhite = layer.levels.inputWhite;
                        const inGamma = layer.levels.gamma;
                        const outBlack = layer.levels.outputBlack;
                        const outWhite = layer.levels.outputWhite;

                        if (inWhite !== inBlack) {
                            const scale = 255 / (inWhite - inBlack);
                            const offset = -(inBlack / 255) * scale;
                            filters.push(new fabric.filters.ColorMatrix({
                                matrix: [
                                    scale, 0, 0, 0, offset,
                                    0, scale, 0, 0, offset,
                                    0, 0, scale, 0, offset,
                                    0, 0, 0, 1, 0
                                ]
                            }));
                        }

                        if (inGamma !== 1) {
                            filters.push(new fabric.filters.Gamma({
                                gamma: [inGamma, inGamma, inGamma]
                            }));
                        }

                        if (outWhite !== outBlack) {
                            const scaleOut = (outWhite - outBlack) / 255;
                            const offsetOut = outBlack / 255;
                            filters.push(new fabric.filters.ColorMatrix({
                                matrix: [
                                    scaleOut, 0, 0, 0, offsetOut,
                                    0, scaleOut, 0, 0, offsetOut,
                                    0, 0, scaleOut, 0, offsetOut,
                                    0, 0, 0, 1, 0
                                ]
                            }));
                        }
                    }

                    if (layer.curves) {
                        const lut = calculateCurvesLUT(layer.curves);
                        // @ts-ignore
                        // @ts-ignore
                        filters.push(new Curves_v3({ lut }));
                    }

                    if (layer.colorBalance) {
                        console.log('[FabricCanvas] Adding ColorBalanceFilter', layer.colorBalance);
                        filters.push(new ColorBalanceFilter({
                            shadows: layer.colorBalance.shadows,
                            midtones: layer.colorBalance.midtones,
                            highlights: layer.colorBalance.highlights,
                            preserveLuminosity: layer.colorBalance.preserveLuminosity
                        }));
                    } else {
                        console.log('[FabricCanvas] No colorBalance data for layer', layer.id);
                    }

                    if (layer.selectiveColor) {
                        console.log('[FabricCanvas] Adding SelectiveColorFilter', layer.selectiveColor);
                        filters.push(new SelectiveColorFilter({
                            reds: layer.selectiveColor.reds,
                            yellows: layer.selectiveColor.yellows,
                            greens: layer.selectiveColor.greens,
                            cyans: layer.selectiveColor.cyans,
                            blues: layer.selectiveColor.blues,
                            magentas: layer.selectiveColor.magentas,
                            whites: layer.selectiveColor.whites,
                            neutrals: layer.selectiveColor.neutrals,
                            blacks: layer.selectiveColor.blacks,
                            relative: layer.selectiveColor.relative
                        }));
                    }

                    if (layer.blur && layer.blur > 0) {
                        filters.push(new fabric.filters.Blur({
                            blur: layer.blur
                        }));
                    }

                    if (layer.noise && layer.noise > 0) {
                        filters.push(new fabric.filters.Noise({
                            noise: layer.noise
                        }));
                    }

                    if (layer.sharpen && layer.sharpen > 0) {
                        const s = layer.sharpen;
                        filters.push(new fabric.filters.Convolute({
                            matrix: [
                                0, -s, 0,
                                -s, 4 * s + 1, -s,
                                0, -s, 0
                            ]
                        }));
                    }

                    newImg.filters = filters;
                    newImg.applyFilters();

                    if (layer.eraserPaths) {
                        const spacer = new fabric.Rect({
                            width: 10000,
                            height: 10000,
                            fill: 'transparent',
                            left: 0,
                            top: 0,
                            originX: 'center',
                            originY: 'center',
                            selectable: false,
                            evented: false,
                            // @ts-ignore
                            id: 'spacer-eraser'
                        });
                        const clipGroup = new fabric.Group([spacer], {
                            inverted: true,
                            absolutePositioned: false,
                            originX: 'center',
                            originY: 'center',
                            left: 0,
                            top: 0
                        });
                        newImg.set({ clipPath: clipGroup });

                        const pathPromises = layer.eraserPaths.map(pData => fabric.Path.fromObject(pData).then(path => {
                            path.set({
                                left: pData.left,
                                top: pData.top,
                                scaleX: pData.scaleX,
                                scaleY: pData.scaleY,
                                angle: pData.angle,
                                stroke: 'black',
                                fill: '',
                                selectable: false,
                                evented: false,
                                // @ts-ignore
                                id: pData.id,
                                originX: pData.originX || 'left',
                                originY: pData.originY || 'top',
                                pathOffset: pData.pathOffset || { x: 0, y: 0 }
                            });
                            clipGroup.add(path);
                        }));
                        return Promise.all(pathPromises).then(() => {
                            clipGroup.set({ left: 0, top: 0 });
                            newImg.dirty = true;
                            canvas.add(newImg);
                        });
                    } else {
                        canvas.add(newImg);
                    }

                    // Render brush paths for new image
                    const brushPromises = (layer.brushPaths || []).map(pData => {
                        const matrix = newImg.calcTransformMatrix();
                        const worldPoint = fabric.util.transformPoint(new fabric.Point(pData.left, pData.top), matrix);

                        return fabric.Path.fromObject(pData).then(newPath => {
                            newPath.set({
                                left: worldPoint.x,
                                top: worldPoint.y,
                                angle: pData.angle + newImg.angle,
                                scaleX: pData.scaleX * newImg.scaleX,
                                scaleY: pData.scaleY * newImg.scaleY,
                                selectable: false,
                                evented: false,
                                // @ts-ignore
                                id: pData.id
                            });
                            canvas.add(newPath);
                            // Update objMap so stack management can find it
                            // @ts-ignore
                            objMap.set(pData.id, newPath);
                            return newPath;
                        });
                    });
                    
                    return Promise.all(brushPromises);
                });
            }
        });

        Promise.all(loadPromises)
            .then(() => {
                let currentStackIndex = 0;
                const objects = canvas.getObjects();
                layersToRender.forEach((layer) => {
                    // @ts-ignore
                    const img = objMap.get(layer.id);
                    if (img) {
                        if (objects[currentStackIndex] !== img) {
                            canvas.moveObjectTo(img, currentStackIndex);
                        }
                        currentStackIndex++;
                        if (layer.brushPaths) {
                            layer.brushPaths.forEach(pData => {
                                // @ts-ignore
                                const path = objMap.get(pData.id);
                                if (path) {
                                    if (objects[currentStackIndex] !== path) {
                                        canvas.moveObjectTo(path, currentStackIndex);
                                    }
                                    currentStackIndex++;
                                }
                            });
                        }
                    }
                });
                canvas.requestRenderAll();

                // Restore Selection
                if (props.selectedLayerId) {
                    // @ts-ignore
                    const selectedObj = canvas.getObjects().find(o => o.id === props.selectedLayerId);
                    if (selectedObj) {
                        canvas.setActiveObject(selectedObj);
                    }
                }
            })
            .catch(error => {
                console.error("Error updating layers:", error);
            })
            .finally(() => {
                isUpdatingRef.current = false;
                if (pendingLayersRef.current) updateLayers(pendingLayersRef.current);
            });
    };


    useEffect(() => {
        console.log('[FabricCanvas] layers prop changed', layers.length, layers[0]?.colorBalance);
        updateLayers(layers);
    }, [layers]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || isUpdatingRef.current) return;
        if (selectedLayerId) {
            // @ts-ignore
            const obj = canvas.getObjects().find(o => o.id === selectedLayerId);
            if (obj && canvas.getActiveObject() !== obj) {
                canvas.setActiveObject(obj);
                canvas.requestRenderAll();
            }
        } else {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }
    }, [selectedLayerId]);

    return (
        <div className="w-full h-full flex items-center justify-center bg-[#111] overflow-hidden">
            <div
                className="relative shadow-2xl"
                style={{
                    width,
                    height,
                    backgroundColor: '#1a1a1a',
                    backgroundImage: `url("${CHECKERBOARD_BG}")`,
                    backgroundSize: '16px 16px'
                }}
            >
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
});

FabricCanvas.displayName = 'FabricCanvas';
