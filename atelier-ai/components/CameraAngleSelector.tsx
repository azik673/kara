import React from 'react';
import { Camera, Eye, ArrowDown, ArrowUp, Maximize, Minimize } from 'lucide-react';

interface CameraAngleSelectorProps {
    value: { distance: string, heightRatio: number, framing: string };
    onChange: (val: { distance: string, heightRatio: number, framing: string }) => void;
}

const PRESETS = [
    {
        id: 'eye-level',
        label: 'Eye Level',
        icon: Eye,
        data: { distance: 'medium', heightRatio: 0, framing: 'portrait' }
    },
    {
        id: 'low-angle',
        label: 'Low Angle',
        icon: ArrowUp,
        data: { distance: 'close', heightRatio: -0.5, framing: 'full-body' }
    },
    {
        id: 'high-angle',
        label: 'High Angle',
        icon: ArrowDown,
        data: { distance: 'medium', heightRatio: 0.5, framing: 'full-body' }
    },
    {
        id: 'birds-eye',
        label: "Bird's Eye",
        icon: ArrowDown,
        data: { distance: 'far', heightRatio: 0.9, framing: 'wide' }
    },
    {
        id: 'close-up',
        label: 'Close Up',
        icon: Maximize,
        data: { distance: 'close', heightRatio: 0, framing: 'portrait' }
    },
    {
        id: 'wide-shot',
        label: 'Wide Shot',
        icon: Minimize,
        data: { distance: 'wide', heightRatio: 0, framing: 'full-body' }
    }
];

export const CameraAngleSelector: React.FC<CameraAngleSelectorProps> = ({ value, onChange }) => {

    const isSelected = (preset: any) => {
        // Simple heuristic for selection state
        return preset.data.distance === value.distance &&
            Math.abs(preset.data.heightRatio - value.heightRatio) < 0.2;
    };

    return (
        <div className="grid grid-cols-3 gap-2">
            {PRESETS.map(preset => (
                <button
                    key={preset.id}
                    onClick={() => onChange(preset.data as any)}
                    className={`
                        flex flex-col items-center justify-center p-2 rounded border transition-all
                        ${isSelected(preset)
                            ? 'bg-fashion-accent/10 border-fashion-accent text-fashion-accent'
                            : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-gray-500 hover:text-gray-300'}
                    `}
                >
                    <preset.icon className="w-4 h-4 mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">{preset.label}</span>
                </button>
            ))}
        </div>
    );
};
