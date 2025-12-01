import React from 'react';
import { LightPresetConfig, CameraPresetConfig, LightPreset, CameraPreset } from '../presets';
import { Check } from 'lucide-react';

interface PresetSelectorProps<T extends LightPresetConfig | CameraPresetConfig> {
    presets: T[];
    selected: string | string[]; // Can be single or array
    onSelect: (id: string | string[]) => void;
    title: string;
    multiSelect?: boolean; // New prop for multi-select mode
    maxSelect?: number; // Maximum selections allowed
}

export function PresetSelector<T extends LightPresetConfig | CameraPresetConfig>({
    presets,
    selected,
    onSelect,
    title,
    multiSelect = false,
    maxSelect = 3
}: PresetSelectorProps<T>) {
    const selectedArray = Array.isArray(selected) ? selected : [selected];

    const handleClick = (id: string) => {
        if (!multiSelect) {
            onSelect(id);
            return;
        }

        // Multi-select logic
        if (selectedArray.includes(id)) {
            // Deselect
            const newSelected = selectedArray.filter(s => s !== id);
            onSelect(newSelected);
        } else {
            // Select (if under max limit)
            if (selectedArray.length < maxSelect) {
                onSelect([...selectedArray, id]);
            }
        }
    };

    return (
        <div className="space-y-2">
            {title && (
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {title} {multiSelect && `(${selectedArray.length}/${maxSelect})`}
                </label>
            )}
            <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => {
                    const isSelected = selectedArray.includes(preset.id);

                    return (
                        <button
                            key={preset.id}
                            onClick={() => handleClick(preset.id)}
                            className={`
                                relative p-3 rounded-lg border-2 transition-all text-left
                                ${isSelected
                                    ? 'border-yellow-500 bg-yellow-500/10'
                                    : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                                }
                            `}
                        >
                            <div className="flex items-start gap-2">
                                <span className="text-2xl">{preset.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-white truncate">
                                        {preset.label}
                                    </div>
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        {preset.description}
                                    </div>
                                </div>
                            </div>
                            {isSelected && (
                                <div className="absolute top-1 right-1">
                                    {multiSelect ? (
                                        <div className="w-5 h-5 bg-yellow-500 rounded flex items-center justify-center">
                                            <Check className="w-3 h-3 text-black" />
                                        </div>
                                    ) : (
                                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    )}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
