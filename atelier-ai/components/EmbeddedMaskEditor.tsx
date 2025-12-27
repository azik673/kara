import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Check, Eraser, Brush, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';

interface EmbeddedMaskEditorProps {
    imageUrl: string;
    initialMaskData: string | null;
    onSave: (maskData: string) => void;
    onClose: () => void;
}

export const EmbeddedMaskEditor: React.FC<EmbeddedMaskEditorProps> = ({ imageUrl, initialMaskData, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(20);
    const [mode, setMode] = useState<'brush'>('brush');
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Window State
    const [windowRect, setWindowRect] = useState({ x: 100, y: 100, width: 900, height: 700 });
    const [isDraggingWindow, setIsDraggingWindow] = useState(false);
    const [isResizingWindow, setIsResizingWindow] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

    // Initialize Window Position (Center)
    useEffect(() => {
        setWindowRect({
            x: (window.innerWidth - 900) / 2,
            y: (window.innerHeight - 700) / 2,
            width: 900,
            height: 700
        });
    }, []);

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
                    // Convert White strokes to Red for editing
                    ctx.globalCompositeOperation = 'source-in';
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    // Reset composite operation
                    ctx.globalCompositeOperation = 'source-over';
                };
            } else {
                // Clear (Transparent)
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }

            // Initial Fit
            if (containerRef.current) {
                const container = containerRef.current;
                const scale = Math.min(container.clientWidth / img.width, container.clientHeight / img.height) * 0.9;
                setZoom(scale);
                setPan({
                    x: (container.clientWidth - img.width * scale) / 2,
                    y: (container.clientHeight - img.height * scale) / 2
                });
            }
        };
    }, [imageUrl]);

    // Coordinate Transformation
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

    const lastDrawPos = useRef({ x: 0, y: 0 });

    const drawLine = (start: { x: number, y: number }, end: { x: number, y: number }) => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.stroke();
    };



    const handleSave = () => {
        if (!canvasRef.current) return;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasRef.current.width;
        exportCanvas.height = canvasRef.current.height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;

        // Clear (Transparent)
        ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Draw current canvas (Red strokes)
        ctx.drawImage(canvasRef.current, 0, 0);

        // Convert Red strokes to White
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        onSave(exportCanvas.toDataURL('image/png'));
        onClose();
    };

    // --- WINDOW DRAG & RESIZE ---
    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName === 'BUTTON') return;
        if ((e.target as HTMLElement).closest('input')) return; // Don't drag if clicking input

        setIsDraggingWindow(true);
        dragOffset.current = { x: e.clientX - windowRect.x, y: e.clientY - windowRect.y };
    };

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizingWindow(true);
        resizeStart.current = { x: e.clientX, y: e.clientY, width: windowRect.width, height: windowRect.height };
    };

    useEffect(() => {
        const handleGlobalMove = (e: MouseEvent) => {
            if (isDraggingWindow) {
                setWindowRect(prev => ({
                    ...prev,
                    x: e.clientX - dragOffset.current.x,
                    y: e.clientY - dragOffset.current.y
                }));
            }
            if (isResizingWindow) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                setWindowRect(prev => ({
                    ...prev,
                    width: Math.max(500, resizeStart.current.width + dx),
                    height: Math.max(400, resizeStart.current.height + dy)
                }));
            }
        };

        const handleGlobalUp = () => {
            setIsDraggingWindow(false);
            setIsResizingWindow(false);
        };

        if (isDraggingWindow || isResizingWindow) {
            window.addEventListener('mousemove', handleGlobalMove);
            window.addEventListener('mouseup', handleGlobalUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [isDraggingWindow, isResizingWindow]);


    // --- CANVAS HANDLERS ---
    // --- CANVAS HANDLERS ---
    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Right Click (button 2) or Alt+Left Click for Panning
        if (e.button === 2 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        } else if (e.button === 0) {
            setIsDrawing(true);
            const coords = getCoords(e);
            lastDrawPos.current = coords;
            // Draw a dot for the initial click
            drawLine(coords, coords);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isPanning) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        } else if (isDrawing) {
            const coords = getCoords(e);
            drawLine(lastDrawPos.current, coords);
            lastDrawPos.current = coords;
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDrawing(false);
        setIsPanning(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const scale = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.min(Math.max(z * scale, 0.1), 10));
    };

    const content = (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* Dimmed Background (Optional - allows seeing behind but blocks interaction) */}
            <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={onClose} />

            {/* Window */}
            <div
                className="absolute bg-[#1a1a1a] border border-[#333] shadow-2xl flex flex-col pointer-events-auto rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{
                    left: windowRect.x,
                    top: windowRect.y,
                    width: windowRect.width,
                    height: windowRect.height,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                }}
            >
                {/* Header / Toolbar */}
                <div
                    className="h-14 bg-[#222] border-b border-[#333] flex items-center justify-between px-4 shrink-0 cursor-move select-none"
                    onMouseDown={handleHeaderMouseDown}
                >
                    <div className="flex items-center gap-4">
                        <span className="font-bold text-lg tracking-wider text-gray-200 flex items-center gap-2">
                            <Brush className="w-4 h-4 text-fashion-accent" />
                            MASK EDITOR
                        </span>
                        <div className="h-6 w-px bg-gray-700 mx-2" />

                        {/* Tools */}
                        <div className="flex items-center gap-2 bg-black/50 p-1 rounded-lg border border-gray-800">
                            <button
                                onClick={() => setMode('brush')}
                                className={`p-1.5 rounded flex items-center gap-2 ${mode === 'brush' ? 'bg-fashion-accent text-black font-bold' : 'text-gray-400 hover:bg-white/10'}`}
                            >
                                <Brush className="w-3.5 h-3.5" />
                                <span className="text-xs">Brush</span>
                            </button>

                        </div>

                        {/* Brush Size */}
                        <div className="flex items-center gap-3 ml-4">
                            <span className="text-xs text-gray-400 uppercase">Size</span>
                            <input
                                type="range" min="5" max="200"
                                value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-24 accent-fashion-accent"
                            />
                            <span className="text-xs font-mono w-8">{brushSize}px</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-[10px] text-gray-500 mr-2 flex flex-col items-end leading-tight">
                            <span>Right-Click / Alt+Drag to Pan</span>
                            <span>Scroll to Zoom</span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div
                    ref={containerRef}
                    className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#050505] cursor-crosshair"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={(e) => e.preventDefault()} // Prevent context menu for Right Click panning
                >
                    {/* Transform Container */}
                    <div
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: '0 0',
                            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                        }}
                        className="relative shadow-2xl border border-[#333]"
                    >
                        <img
                            src={imageUrl}
                            className="block pointer-events-none select-none opacity-60"
                            draggable={false}
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full"
                        />
                    </div>

                    {/* Zoom Indicator */}
                    <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded text-xs text-gray-400 border border-white/10 pointer-events-none">
                        {Math.round(zoom * 100)}%
                    </div>
                </div>

                {/* Footer / Save Action */}
                <div className="h-12 bg-[#1a1a1a] border-t border-[#333] flex items-center justify-end px-4 gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 rounded text-gray-400 hover:text-white text-xs font-medium hover:bg-white/5"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-1.5 bg-fashion-accent hover:bg-yellow-500 text-black font-bold rounded text-xs uppercase tracking-wider flex items-center gap-2"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Save Mask
                    </button>
                </div>

                {/* Resize Handle */}
                <div
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center z-50 group"
                    onMouseDown={handleResizeMouseDown}
                >
                    <div className="w-2 h-2 border-r-2 border-b-2 border-gray-500 group-hover:border-fashion-accent" />
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(content, document.body);
};
