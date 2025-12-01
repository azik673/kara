
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Node, Port, NodeStatus, Edge } from '../types';
import { NODE_REGISTRY } from '../services/nodeEngine';
import { Settings2, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, ChevronDown, ChevronUp, Repeat, MousePointer2, ZoomIn, ZoomOut, RefreshCcw, Move, Maximize2, Minimize2, Save, Lock, AlertTriangle, ArrowRightCircle, History, Cpu, Brush, Sun, SplitSquareHorizontal } from 'lucide-react';
import { EmbeddedMaskEditor } from './EmbeddedMaskEditor';
import { LightAngleWidget } from './LightAngleWidget';

interface NodeBlockProps {
    node: Node;
    nodes?: Node[]; // Access to all nodes for upstream lookup
    edges: Edge[];
    selected: boolean;
    zoom: number; // Graph Zoom Level
    onMouseDown: (e: React.MouseEvent, id: string) => void;
    onPortMouseDown: (e: React.MouseEvent, nodeId: string, portId: string, isInput: boolean) => void;
    onPortMouseUp: (e: React.MouseEvent, nodeId: string, portId: string, isInput: boolean) => void;
    onLoopback: (imageUrl: string, nodeId: string) => void;
    onResize?: (id: string, width: number, height: number) => void;
    onToggleGroup?: (groupId: string) => void;
    onSaveGroup?: (groupId: string) => void;
    onUpdateNodeParams?: (id: string, params: any) => void; // Added for internal updates
    onCompare?: (nodeId: string) => void;
    isComparisonBase?: boolean;
}

const REQUIRED_PORTS: Record<string, string[]> = {};

// --- Extracted Mask Editor Component ---
const MaskEditorCanvas: React.FC<{
    imageUrl: string | null;
    initialMaskData: string | null;
    onUpdateMask: (data: string | null) => void;
    initialBrushSize?: number;
}> = ({ imageUrl, initialMaskData, onUpdateMask, initialBrushSize = 20 }) => {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [brushSize, setBrushSize] = useState(initialBrushSize);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const imageRef = useRef<HTMLImageElement | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const hasFitted = useRef(false);

    const [isPanning, setIsPanning] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        const safeZ = (isFinite(zoom) && zoom > 0) ? zoom : 1;
        ctx.translate(pan.x, pan.y);
        ctx.scale(safeZ, safeZ);

        if (imageRef.current) {
            ctx.drawImage(imageRef.current, 0, 0);
        }

        if (maskCanvasRef.current) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.drawImage(maskCanvasRef.current, 0, 0);
            ctx.restore();
        }

        ctx.restore();
    }, [pan, zoom]);

    const fitImageToCanvas = (img: HTMLImageElement, cvs: HTMLCanvasElement) => {
        if (cvs.width === 0 || cvs.height === 0) return;
        let scale = Math.min(cvs.width / img.width, cvs.height / img.height) * 0.9;
        if (!isFinite(scale) || scale <= 0) scale = 1;
        const x = (cvs.width - img.width * scale) / 2;
        const y = (cvs.height - img.height * scale) / 2;
        setZoom(scale);
        setPan({ x, y });
    };

    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;
        const observer = new ResizeObserver((entries) => {
            requestAnimationFrame(() => {
                if (!Array.isArray(entries) || !entries.length) return;
                const entry = entries[0];
                if (containerRef.current && canvasRef.current) {
                    const newWidth = entry.contentRect.width;
                    const newHeight = entry.contentRect.height;
                    if (canvasRef.current.width !== newWidth || canvasRef.current.height !== newHeight) {
                        canvasRef.current.width = newWidth;
                        canvasRef.current.height = newHeight;
                        if (!hasFitted.current && imageRef.current) {
                            fitImageToCanvas(imageRef.current, canvasRef.current);
                            hasFitted.current = true;
                        }
                        render();
                    }
                }
            });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [render]);

    useEffect(() => {
        if (!imageUrl) return;
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            imageRef.current = img;
            hasFitted.current = false;
            if (!maskCanvasRef.current) maskCanvasRef.current = document.createElement('canvas');
            maskCanvasRef.current.width = img.width;
            maskCanvasRef.current.height = img.height;

            const mCtx = maskCanvasRef.current.getContext('2d');
            if (mCtx) {
                if (initialMaskData) {
                    const maskImg = new Image();
                    maskImg.src = initialMaskData;
                    maskImg.onload = () => {
                        mCtx.clearRect(0, 0, img.width, img.height);
                        mCtx.drawImage(maskImg, 0, 0);
                        mCtx.globalCompositeOperation = 'source-in';
                        mCtx.fillStyle = 'rgba(255, 0, 0, 1)';
                        mCtx.fillRect(0, 0, img.width, img.height);
                        mCtx.globalCompositeOperation = 'source-over';
                        requestAnimationFrame(render);
                    };
                } else {
                    mCtx.clearRect(0, 0, img.width, img.height);
                }
            }
            if (canvasRef.current && canvasRef.current.width > 0) {
                fitImageToCanvas(img, canvasRef.current);
                hasFitted.current = true;
            }
            requestAnimationFrame(render);
        };
    }, [imageUrl]);

    useEffect(() => { requestAnimationFrame(render); });

    const getOriginalCoordinates = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0, canvasX: 0, canvasY: 0 };
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        const worldX = (canvasX - pan.x) / zoom;
        const worldY = (canvasY - pan.y) / zoom;
        return { x: worldX, y: worldY, canvasX, canvasY };
    };

    const saveMask = () => {
        if (!maskCanvasRef.current || !imageRef.current) return;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = maskCanvasRef.current.width;
        exportCanvas.height = maskCanvasRef.current.height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        ctx.drawImage(maskCanvasRef.current, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        onUpdateMask(exportCanvas.toDataURL('image/png'));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 0) {
            setIsPanning(true);
            const coords = getOriginalCoordinates(e.clientX, e.clientY);
            lastMousePos.current = { x: coords.canvasX, y: coords.canvasY };
        } else if (e.button === 2) {
            setIsDrawing(true);
            const pos = getOriginalCoordinates(e.clientX, e.clientY);
            lastMousePos.current = { x: pos.x, y: pos.y };
            drawStroke(pos.x, pos.y, false);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const coords = getOriginalCoordinates(e.clientX, e.clientY);
        if (isPanning) {
            const dx = coords.canvasX - lastMousePos.current.x;
            const dy = coords.canvasY - lastMousePos.current.y;
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: coords.canvasX, y: coords.canvasY };
        } else if (isDrawing) {
            drawStroke(coords.x, coords.y, true);
            lastMousePos.current = { x: coords.x, y: coords.y };
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDrawing) saveMask();
        setIsPanning(false);
        setIsDrawing(false);
    };

    const drawStroke = (x: number, y: number, isLine: boolean) => {
        const ctx = maskCanvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = 'rgba(255, 0, 0, 1)';
        ctx.fillStyle = 'rgba(255, 0, 0, 1)';
        ctx.beginPath();
        if (isLine) {
            ctx.moveTo(lastMousePos.current.x, lastMousePos.current.y);
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        requestAnimationFrame(render);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const { canvasX, x: worldX, y: worldY } = getOriginalCoordinates(e.clientX, e.clientY);
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoom * scaleFactor, 0.1), 20);
        const newPanX = canvasX - (worldX * newZoom);
        const newPanY = getOriginalCoordinates(e.clientX, e.clientY).canvasY - (worldY * newZoom);
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    const clearMask = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
            saveMask();
            requestAnimationFrame(render);
        }
    };

    if (!imageUrl) return <div className="flex-1 flex items-center justify-center text-[10px] text-gray-500 bg-[#111]">Connect Image Source...</div>;

    return (
        <div className="flex flex-col h-full bg-black rounded overflow-hidden select-none w-full">
            <div className="h-8 bg-[#222] flex items-center justify-center px-2 border-b border-[#333] shrink-0">
                <div className="flex items-center gap-2">
                    <MousePointer2 className="w-3 h-3 text-gray-400" />
                    <input
                        type="range" min="5" max="200"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-16 h-1 accent-red-500 cursor-pointer"
                    />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <button onClick={clearMask} className="p-1 hover:text-white text-gray-400" title="Clear Mask"><RefreshCcw className="w-3 h-3" /></button>
                </div>
            </div>
            <div
                ref={containerRef}
                className={`relative flex-1 overflow-hidden bg-[#0a0a0a] ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
                <canvas ref={canvasRef} className="block w-full h-full" />
            </div>
        </div>
    );
};


export const NodeBlock: React.FC<NodeBlockProps> = ({ node, nodes, edges, selected, zoom, onMouseDown, onPortMouseDown, onPortMouseUp, onLoopback, onResize, onToggleGroup, onSaveGroup, onUpdateNodeParams, onCompare, isComparisonBase }) => {
    const def = NODE_REGISTRY[node.type];
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [role, setRole] = useState<'MAIN' | 'REF'>(node.data.params.role || 'MAIN');
    const [showMaskEditor, setShowMaskEditor] = useState(false);
    const [showLightWidget, setShowLightWidget] = useState(false);

    useEffect(() => {
        if (node.data.params.role) setRole(node.data.params.role);
    }, [node.data.params.role]);

    // Use Dynamic ports if available (for Macros), otherwise use Definition
    const inputs = node.data.dynamicInputs || def?.inputs || [];
    const outputs = node.data.dynamicOutputs || def?.outputs || [];

    if (!def && node.type !== 'macro') return null;

    const isRoleNode = node.type === 'image_source' || node.type === 'output_result';
    const isHistory = node.data.isHistory;

    const getStatusColor = (status: NodeStatus) => {
        if (isHistory) return 'border-gray-700 opacity-60'; // History State Style

        if (isRoleNode) {
            if (role === 'MAIN') return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
            if (role === 'REF') return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
        }
        switch (status) {
            case 'processing': return 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]';
            case 'completed': return 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]';
            case 'error': return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
            default: return selected ? 'border-fashion-accent shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-fashion-gray';
        }
    };

    const getPortColor = (type: string, portId?: string) => {
        if (isRoleNode && portId === 'image') {
            return role === 'MAIN' ? 'bg-red-500 border-red-300' : 'bg-blue-500 border-blue-300';
        }
        if (node.type === 'ai_generator') {
            if (portId === 'main_subject') return 'bg-red-500 border-red-800';
            if (portId === 'ref_style') return 'bg-blue-500 border-blue-800';
        }
        switch (type) {
            case 'image': return 'bg-blue-500';
            case 'text': return 'bg-yellow-500';
            case 'data': return 'bg-purple-500 border-purple-300';
            default: return 'bg-gray-400';
        }
    };

    const toggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsCollapsed(!isCollapsed);
    };

    const getRoleMismatchWarning = (portId: string) => {
        if (node.type !== 'ai_generator') return false;
        const edge = edges.find(e => e.target === node.id && e.targetHandle === portId);
        if (!edge) return false;
        const src = nodes?.find(n => n.id === edge.source);
        if (!src || !['image_source', 'output_result'].includes(src.type)) return false;
        const srcRole = src.data.params.role || 'MAIN';
        if (portId === 'main_subject' && srcRole !== 'MAIN') return true;
        if (portId === 'ref_style' && srcRole !== 'REF') return true;
        return false;
    };

    const getPortStatusClass = (portId: string, isInput: boolean) => {
        if (!isInput) return '';
        if (getRoleMismatchWarning(portId)) return 'animate-pulse bg-yellow-500 ring-2 ring-red-500';
        const required = REQUIRED_PORTS[node.type];
        if (!required || !required.includes(portId)) return '';
        const isConnected = edges.some(e => e.target === node.id && e.targetHandle === portId);
        if (!isConnected) return 'port-missing-required';
        return '';
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const defaultW = node.type === 'mask_editor' || node.type === 'group' ? 400 : 256;
        const defaultH = node.type === 'mask_editor' || node.type === 'group' ? 400 : 300;
        const startWidth = node.data.width || defaultW;
        const startHeight = node.data.height || defaultH;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const dx = (moveEvent.clientX - startX) / zoom;
            const dy = (moveEvent.clientY - startY) / zoom;
            const newWidth = Math.max(256, startWidth + dx);
            const newHeight = Math.max(40, startHeight + dy);
            if (onResize) onResize(node.id, newWidth, newHeight);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleRoleToggle = (newRole: 'MAIN' | 'REF') => {
        if (isHistory) return; // Locked for history
        setRole(newRole);
        node.data.params.role = newRole;
    };

    const maskInputImage = useMemo(() => {
        if (node.type !== 'mask_editor' || !nodes) return null;
        const edge = edges.find(e => e.target === node.id && e.targetHandle === 'image_in');
        if (edge) {
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.data.result || sourceNode?.data.params.image || null;
        }
        return null;
    }, [node.type, node.id, nodes, edges]);

    const handleMaskUpdate = (data: string | null) => {
        // If we have an external updater, use it (preferred for reactivity)
        if (onUpdateNodeParams) {
            onUpdateNodeParams(node.id, { ...node.data.params, maskData: data });
        } else {
            // Fallback mutation (not ideal but keeps local state working)
            node.data.params.maskData = data;
        }
    };

    const handleLightUpdate = (val: any) => {
        if (onUpdateNodeParams) {
            onUpdateNodeParams(node.id, { ...node.data.params, visualLightData: val });
        }
    };

    const defaultW = node.type === 'mask_editor' || node.type === 'group' ? 400 : 256;
    const width = node.data.width || defaultW;
    const heightStyle = node.data.height ? { height: node.data.height } : {};

    if (node.type === 'group') {
        const isGroupCollapsed = node.data.params.isCollapsed;
        return (
            <div
                className={`absolute rounded-lg flex flex-col transition-shadow border-2 group
            ${selected ? 'border-fashion-accent z-10' : 'border-dashed border-gray-600 z-0'}
          `}
                style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: width,
                    ...heightStyle,
                    backgroundColor: node.data.params.color ? `${node.data.params.color}15` : 'rgba(255,255,255,0.05)',
                    cursor: 'grab',
                    overflow: 'hidden'
                }}
                onMouseDown={(e) => onMouseDown(e, node.id)}
            >
                <div className="px-2 py-1 bg-black/40 rounded-t-lg border-b border-white/10 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest truncate">{node.data.label}</span>
                    <div className="flex items-center gap-1">
                        {onSaveGroup && (
                            <button onClick={(e) => { e.stopPropagation(); onSaveGroup(node.id); }} className="text-gray-500 hover:text-white p-1 hover:bg-white/10 rounded">
                                <Save className="w-3 h-3" />
                            </button>
                        )}
                        {onToggleGroup && (
                            <button onClick={(e) => { e.stopPropagation(); onToggleGroup(node.id); }} className="text-gray-500 hover:text-white p-1 hover:bg-white/10 rounded">
                                {isGroupCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                            </button>
                        )}
                    </div>
                </div>

                {!isGroupCollapsed && (
                    <div className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={handleResizeStart}>
                        <div className="w-2 h-2 border-b-2 border-r-2 border-gray-400" />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className={`absolute bg-[#1e1e1e] rounded-lg border flex flex-col overflow-hidden transition-shadow ${getStatusColor(node.data.status)} ${isHistory ? 'grayscale-[0.5]' : ''}`}
            style={{
                left: node.position.x,
                top: node.position.y,
                width: width,
                ...heightStyle,
                cursor: isResizing ? 'nwse-resize' : 'grab'
            }}
            onMouseDown={(e) => onMouseDown(e, node.id)}
        >
            <div className={`h-8 border-b flex items-center justify-between px-2 select-none shrink-0 ${isHistory ? 'bg-gray-800 border-gray-700' : 'bg-[#252525] border-[#333]'}`}>
                <div className="flex items-center gap-2">
                    <button onClick={toggleCollapse} className="text-gray-400 hover:text-white transition-colors p-0.5 rounded hover:bg-gray-700">
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                    <span className={`text-xs font-bold uppercase tracking-wider truncate max-w-[120px] ${isHistory ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{node.data.label}</span>
                </div>
                <div className="flex items-center space-x-2">
                    {isHistory && <History className="w-3 h-3 text-gray-500" />}
                    {node.type === 'macro' && <Cpu className="w-3 h-3 text-fashion-accent" />}
                    {isRoleNode && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${role === 'MAIN' ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'}`}>
                            {role}
                        </span>
                    )}
                    {!isHistory && node.data.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />}
                    {node.data.status === 'completed' && <CheckCircle2 className={`w-3 h-3 ${isHistory ? 'text-gray-500' : 'text-green-500'}`} />}
                    {node.data.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                </div>
            </div>

            {isRoleNode && !isCollapsed && !isHistory && (
                <div className="px-2 py-2 bg-[#151515] border-b border-[#222] flex items-center justify-center">
                    <div className="flex bg-[#0a0a0a] p-0.5 rounded-md border border-[#333]">
                        <button onClick={() => handleRoleToggle('MAIN')} className={`px-4 py-1 text-[9px] font-bold rounded-sm transition-colors ${role === 'MAIN' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>MAIN</button>
                        <button onClick={() => handleRoleToggle('REF')} className={`px-4 py-1 text-[9px] font-bold rounded-sm transition-colors ${role === 'REF' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>REF</button>
                    </div>
                </div>
            )}

            <div className="flex flex-row relative flex-1 min-h-[40px]">
                <div className="flex flex-col space-y-4 py-3 px-0 z-20 w-4 shrink-0">
                    {inputs.map((port) => (
                        <div
                            key={port.id}
                            className="group relative flex items-center"
                            onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node.id, port.id, true); }}
                            onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node.id, port.id, true); }}
                        >
                            <div className="absolute -inset-2 z-0 cursor-crosshair" />
                            <div className={`relative z-10 w-3 h-3 -ml-1.5 rounded-full border border-[#1e1e1e] ${getPortColor(port.type, port.id)} ${getPortStatusClass(port.id, true)} hover:scale-150 transition-transform cursor-crosshair`} />
                            <div className="absolute left-3 top-0 flex items-center">
                                <span className="text-[9px] text-gray-500 uppercase opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none bg-black px-1 rounded border border-gray-800 z-50 shadow-lg">{port.label}</span>
                                {getRoleMismatchWarning(port.id) && <AlertTriangle className="w-4 h-4 text-yellow-500 ml-1 animate-bounce" />}
                            </div>
                        </div>
                    ))}
                </div>

                <div className={`flex-1 transition-all duration-300 flex flex-col ${isCollapsed ? 'h-0 opacity-0 overflow-hidden py-0' : 'py-3 px-1 opacity-100'}`}>
                    {node.data.status === 'error' && node.data.error ? (
                        <div className="w-full p-2 bg-red-900/20 border border-red-800 rounded text-[9px] text-red-200 font-mono break-words overflow-y-auto max-h-[150px]">
                            <strong className="block mb-1 text-red-500">Error:</strong>
                            {node.data.error}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {(isRoleNode || node.type === 'coherence_lock' || node.data.result) && (
                                <div className="w-full h-32 bg-black/50 rounded border border-[#333] flex items-center justify-center overflow-hidden relative group">
                                    {node.type === 'coherence_lock' && node.data.result ? (
                                        <div className="flex flex-col items-center justify-center w-full h-full bg-purple-900/10 text-purple-300">
                                            <Lock className="w-6 h-6 mb-2 text-purple-400" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Lock Active</span>
                                        </div>
                                    ) : (node.data.result || node.data.params.image) ? (
                                        <>
                                            <img src={node.data.result || node.data.params.image} className="w-full h-full object-contain" />
                                            {node.type === 'output_result' && node.data.result && !isHistory && (
                                                <div className="absolute bottom-2 right-2 flex gap-1">
                                                    <div className="bg-black/80 text-white text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                                        Connect "Result" to next Step
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-600 select-none">
                                            {node.type === 'coherence_lock' ? <Lock className="w-8 h-8 mb-1 opacity-50 text-purple-500" /> : <ImageIcon className="w-8 h-8 mb-1 opacity-50" />}
                                            {node.type === 'output_result' && <span className="text-[9px] text-gray-500">Waiting...</span>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- EMBEDDED MASK EDITOR OVERLAY --- */}
                            {showMaskEditor && (node.data.result || node.data.params.image) && (
                                <EmbeddedMaskEditor
                                    imageUrl={node.data.result || node.data.params.image}
                                    initialMaskData={node.data.params.maskData}
                                    onSave={(data) => { handleMaskUpdate(data); setShowMaskEditor(false); }}
                                    onClose={() => setShowMaskEditor(false)}
                                />
                            )}

                            {/* --- LIGHT WIDGET OVERLAY --- */}
                            {showLightWidget && (
                                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center animate-in fade-in">
                                    <div className="mb-4 text-xs font-bold text-gray-400 uppercase">Adjust Lighting</div>
                                    <LightAngleWidget
                                        value={node.data.params.visualLightData || { azimuth: 45, elevation: 45 }}
                                        onChange={handleLightUpdate}
                                        size={180}
                                    />
                                    <button onClick={() => setShowLightWidget(false)} className="mt-6 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-xs">Done</button>
                                </div>
                            )}

                            {/* --- ACTION BUTTONS FOR IMAGE NODES --- */}
                            {(node.type === 'image_source' || node.type === 'output_result') && !isHistory && (node.data.result || node.data.params.image) && (
                                <div className="flex gap-1 mt-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowMaskEditor(true); }}
                                        className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-colors flex items-center justify-center gap-1
                                  ${node.data.params.maskData ? 'bg-red-900/30 border-red-800 text-red-400' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:text-gray-300'}
                              `}
                                    >
                                        <Brush className="w-3 h-3" />
                                        {node.data.params.maskData ? 'Masked' : 'Mask'}
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowLightWidget(true); }}
                                        className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-colors flex items-center justify-center gap-1
                                    ${node.data.params.visualLightData ? 'bg-yellow-900/30 border-yellow-800 text-yellow-400' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:text-gray-300'}
                                `}
                                    >
                                        <Sun className="w-3 h-3" />
                                        Light
                                    </button>

                                    {onCompare && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCompare(node.id); }}
                                            className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-colors flex items-center justify-center gap-1
                                        ${isComparisonBase ? 'bg-blue-600 text-white border-blue-400 animate-pulse' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:text-gray-300'}
                                    `}
                                            title={isComparisonBase ? "Select another node to compare" : "Compare with..."}
                                        >
                                            <SplitSquareHorizontal className="w-3 h-3" />
                                            {isComparisonBase ? 'Base' : 'Comp'}
                                        </button>
                                    )}
                                </div>
                            )}
                            {node.type === 'input_prompt' && (
                                <div className="w-full h-20 bg-black/50 rounded border border-[#333] p-2 text-[10px] text-gray-400 overflow-y-auto italic">
                                    {node.data.params.text || "No prompt..."}
                                </div>
                            )}
                            {node.type === 'ai_generator' && !node.data.result && (
                                <div className="w-full h-24 flex items-center justify-center text-[10px] text-gray-500 text-center px-4 border border-dashed border-[#333] rounded">
                                    Waiting for Inputs...
                                </div>
                            )}
                            {node.type === 'macro' && (
                                <div className="w-full h-24 flex flex-col items-center justify-center text-center px-4 border border-dashed border-[#333] rounded bg-black/20">
                                    <Cpu className="w-6 h-6 text-fashion-accent opacity-50 mb-2" />
                                    <span className="text-[10px] text-gray-400">Logic Synthesized</span>
                                    <span className="text-[9px] text-gray-600 mt-1">{node.data.params.internalNodes?.length} nodes hidden</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col space-y-4 py-3 px-0 z-20 w-4 ml-auto items-end shrink-0">
                    {outputs.map((port) => (
                        <div
                            key={port.id}
                            className="group relative flex items-center justify-end"
                            onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node.id, port.id, false); }}
                            onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node.id, port.id, false); }}
                        >
                            <div className="absolute -inset-2 z-0 cursor-crosshair" />
                            <span className="absolute right-3 text-[9px] text-gray-500 uppercase opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none bg-black px-1 rounded border border-gray-800 z-50 shadow-lg">{port.label}</span>
                            <div className={`relative z-10 w-3 h-3 -mr-1.5 rounded-full border border-[#1e1e1e] ${getPortColor(port.type, port.id)} hover:scale-150 transition-transform cursor-crosshair`} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
