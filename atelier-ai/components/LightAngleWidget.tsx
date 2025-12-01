import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

interface LightAngleWidgetProps {
    value: { azimuth: number, elevation: number };
    onChange: (val: { azimuth: number, elevation: number }) => void;
    size?: number;
}

export const LightAngleWidget: React.FC<LightAngleWidgetProps> = ({ value, onChange, size = 160 }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleInteraction = (clientX: number, clientY: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = clientX - centerX;
        const dy = clientY - centerY;

        // Calculate Azimuth (Angle around center)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Convert to 0-360 starting from Right (standard unit circle)
        // We want 0 to be "Front" (Bottom) or "Top"? 
        // Let's stick to standard polar: 0 is Right, 90 is Bottom, 180 is Left, -90 is Top.
        // But for lighting, usually Top-Left is standard key.
        // Let's just output raw degrees and handle mapping in translator.
        const azimuth = Math.round(angle + 90); // Shift so 0 is Top

        // Calculate Elevation (Distance from center)
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDist = size / 2;
        // Map distance to elevation: Center = 90 (Top down), Edge = 0 (Horizon)
        // We can go negative for under-lighting if outside circle? Let's clamp to edge for now.
        const normalizedDist = Math.min(distance, maxDist) / maxDist;
        const elevation = Math.round(90 - (normalizedDist * 90));

        onChange({ azimuth, elevation });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleInteraction(e.clientX, e.clientY);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            handleInteraction(e.clientX, e.clientY);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Visual Position Calculation
    const radius = size / 2;
    // Invert elevation logic for display: 90deg is center (r=0), 0deg is edge (r=radius)
    const displayR = ((90 - value.elevation) / 90) * radius;
    const rad = (value.azimuth - 90) * (Math.PI / 180); // Undo shift for display math
    const knobX = Math.cos(rad) * displayR + radius;
    const knobY = Math.sin(rad) * displayR + radius;

    return (
        <div className="flex flex-col items-center gap-2 select-none">
            <div
                ref={containerRef}
                className="relative rounded-full bg-[#111] border border-[#333] shadow-inner cursor-crosshair group"
                style={{ width: size, height: size }}
                onMouseDown={handleMouseDown}
            >
                {/* Grid Lines */}
                <div className="absolute inset-0 rounded-full border border-[#222] scale-50 opacity-50" />
                <div className="absolute inset-0 rounded-full border border-[#222] scale-75 opacity-30" />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#222]" />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-[#222]" />

                {/* Light Source Knob */}
                <div
                    className="absolute w-4 h-4 -ml-2 -mt-2 bg-fashion-accent rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] border border-white z-10 transition-transform active:scale-125"
                    style={{ left: knobX, top: knobY }}
                >
                    {value.elevation > 80 ? (
                        <Sun className="w-full h-full p-0.5 text-black" />
                    ) : (
                        <div className="w-full h-full bg-white/50 rounded-full" />
                    )}
                </div>

                {/* Ray Visualization (Subtle) */}
                <div
                    className="absolute left-1/2 top-1/2 h-0.5 bg-gradient-to-r from-transparent to-fashion-accent/20 origin-left pointer-events-none"
                    style={{
                        width: displayR,
                        transform: `rotate(${value.azimuth - 90}deg)`
                    }}
                />
            </div>

            <div className="flex gap-4 text-[10px] font-mono text-gray-500">
                <span>AZ: {value.azimuth}°</span>
                <span>EL: {value.elevation}°</span>
            </div>
        </div>
    );
};
