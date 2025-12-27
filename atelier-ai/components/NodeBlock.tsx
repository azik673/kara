
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Node, Port, NodeStatus, Edge } from '../types';
import { NODE_REGISTRY } from '../services/nodeEngine';
import { Settings2, AlertCircle, CheckCircle2, Image as ImageIcon, ChevronDown, ChevronUp, Repeat, MousePointer2, ZoomIn, ZoomOut, RefreshCcw, Move, Maximize2, Minimize2, Save, Lock, AlertTriangle, ArrowRightCircle, History, Brush, Sun, SplitSquareHorizontal, Camera, Download, Shirt, Upload, X, Layers, Loader2, Sparkles, Plus, Trash2, Edit2 } from 'lucide-react';
import { EmbeddedMaskEditor } from './EmbeddedMaskEditor';
import { LightAngleWidget } from './LightAngleWidget';
import { extractPoseSkeleton } from '../services/pose';
import { CAMERA_PRESETS, LIGHT_PRESETS } from '../presets';
import { LayerEditorModal } from './LayerEditorModal';
import { Layer } from '../types';

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
    onResizeStart?: () => void;
    onToggleGroup?: (groupId: string) => void;
    onSaveGroup?: (groupId: string) => void;
    onUpdateNodeParams?: (id: string, params: any) => void; // Added for internal updates
    onCompare?: (nodeId: string) => void;
    isComparisonBase?: boolean;
    onRegenerateNode?: (nodeId: string) => void;
    onExportImage?: (imageUrl: string) => void;
    onEditorToggle?: (isOpen: boolean) => void;
    onUpdateNodeData?: (id: string, data: any) => void;
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
        let scale = Math.min(cvs.width / img.width, cvs.height / img.height) * 0.6; // Changed from 0.9 to 0.6 for better zoom out
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

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoom(prev => Math.min(prev * 1.2, 20));
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoom(prev => Math.max(prev / 1.2, 0.1));
    };

    const handleFitToView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imageRef.current && canvasRef.current) {
            fitImageToCanvas(imageRef.current, canvasRef.current);
        }
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
            <div className="h-8 bg-[#222] flex items-center justify-between px-2 border-b border-[#333] shrink-0">
                <div className="flex items-center gap-2">
                    <Brush className="w-3 h-3 text-red-400" />
                    <input
                        type="range" min="5" max="200"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-16 h-1 accent-red-500 cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-500">{brushSize}px</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={handleZoomOut} className="p-1 hover:text-white text-gray-400" title="Zoom Out"><ZoomOut className="w-3 h-3" /></button>
                    <span className="text-[9px] text-gray-500 min-w-[35px] text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1 hover:text-white text-gray-400" title="Zoom In"><ZoomIn className="w-3 h-3" /></button>
                    <button onClick={handleFitToView} className="p-1 hover:text-white text-gray-400" title="Fit to View"><Maximize2 className="w-3 h-3" /></button>
                    <div className="w-px h-4 bg-gray-700 mx-1" />
                    <button onClick={clearMask} className="p-1 hover:text-white text-gray-400" title="Clear Mask"><RefreshCcw className="w-3 h-3" /></button>
                </div>
            </div>
            <div className="px-2 py-1 bg-[#1a1a1a] border-b border-[#333] flex items-center justify-center gap-3">
                <span className="text-[8px] text-gray-600"><Move className="w-2.5 h-2.5 inline mr-1" />Left-click: Pan</span>
                <span className="text-[8px] text-gray-600"><Brush className="w-2.5 h-2.5 inline mr-1" />Right-click: Draw</span>
                <span className="text-[8px] text-gray-600"><MousePointer2 className="w-2.5 h-2.5 inline mr-1" />Scroll: Zoom</span>
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


interface QuickPrompt {
    id: string;
    label: string;
    text: string;
}

const DEFAULT_QUICK_PROMPTS: QuickPrompt[] = [
    { id: 'clothing_replacement', label: 'Clothing Replacement', text: 'Change the clothes of the model to match the reference image.' }
];

export const NodeBlock = React.memo<NodeBlockProps>(({ node, nodes, edges, selected, zoom, onMouseDown, onPortMouseDown, onPortMouseUp, onLoopback, onResize, onResizeStart, onToggleGroup, onSaveGroup, onUpdateNodeParams, onCompare, isComparisonBase, onRegenerateNode, onExportImage, onEditorToggle, onUpdateNodeData }) => {
    const def = NODE_REGISTRY[node.type];
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [role, setRole] = useState<'MAIN' | 'REF'>(node.data.params.role || 'MAIN');
    const [showMaskEditor, setShowMaskEditor] = useState(false);
    const [showLightWidget, setShowLightWidget] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showPoseOptions, setShowPoseOptions] = useState(false);
    const [showClothingOptions, setShowClothingOptions] = useState(false);
    const [showLayerEditor, setShowLayerEditor] = useState(false);
    const [showCameraPresets, setShowCameraPresets] = useState(false);
    const [showAspectRatioOptions, setShowAspectRatioOptions] = useState(false);
    
    // --- Quick Prompts Logic ---
    const [showQuickPrompts, setShowQuickPrompts] = useState(false);
    const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>([]);
    const [isAddingPrompt, setIsAddingPrompt] = useState(false);
    const [newPromptLabel, setNewPromptLabel] = useState('');
    const [newPromptText, setNewPromptText] = useState('');
    const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editText, setEditText] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('atelier_quick_prompts');
        if (saved) {
            try {
                setQuickPrompts(JSON.parse(saved));
            } catch (e) {
                setQuickPrompts(DEFAULT_QUICK_PROMPTS);
            }
        } else {
            setQuickPrompts(DEFAULT_QUICK_PROMPTS);
        }
    }, []);

    const saveQuickPrompts = (prompts: QuickPrompt[]) => {
        setQuickPrompts(prompts);
        localStorage.setItem('atelier_quick_prompts', JSON.stringify(prompts));
    };

    const handleAddPrompt = () => {
        if (!newPromptLabel.trim() || !newPromptText.trim()) return;
        const newPrompt: QuickPrompt = {
            id: Date.now().toString(),
            label: newPromptLabel,
            text: newPromptText
        };
        saveQuickPrompts([...quickPrompts, newPrompt]);
        setIsAddingPrompt(false);
        setNewPromptLabel('');
        setNewPromptText('');
    };

    const handleDeletePrompt = (id: string) => {
        saveQuickPrompts(quickPrompts.filter(p => p.id !== id));
    };

    const handleSaveEditedPrompt = (id: string) => {
        if (!editLabel.trim() || !editText.trim()) return;
        saveQuickPrompts(quickPrompts.map(p => p.id === id ? { ...p, label: editLabel, text: editText } : p));
        setEditingPromptId(null);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Track actual rendered height
    useEffect(() => {
        if (!nodeRef.current || !onUpdateNodeData) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newHeight = entry.contentRect.height;
                // Only update if height actually changed significantly to avoid loops
                if (Math.abs((node.data.height || 0) - newHeight) > 1) {
                    onUpdateNodeData(node.id, { data: { height: newHeight } });
                }
            }
        });

        observer.observe(nodeRef.current);
        return () => observer.disconnect();
    }, [node.id, onUpdateNodeData, node.data.height]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            if (onUpdateNodeParams) {
                // Reset layers when a new image is uploaded to prevent old edits (eraser marks) from persisting
                onUpdateNodeParams(node.id, { ...node.data.params, image: result, layers: undefined });
            } else if (onUpdateNodeData) {
                onUpdateNodeData(node.id, { 
                    ...node.data, 
                    params: { ...node.data.params, image: result, layers: undefined },
                    status: 'idle'
                });
            } else {
                node.data.params.image = result;
                node.data.params.layers = undefined;
            }
            // Auto-export uploaded image to library
            if (onExportImage) {
                onExportImage(result);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleUploadClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    useEffect(() => {
        if (node.data.params.role) setRole(node.data.params.role);
    }, [node.data.params.role]);

    useEffect(() => {
        if (onEditorToggle) {
            onEditorToggle(showLayerEditor);
        }
    }, [showLayerEditor, onEditorToggle]);

    // Use Dynamic ports if available (for Macros), otherwise use Definition
    const inputs = node.data.dynamicInputs || def?.inputs || [];
    const outputs = node.data.dynamicOutputs || def?.outputs || [];

    if (!def) return null;

    const isRoleNode = node.type === 'image_source' || node.type === 'output_result';
    const isHistory = node.data.isHistory;

    const getStatusColor = (status: NodeStatus) => {
        if (isHistory) return 'border-gray-700 opacity-60'; // History State Style

        if (isRoleNode) {
            if (role === 'MAIN') return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
            if (role === 'REF') return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
        }
        switch (status) {
            case 'processing': return 'shadow-[0_0_15px_rgba(234,179,8,0.3)]';
            case 'completed': return 'shadow-[0_0_15px_rgba(34,197,94,0.3)]';
            case 'error': return 'shadow-[0_0_15px_rgba(239,68,68,0.3)]';
            case 'pending_changes': return 'shadow-[0_0_15px_rgba(249,115,22,0.3)] animate-pulse';
            default: return selected ? 'shadow-[0_0_15px_rgba(255,255,255,0.3)]' : '';
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
        if (onResizeStart) onResizeStart();
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
        if (onUpdateNodeParams) {
            onUpdateNodeParams(node.id, { ...node.data.params, role: newRole });
        } else {
            node.data.params.role = newRole;
        }
    };

    const handleCameraPresetSelect = (presetId: string) => {
        const preset = CAMERA_PRESETS.find(p => p.id === presetId);
        if (preset && onUpdateNodeParams) {
            onUpdateNodeParams(node.id, {
                ...node.data.params,
                visualCameraData: {
                    distance: preset.distance,
                    heightRatio: preset.heightRatio,
                    framing: node.data.params.visualCameraData?.framing || 'portrait'
                }
            });
        }
        setShowCameraPresets(false);
    };

    const handlePoseLockToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isHistory) return;
        const current = node.data.params.isPoseLocked ?? true;
        if (onUpdateNodeParams) {
            onUpdateNodeParams(node.id, { ...node.data.params, isPoseLocked: !current });
        }
    };

    const handleClothingReplacementToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isHistory) return;
        const current = node.data.params.isClothingReplacement ?? false;
        if (onUpdateNodeParams) {
            onUpdateNodeParams(node.id, { ...node.data.params, isClothingReplacement: !current });
        }
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
        const memberIds = node.data.params.members || [];
        const memberNodes = nodes?.filter(n => memberIds.includes(n.id)) || [];

        if (isGroupCollapsed) {
            return (
                <div
                    className="absolute flex flex-col"
                    style={{
                        left: node.position.x,
                        top: node.position.y,
                        width: width,
                        zIndex: selected ? 5 : -1
                    }}
                >
                    {/* Title above the box */}
                    <div className="absolute -top-8 left-0 px-1">
                        <span className="text-[11px] font-medium text-white/40 tracking-wide">{node.data.label}</span>
                    </div>

                    {/* Main Group Box (Closed) */}
                    <div
                        className={`relative w-full h-full bg-black/60 backdrop-blur-md border border-white/10 rounded-[24px] transition-all group
                            ${selected ? 'shadow-[0_0_20px_rgba(255,255,255,0.1)] border-white/20' : ''}
                        `}
                        style={{
                            ...heightStyle,
                            cursor: 'grab',
                            overflow: 'hidden'
                        }}
                        onMouseDown={(e) => onMouseDown(e, node.id)}
                    >
                        {/* Top Right Buttons */}
                        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                            {onToggleGroup && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onToggleGroup(node.id); }} 
                                    className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/40 hover:text-white transition-all"
                                    title="Expand Group"
                                >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {onSaveGroup && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onSaveGroup(node.id); }}
                                    className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/40 hover:text-white transition-all"
                                    title="Save to Library"
                                >
                                    <div className="w-1.5 h-1.5 bg-current rounded-full" />
                                </button>
                            )}
                        </div>

                        {/* Member List */}
                        <div className="px-6 py-4 flex flex-col gap-2 mt-8">
                            {memberNodes.map(m => (
                                <div key={m.id} className="text-[11px] font-semibold text-white/50 truncate">
                                    {m.data.label || m.type}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        // Open State (As Usual)
        return (
            <div
                className={`absolute rounded-lg flex flex-col transition-shadow border-2 group
                    ${selected ? 'border-white z-10' : 'border-dashed border-gray-600 z-0'}
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
                <div className="px-4 py-2 bg-black/40 rounded-t-lg border-b border-white/10 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{node.data.label}</span>
                    <div className="flex items-center gap-2">
                        {onToggleGroup && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onToggleGroup(node.id); }} 
                                className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/40 hover:text-white transition-all"
                                title="Collapse Group"
                            >
                                <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {onSaveGroup && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onSaveGroup(node.id); }}
                                className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/40 hover:text-white transition-all"
                                title="Save to Library"
                            >
                                <div className="w-1.5 h-1.5 bg-current rounded-full" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={handleResizeStart}>
                    <div className="w-2 h-2 border-b-2 border-r-2 border-gray-400" />
                </div>
            </div>
        );
    }



    return (
        <div
            className="absolute flex flex-col items-center"
            style={{
                left: node.position.x,
                top: node.position.y,
                width: width,
                zIndex: selected ? 100 : 1
            }}
            ref={nodeRef}
            onMouseDown={(e) => {
                // Prevent dragging if Layer Editor is open
                if (showLayerEditor) return;
                onMouseDown(e, node.id);
            }}
        >
            {/* Hidden File Input for Upload */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
            />
            {/* External Label (Absolute positioned above the node) */}
            <div className="node-label px-1 absolute -top-5 left-0 whitespace-nowrap">{node.data.label}</div>

            {/* Floating Toolbar (Only for Image source nodes when selected) */}
            {selected && (node.type === 'image_source' || node.type === 'output_result' || node.type === 'input_prompt') && (
                <div
                    className="absolute -top-12 left-1/2 -translate-x-1/2 z-[1000]"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="node-toolbar">
                        {/* Quick Prompt Toolbar for Text Nodes */}
                        {/* Quick Prompt Toolbar for Text Nodes */}
                        {node.type === 'input_prompt' && (
                            <>
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowQuickPrompts(!showQuickPrompts);
                                        }}
                                        className={`toolbar-btn ${showQuickPrompts ? 'text-white bg-white/20' : 'text-gray-400 hover:text-white'} group/tooltip relative`}
                                        title="Quick Prompts"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                    </button>

                                    {showQuickPrompts && (
                                        <div className="absolute top-full mt-2 left-0 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl p-2 z-[1010] min-w-[240px] flex flex-col gap-2">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase px-1">Quick Prompts</div>
                                            
                                            <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                                                {quickPrompts.map(prompt => (
                                                    <div key={prompt.id} className="group/item flex items-center gap-1 p-1 rounded hover:bg-white/5">
                                                        {editingPromptId === prompt.id ? (
                                                            <div className="flex flex-col gap-1 w-full">
                                                                <input
                                                                    className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white w-full"
                                                                    value={editLabel}
                                                                    onChange={(e) => setEditLabel(e.target.value)}
                                                                    placeholder="Label"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                                <textarea
                                                                    className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white w-full resize-none h-12"
                                                                    value={editText}
                                                                    onChange={(e) => setEditText(e.target.value)}
                                                                    placeholder="Prompt Text"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                                <div className="flex justify-end gap-1">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleSaveEditedPrompt(prompt.id);
                                                                        }}
                                                                        className="p-1 hover:bg-green-500/20 text-green-500 rounded"
                                                                    >
                                                                        <CheckCircle2 className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingPromptId(null);
                                                                        }}
                                                                        className="p-1 hover:bg-red-500/20 text-red-500 rounded"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onUpdateNodeParams?.(node.id, { ...node.data.params, text: prompt.text });
                                                                        setShowQuickPrompts(false);
                                                                    }}
                                                                    className="flex-1 text-left text-[10px] text-gray-300 hover:text-white truncate px-1"
                                                                    title={prompt.text}
                                                                >
                                                                    {prompt.label}
                                                                </button>
                                                                <div className="flex opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingPromptId(prompt.id);
                                                                            setEditLabel(prompt.label);
                                                                            setEditText(prompt.text);
                                                                        }}
                                                                        className="p-1 hover:bg-white/10 text-gray-500 hover:text-white rounded"
                                                                    >
                                                                        <Edit2 className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDeletePrompt(prompt.id);
                                                                        }}
                                                                        className="p-1 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="border-t border-white/10 pt-2 mt-1">
                                                {isAddingPrompt ? (
                                                    <div className="flex flex-col gap-1">
                                                        <input
                                                            className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white w-full"
                                                            value={newPromptLabel}
                                                            onChange={(e) => setNewPromptLabel(e.target.value)}
                                                            placeholder="Label (e.g. Cyberpunk)"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <textarea
                                                            className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white w-full resize-none h-12"
                                                            value={newPromptText}
                                                            onChange={(e) => setNewPromptText(e.target.value)}
                                                            placeholder="Prompt Text"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <div className="flex justify-end gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddPrompt();
                                                                }}
                                                                className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[9px] text-white"
                                                            >
                                                                <Save className="w-3 h-3" />
                                                                Save
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setIsAddingPrompt(false);
                                                                }}
                                                                className="px-2 py-1 hover:bg-white/10 rounded text-[9px] text-gray-400"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsAddingPrompt(true);
                                                            setNewPromptLabel('');
                                                            setNewPromptText('');
                                                        }}
                                                        className="flex items-center gap-1 w-full px-2 py-1.5 hover:bg-white/5 rounded text-[10px] text-gray-400 hover:text-white transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        Add New Prompt
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </>
                        )}

                        {(node.type === 'image_source' || node.type === 'output_result' || node.type === 'ai_generator') && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Initialize with current image if available
                                        const currentImage = node.data.result || node.data.params.image;
                                        if (currentImage && node.type !== 'layer_editor') {
                                            const initialLayer: Layer = {
                                                id: 'background',
                                                sourceId: 'Base Image',
                                                image: currentImage,
                                                x: 0,
                                                y: 0,
                                                scale: 1, // Fit to canvas?
                                                rotation: 0,
                                                opacity: 1,
                                                blendMode: 'normal',
                                                visible: true,
                                                zIndex: 0
                                            };
                                            if (!node.data.params.layers || node.data.params.layers.length === 0) {
                                                if (onUpdateNodeParams) {
                                                    onUpdateNodeParams(node.id, { ...node.data.params, layers: [initialLayer] });
                                                }
                                            }
                                        }
                                        setShowLayerEditor(true);
                                    }}
                                    className="toolbar-btn text-white bg-white/20 mr-1"
                                    title="Open Layer Editor"
                                >
                                    <Layers className="w-4 h-4" />
                                </button>
                                <div className="toolbar-divider" />
                            </>
                        )}
                        {node.type !== 'input_prompt' && (
                            <>
                                <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 mr-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRoleToggle('MAIN'); }}
                                        className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${role === 'MAIN' ? 'bg-red-600/80 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        MAIN
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRoleToggle('REF'); }}
                                        className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${role === 'REF' ? 'bg-blue-600/80 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        REF
                                    </button>
                                </div>
                                <div className="toolbar-divider" />
                                <div className="toolbar-divider" />

                                {/* Pose Dropdown */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowPoseOptions(!showPoseOptions); }}
                                    className={`toolbar-btn ${showPoseOptions ? 'text-white bg-white/20' : (node.data.params.isPoseLocked ?? true ? 'text-white' : 'text-gray-500')}`}
                                    title="Pose Options"
                                >
                                    <Lock className="w-4 h-4" />
                                    <ChevronDown className="w-3 h-3 ml-0.5" />
                                </button>

                                {showPoseOptions && (
                                    <div className="absolute top-full mt-2 left-0 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl p-1 z-[1010] min-w-[140px]">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePoseLockToggle(e);
                                                // Don't close immediately to allow toggling
                                            }}
                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors flex items-center justify-between"
                                        >
                                            <span>Lock Pose</span>
                                            {(node.data.params.isPoseLocked ?? true) && <CheckCircle2 className="w-3 h-3 text-white" />}
                                        </button>
                                    </div>
                                )}

                                {/* Clothing Dropdown */}
                                <div className="toolbar-divider" />
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    setShowLightWidget(!showLightWidget);
                                }} className={`toolbar-btn ${showLightWidget ? 'text-white bg-white/20' : ''}`} title="Lighting">
                                    <Sun className="w-4 h-4" />
                                    <ChevronDown className="w-3 h-3 ml-0.5" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCameraPresets(!showCameraPresets);
                                    }}
                                    className={`toolbar-btn ${showCameraPresets ? 'text-white bg-white/20' : (node.data.params.visualCameraData ? 'text-blue-500' : 'text-gray-500')}`}
                                    title="Camera Angle"
                                >
                                    <Camera className="w-4 h-4" />
                                    <ChevronDown className="w-3 h-3 ml-0.5" />
                                </button>
                            </>
                        )}

                        {showCameraPresets && (
                            <div className="absolute top-full mt-2 left-0 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl p-1 z-[1010] min-w-[120px]">
                                {CAMERA_PRESETS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={(e) => { e.stopPropagation(); handleCameraPresetSelect(p.id); }}
                                        className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors flex items-center justify-between"
                                    >
                                        {p.label}
                                        {node.data.params.visualCameraData?.heightRatio === p.heightRatio && <CheckCircle2 className="w-3 h-3 text-white" />}
                                    </button>
                                ))}
                            </div>
                        )}

                        {node.type !== 'input_prompt' && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setShowMaskEditor(true); }} className="toolbar-btn" title="Mask Editor">
                                    <Brush className="w-4 h-4" />
                                </button>

                                <div className="toolbar-divider" />

                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                                    className="toolbar-btn"
                                    title="AI Settings"
                                >
                                    <Settings2 className="w-4 h-4" />
                                </button>

                                {showSettings && (
                                    <div className="absolute top-full mt-2 right-0 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-4 z-[1010] min-w-[200px] space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-[9px] uppercase text-gray-500 flex justify-between font-bold">
                                                <span>Object Adherence</span>
                                                <span className="text-white">{node.data.params.objectAdherence ?? 0.9}</span>
                                            </label>
                                            <input
                                                type="range" min="0" max="1" step="0.1"
                                                value={node.data.params.objectAdherence ?? 0.9}
                                                onChange={(e) => { e.stopPropagation(); onUpdateNodeParams?.(node.id, { ...node.data.params, objectAdherence: parseFloat(e.target.value) }); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="w-full accent-white h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] uppercase text-gray-500 flex justify-between font-bold">
                                                <span>Realism Weight</span>
                                                <span className="text-white">{node.data.params.realismWeight ?? 1.0}</span>
                                            </label>
                                            <input
                                                type="range" min="0" max="1" step="0.1"
                                                value={node.data.params.realismWeight ?? 1.0}
                                                onChange={(e) => { e.stopPropagation(); onUpdateNodeParams?.(node.id, { ...node.data.params, realismWeight: parseFloat(e.target.value) }); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="w-full accent-white h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] uppercase text-gray-500 font-bold">Target Placement</label>
                                            <input
                                                type="text"
                                                value={node.data.params.targetPlacement || ''}
                                                onChange={(e) => { e.stopPropagation(); onUpdateNodeParams?.(node.id, { ...node.data.params, targetPlacement: e.target.value }); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                placeholder="e.g. head, background"
                                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-[10px] text-gray-300 focus:border-white/50 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="toolbar-divider" />

                                {onCompare && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onCompare(node.id); }}
                                        className={`toolbar-btn ${isComparisonBase ? 'text-blue-500 animate-pulse' : 'text-gray-500'}`}
                                        title={isComparisonBase ? "Select another node to compare" : "Compare"}
                                    >
                                        <SplitSquareHorizontal className="w-4 h-4" />
                                    </button>
                                )}
                                <div className="toolbar-divider" />
                                <button
                                    className="toolbar-btn"
                                    title="Download"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const img = node.data.result || node.data.params.image;
                                        if (img) {
                                            const link = document.createElement('a');
                                            link.href = img;
                                            link.download = `atelier-${node.id}-${Date.now()}.png`;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                        }
                                    }}
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <div className="toolbar-divider" />
                                <button
                                    className="toolbar-btn w-auto px-2 gap-1"
                                    title="Aspect Ratio"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Cycle aspect ratios
                                        const ratios = ['1:1', '4:3', '16:9', '9:16'];
                                        const current = node.data.params.aspectRatio || '1:1';
                                        const next = ratios[(ratios.indexOf(current) + 1) % ratios.length];
                                        onUpdateNodeParams?.(node.id, { ...node.data.params, aspectRatio: next });
                                    }}
                                >
                                    <span className="text-[9px] font-bold">{node.data.params.aspectRatio || '1:1'}</span>
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                            </>
                        )}


                        {showLightWidget && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-4 z-[1010] min-w-[200px]">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-[10px] font-bold text-gray-400">LIGHTING PRESETS</span>
                                    <button onClick={(e) => { e.stopPropagation(); setShowLightWidget(false); }} className="text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
                                </div>

                                <div className="space-y-1 mb-4">
                                    {LIGHT_PRESETS.map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLightUpdate({ azimuth: preset.azimuth, elevation: preset.elevation });
                                            }}
                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors flex items-center justify-between"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span>{preset.icon}</span>
                                                <span>{preset.label}</span>
                                            </span>
                                            {node.data.params.visualLightData?.azimuth === preset.azimuth &&
                                                node.data.params.visualLightData?.elevation === preset.elevation &&
                                                <CheckCircle2 className="w-3 h-3 text-white" />}
                                        </button>
                                    ))}
                                </div>


                            </div>
                        )}
                    </div>
                </div>
            )}

            {showMaskEditor && (
                <EmbeddedMaskEditor
                    imageUrl={maskInputImage || node.data.params.image}
                    initialMaskData={node.data.params.maskData}
                    onSave={handleMaskUpdate}
                    onClose={() => setShowMaskEditor(false)}
                />
            )}

            <div className="relative w-full">
                <div
                    className={`glass-node rounded-3xl flex flex-col overflow-hidden transition-all duration-300 ${selected ? 'glass-node-selected' : ''} ${isHistory ? 'grayscale-[0.5]' : ''}`}
                    style={{
                        width: width,
                        ...heightStyle,
                        cursor: isResizing ? 'nwse-resize' : 'grab',
                        minHeight: (node.type === 'image_source' || node.type === 'output_result') && !(node.data.result || node.data.params.image) ? 160 : undefined
                    }}
                    onMouseDown={(e) => onMouseDown(e, node.id)}
                >
                    {/* Header (Only for non-source/prompt nodes or if collapsed) */}
                    {(!isRoleNode && node.type !== 'input_prompt' || isCollapsed) && (
                        <div className={`h-8 border-b flex items-center justify-between px-2 select-none shrink-0 ${isHistory ? 'bg-gray-800/50 border-gray-700/50' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex items-center gap-2">
                                <button onClick={toggleCollapse} className="text-gray-400 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10">
                                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </button>
                                <span className={`text-[10px] font-bold uppercase tracking-wider truncate max-w-[120px] ${isHistory ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{node.data.label}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                {isHistory && <History className="w-3 h-3 text-gray-500" />}
                                {node.data.status === 'pending_changes' && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400 animate-pulse">
                                        PENDING
                                    </span>
                                )}
                                {!isHistory && node.data.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />}
                                {node.data.status === 'completed' && <CheckCircle2 className={`w-3 h-3 ${isHistory ? 'text-gray-500' : 'text-green-500'}`} />}
                                {node.data.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-row relative flex-1 min-h-[40px]">
                        <div className={`flex-1 transition-all duration-300 flex flex-col ${isCollapsed ? 'h-0 opacity-0 overflow-hidden py-0' : 'py-3 px-3 opacity-100'}`}>
                            {node.data.status === 'error' && node.data.error ? (
                                <div className="w-full p-2 bg-red-900/20 border border-red-800 rounded text-[9px] text-red-200 font-mono break-words overflow-y-auto max-h-[150px]">
                                    {node.data.error.startsWith("FAL_BILLING_ERROR:") ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 text-red-400 font-bold">
                                                <AlertTriangle className="w-4 h-4" />
                                                <span>INSUFFICIENT FUNDS</span>
                                            </div>
                                            <p className="text-gray-300 font-sans leading-relaxed">
                                                Your Fal.ai account has run out of credits. Please top up your balance to continue using high-speed generation.
                                            </p>
                                            <a
                                                href="https://fal.ai/dashboard/billing"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-center transition-colors no-underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Go to Fal.ai Dashboard
                                            </a>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const TEST_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAQAAAABkCAYAAABw4pVUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuMTZEaa/1AAAAUElEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/Bhu0AAB48Dt1AAAAABJRU5ErkJggg==";
                                                        if (onUpdateNodeParams) {
                                                            onUpdateNodeParams(node.id, { ...node.data.params, image: TEST_IMAGE });
                                                        }
                                                    }}
                                                    className="text-xs bg-red-500/20 hover:bg-red-500/40 text-red-500 px-2 py-1 rounded transition-colors"
                                                >
                                                    Test Img
                                                </button>
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors"
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <strong className="block mb-1 text-red-500">Error:</strong>
                                            {node.data.error}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(isRoleNode || node.type === 'coherence_lock' || node.data.result) && (
                                        <div className="w-full flex-1 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden relative group min-h-[100px]">
                                            {(() => {
                                                if (node.type === 'coherence_lock' && node.data.result) {
                                                    return (
                                                        <div className="flex flex-col items-center justify-center w-full h-full bg-purple-900/10 text-purple-300">
                                                            <Lock className="w-6 h-6 mb-2 text-purple-400" />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">Lock Active</span>
                                                        </div>
                                                    );
                                                }

                                                const displayImage = node.data.result || node.data.params.image;
                                                if (displayImage) {
                                                    return (
                                                        <div className="w-full h-full relative">
                                                            <img
                                                                src={displayImage}
                                                                className="w-full h-full object-contain"
                                                            />
                                                            {node.type === 'output_result' && node.data.result && !isHistory && (
                                                                <div className="absolute bottom-2 right-2 flex gap-1">
                                                                    <div className="bg-black/80 text-white text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                                                        Connect "Result" to next Step
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div className="flex flex-col items-center text-gray-600 select-none">
                                                        {node.type === 'coherence_lock' ? (
                                                            <Lock className="w-8 h-8 mb-1 opacity-50 text-purple-500" />
                                                        ) : (
                                                            <div
                                                                className={`flex flex-col items-center gap-2 ${node.type === 'image_source' ? 'cursor-pointer group/upload' : ''}`}
                                                                onClick={node.type === 'image_source' ? handleUploadClick : undefined}
                                                            >
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${node.type === 'image_source' ? 'group-hover/upload:scale-110' : ''}`}>
                                                                    <Upload className="w-8 h-8 text-gray-500 opacity-50 group-hover/upload:opacity-100 group-hover/upload:text-white transition-all" />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {node.type === 'output_result' && <span className="text-[9px] text-gray-500">Waiting...</span>}
                                                    </div>
                                                );
                                            })()}
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
                                    {node.type === 'input_prompt' && (
                                        <textarea
                                            className="w-full h-16 p-3 text-[10px] text-gray-300 bg-transparent border-none outline-none resize-none placeholder:text-gray-600 placeholder:italic"
                                            placeholder="Enter prompt..."
                                            value={node.data.params.text || ''}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                onUpdateNodeParams?.(node.id, { ...node.data.params, text: e.target.value });
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        />
                                    )}
                                    {node.type === 'ai_generator' && !node.data.result && (
                                        <div className="w-full h-24 flex items-center justify-center text-[10px] text-gray-500 text-center px-4 border border-dashed border-[#333] rounded">
                                            Waiting for Inputs...
                                        </div>
                                    )}

                                </div>
                            )}
                        </div>
                    </div>

                    {!isCollapsed && (
                        <div className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={handleResizeStart}>
                            <div className="w-2 h-2 border-b-2 border-r-2 border-white/20" />
                        </div>
                    )}
                </div>

                {/* Left Ports (Centered relative to glass-node) */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[32px] flex flex-col space-y-4 z-[120]">
                    {/* Decorative Circle (Always visible on the left) */}
                    <div className="node-port pointer-events-none" />

                    {/* Actual Ports (Invisible but functional) */}
                    <div className="absolute inset-0 flex flex-col space-y-4 opacity-0">
                        {inputs.map((port) => (
                            <div
                                key={port.id}
                                className="group relative flex items-center"
                                onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node.id, port.id, true); }}
                                onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node.id, port.id, true); }}
                            >
                                <div className="absolute -inset-3 z-0 cursor-crosshair" />
                                <div className={`node-port ${getPortColor(port.type, port.id)} ${getPortStatusClass(port.id, true)}`} />
                                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center">
                                    <span className="text-[9px] text-gray-400 uppercase opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none bg-black/80 backdrop-blur-md px-2 py-0.5 rounded border border-white/10 z-50 shadow-xl">{port.label}</span>
                                    {getRoleMismatchWarning(port.id) && <AlertTriangle className="w-4 h-4 text-yellow-500 ml-1 animate-bounce" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Ports (Centered relative to glass-node) */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[32px] flex flex-col space-y-4 z-[120]">
                    {/* Decorative Circle (Always visible on the right) */}
                    <div className="node-port pointer-events-none" />

                    {/* Actual Ports (Invisible but functional) */}
                    <div className="absolute inset-0 flex flex-col space-y-4 opacity-0">
                        {outputs.map((port) => (
                            <div
                                key={port.id}
                                className="group relative flex items-center justify-end"
                                onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node.id, port.id, false); }}
                                onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node.id, port.id, false); }}
                            >
                                <div className="absolute -inset-3 z-0 cursor-crosshair" />
                                <span className="absolute right-6 text-[9px] text-gray-400 uppercase opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none bg-black/80 backdrop-blur-md px-2 py-0.5 rounded border border-white/10 z-50 shadow-xl">{port.label}</span>
                                <div className={`node-port ${getPortColor(port.type, port.id)}`} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal */}
            {/* Modal */}
            <LayerEditorModal
                isOpen={showLayerEditor}
                onClose={() => setShowLayerEditor(false)}
                onRefiningChange={useCallback((isRefining: boolean) => {
                    if (onUpdateNodeData) {
                        onUpdateNodeData(node.id, { data: { isLocked: isRefining } });
                    }
                }, [node.id, onUpdateNodeData])}
                onSave={useCallback((flattened: string, layers: Layer[]) => {
                    if (onUpdateNodeParams) {
                        const newParams = {
                            ...node.data.params,
                            image: flattened,
                            layers: layers
                        };
                        onUpdateNodeParams(node.id, newParams);
                    }
                }, [node.id, node.data.params, onUpdateNodeParams])}
                initialLayers={
                    // If node has stored layers, use them
                    (node.data.params.layers && node.data.params.layers.length > 0) ? node.data.params.layers :
                        // Otherwise, initialize with current image as background
                        (node.data.result || node.data.params.image) ? [{
                            id: `background-${Date.now()}`,
                            sourceId: 'Base Image',
                            image: node.data.result || node.data.params.image,
                            x: 0,
                            y: 0,
                            scale: 1,
                            rotation: 0,
                            opacity: 1,
                            blendMode: 'normal',
                            visible: true,
                            zIndex: 0
                        }] : []
                }
            />
        </div >
    );
});
