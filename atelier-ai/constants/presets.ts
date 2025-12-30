export interface CurvePoint {
    x: number;
    y: number;
}

export interface CurvesPreset {
    id: string;
    name: string;
    curves: {
        master: CurvePoint[];
        red: CurvePoint[];
        green: CurvePoint[];
        blue: CurvePoint[];
    };
}

const DEFAULT_CURVE = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

export const CURVES_PRESETS: CurvesPreset[] = [
    {
        id: 'default',
        name: 'Default',
        curves: {
            master: DEFAULT_CURVE,
            red: DEFAULT_CURVE,
            green: DEFAULT_CURVE,
            blue: DEFAULT_CURVE,
        }
    },
    {
        id: 'high_contrast',
        name: 'High Contrast',
        curves: {
            master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.15 }, { x: 0.75, y: 0.85 }, { x: 1, y: 1 }],
            red: DEFAULT_CURVE,
            green: DEFAULT_CURVE,
            blue: DEFAULT_CURVE,
        }
    },
    {
        id: 'low_contrast',
        name: 'Low Contrast',
        curves: {
            master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.35 }, { x: 0.75, y: 0.65 }, { x: 1, y: 1 }],
            red: DEFAULT_CURVE,
            green: DEFAULT_CURVE,
            blue: DEFAULT_CURVE,
        }
    },
    {
        id: 'vintage',
        name: 'Vintage',
        curves: {
            master: [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.9 }], // Lifted blacks, crushed whites
            red: [{ x: 0, y: 0 }, { x: 0.5, y: 0.55 }, { x: 1, y: 1 }], // Slight red boost in mids
            green: DEFAULT_CURVE,
            blue: [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.9 }], // Lifted blue blacks (faded look)
        }
    },
    {
        id: 'warm',
        name: 'Warm',
        curves: {
            master: DEFAULT_CURVE,
            red: [{ x: 0, y: 0 }, { x: 0.5, y: 0.55 }, { x: 1, y: 1 }], // Boost Red
            green: DEFAULT_CURVE,
            blue: [{ x: 0, y: 0 }, { x: 0.5, y: 0.45 }, { x: 1, y: 1 }], // Cut Blue
        }
    },
    {
        id: 'cool',
        name: 'Cool',
        curves: {
            master: DEFAULT_CURVE,
            red: [{ x: 0, y: 0 }, { x: 0.5, y: 0.45 }, { x: 1, y: 1 }], // Cut Red
            green: DEFAULT_CURVE,
            blue: [{ x: 0, y: 0 }, { x: 0.5, y: 0.55 }, { x: 1, y: 1 }], // Boost Blue
        }
    },
    {
        id: 'matte',
        name: 'Matte',
        curves: {
            master: [{ x: 0, y: 0.15 }, { x: 0.3, y: 0.25 }, { x: 0.7, y: 0.75 }, { x: 1, y: 0.85 }], // Faded blacks and whites
            red: DEFAULT_CURVE,
            green: DEFAULT_CURVE,
            blue: DEFAULT_CURVE,
        }
    }
];
