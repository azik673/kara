import React from 'react';
import { X, Type, Palette, Layout, MousePointer2, Zap } from 'lucide-react';

interface PropertiesPanelProps {
    elementId: string | null;
    elementType?: 'BUTTON' | 'TEXT' | 'BOX';
    layout: {
        x: number;
        y: number;
        scale: number;
        backgroundColor?: string;
        color?: string;
        borderRadius?: number;
        opacity?: number;
        fontSize?: number;
        label?: string;
        action?: string;
    };
    onUpdate: (updates: any) => void;
    onClose: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    elementId,
    elementType,
    layout,
    onUpdate,
    onClose
}) => {
    if (!elementId) return null;

    return (
        <div className="fixed right-8 top-24 w-72 bg-black/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl z-[100] overflow-hidden flex flex-col animate-in slide-in-from-right-4 duration-300 pointer-events-auto">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-fashion-accent/20 rounded-xl">
                        <MousePointer2 className="w-4 h-4 text-fashion-accent" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest">Properties</h3>
                        <p className="text-[10px] text-white/40 font-mono">{elementId}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col gap-8 overflow-y-auto max-h-[70vh]">
                {/* Text Content */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-white/40">
                        <Type className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Content</span>
                    </div>
                    <input
                        type="text"
                        value={layout.label || ''}
                        onChange={(e) => onUpdate({ label: e.target.value })}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-fashion-accent/50 transition-all"
                        placeholder="Element Label"
                    />
                </div>

                {/* Appearance */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-white/40">
                        <Palette className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Appearance</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[9px] text-white/30 uppercase font-bold">Background</label>
                            <input
                                type="color"
                                value={layout.backgroundColor || '#000000'}
                                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                                className="w-full h-8 bg-transparent border-none cursor-pointer rounded-lg overflow-hidden"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[9px] text-white/30 uppercase font-bold">Text Color</label>
                            <input
                                type="color"
                                value={layout.color || '#ffffff'}
                                onChange={(e) => onUpdate({ color: e.target.value })}
                                className="w-full h-8 bg-transparent border-none cursor-pointer rounded-lg overflow-hidden"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between">
                            <label className="text-[9px] text-white/30 uppercase font-bold">Corner Radius</label>
                            <span className="text-[9px] text-fashion-accent font-mono">{layout.borderRadius || 0}px</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="40"
                            value={layout.borderRadius || 0}
                            onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) })}
                            className="accent-fashion-accent"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between">
                            <label className="text-[9px] text-white/30 uppercase font-bold">Opacity</label>
                            <span className="text-[9px] text-fashion-accent font-mono">{Math.round((layout.opacity || 1) * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={layout.opacity || 1}
                            onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
                            className="accent-fashion-accent"
                        />
                    </div>
                </div>

                {/* Actions (Only for Buttons) */}
                {elementType === 'BUTTON' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-white/40">
                            <Zap className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Actions</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[9px] text-white/30 uppercase font-bold">On Click</label>
                            <select
                                value={layout.action || 'NONE'}
                                onChange={(e) => onUpdate({ action: e.target.value })}
                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-fashion-accent/50 transition-all appearance-none"
                            >
                                <option value="NONE" className="bg-zinc-900">None</option>
                                <option value="EXECUTE_FLOW" className="bg-zinc-900">Execute Flow</option>
                                <option value="TOGGLE_LIBRARY" className="bg-zinc-900">Toggle Library</option>
                                <option value="OPEN_SETTINGS" className="bg-zinc-900">Open Settings</option>
                                <option value="RESET_LAYOUT" className="bg-zinc-900">Reset Layout</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Layout */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-white/40">
                        <Layout className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Layout</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[9px] text-white/30 uppercase font-bold">X Position</label>
                            <input
                                type="number"
                                value={Math.round(layout.x)}
                                onChange={(e) => onUpdate({ x: parseInt(e.target.value) })}
                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[9px] text-white/30 uppercase font-bold">Y Position</label>
                            <input
                                type="number"
                                value={Math.round(layout.y)}
                                onChange={(e) => onUpdate({ y: parseInt(e.target.value) })}
                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
