import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Eraser, Brush } from 'lucide-react';

interface EmbeddedMaskEditorProps {
    imageUrl: string;
    initialMaskData: string | null;
    onSave: (maskData: string) => void;
    onClose: () => void;
}

export const EmbeddedMaskEditor: React.FC<EmbeddedMaskEditorProps> = ({ imageUrl, initialMaskData, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(20);
    const [mode, setMode] = useState<'brush' | 'eraser'>('brush');

    // Initialize Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw initial mask if exists
            if (initialMaskData) {
                const maskImg = new Image();
                maskImg.src = initialMaskData;
                maskImg.onload = () => {
                    ctx.drawImage(maskImg, 0, 0);
                };
            } else {
                // Clear (Transparent)
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };
    }, [imageUrl]);

    const getCoords = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const draw = (e: React.MouseEvent) => {
        if (!isDrawing || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoords(e);

        ctx.globalCompositeOperation = mode === 'brush' ? 'source-over' : 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = mode === 'brush' ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0,0,0,1)'; // Red semi-transparent for visibility
        ctx.fill();
    };

    const handleSave = () => {
        if (!canvasRef.current) return;
        // Export as B/W Mask
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasRef.current.width;
        exportCanvas.height = canvasRef.current.height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;

        // Fill Black
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Draw Mask as White
        // We need to use the alpha channel of the drawing canvas
        ctx.drawImage(canvasRef.current, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        onSave(exportCanvas.toDataURL('image/png'));
        onClose();
    };

    return (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="h-10 bg-[#1a1a1a] border-b border-[#333] flex items-center justify-between px-2 shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMode('brush')}
                        className={`p-1.5 rounded ${mode === 'brush' ? 'bg-fashion-accent text-black' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Brush className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setMode('eraser')}
                        className={`p-1.5 rounded ${mode === 'eraser' ? 'bg-fashion-accent text-black' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Eraser className="w-4 h-4" />
                    </button>
                    <input
                        type="range" min="5" max="100"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-20 accent-fashion-accent"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleSave} className="p-1.5 text-green-400 hover:bg-green-900/30 rounded"><Check className="w-4 h-4" /></button>
                    <button onClick={onClose} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded"><X className="w-4 h-4" /></button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#0a0a0a]">
                <div className="relative shadow-2xl border border-[#333]">
                    <img src={imageUrl} className="max-w-full max-h-[80vh] block opacity-50" draggable={false} />
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full cursor-crosshair"
                        onMouseDown={() => setIsDrawing(true)}
                        onMouseMove={draw}
                        onMouseUp={() => setIsDrawing(false)}
                        onMouseLeave={() => setIsDrawing(false)}
                    />
                </div>
            </div>
        </div>
    );
};
