import React, { useState, useRef, useEffect } from 'react';
import { X, Save, SplitSquareHorizontal, Download } from 'lucide-react';

interface ComparisonViewModalProps {
    imageA: string;
    imageB: string;
    labelA?: string;
    labelB?: string;
    onClose: () => void;
    onSave?: () => void;
}

export const ComparisonViewModal: React.FC<ComparisonViewModalProps> = ({
    imageA,
    imageB,
    labelA = "Variant A",
    labelB = "Variant B",
    onClose,
    onSave
}) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = (x / rect.width) * 100;
        setSliderPosition(percent);
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="w-full max-w-6xl flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <SplitSquareHorizontal className="w-6 h-6 text-fashion-accent" />
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-wider">Comparison View</h2>
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Manual Evaluation Mode</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onSave && (
                        <button
                            onClick={onSave}
                            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-fashion-accent text-white rounded transition-all text-xs font-bold uppercase tracking-wider"
                        >
                            <Save className="w-4 h-4" />
                            Save Snapshot
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Comparison Area */}
            <div
                ref={containerRef}
                className="relative w-full max-w-6xl aspect-video bg-[#0a0a0a] border border-[#333] rounded-lg overflow-hidden select-none shadow-2xl"
            >
                {/* Image A (Background - Right Side) */}
                <img
                    src={imageB}
                    alt={labelB}
                    className="absolute inset-0 w-full h-full object-contain"
                />

                {/* Image B (Foreground - Left Side - Clipped) */}
                <div
                    className="absolute inset-0 overflow-hidden border-r-2 border-fashion-accent bg-[#0a0a0a]"
                    style={{ width: `${sliderPosition}%` }}
                >
                    <img
                        src={imageA}
                        alt={labelA}
                        className="absolute top-0 left-0 max-w-none h-full object-contain"
                        style={{ width: containerRef.current?.clientWidth }}
                    />
                </div>

                {/* Slider Handle */}
                <div
                    className="absolute top-0 bottom-0 w-1 bg-transparent cursor-ew-resize z-10 flex items-center justify-center group"
                    style={{ left: `${sliderPosition}%` }}
                    onMouseDown={handleMouseDown}
                >
                    <div className="w-8 h-8 bg-fashion-accent rounded-full shadow-lg flex items-center justify-center transform transition-transform group-hover:scale-110">
                        <SplitSquareHorizontal className="w-4 h-4 text-black" />
                    </div>
                </div>

                {/* Labels */}
                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur px-3 py-1 rounded border border-gray-700 text-xs font-bold text-white pointer-events-none">
                    {labelA}
                </div>
                <div className="absolute top-4 right-4 bg-black/70 backdrop-blur px-3 py-1 rounded border border-gray-700 text-xs font-bold text-white pointer-events-none">
                    {labelB}
                </div>
            </div>

            {/* Instructions */}
            <div className="mt-4 text-gray-500 text-xs text-center">
                Drag the slider to compare details. No changes are saved unless you explicitly commit.
            </div>
        </div>
    );
};
