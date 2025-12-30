import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Histogram } from './Histogram';
import { CURVES_PRESETS } from '../constants/presets';
import { CurvesControl } from './CurvesControl';
import { X, Layers, Eye, EyeOff, Move, Trash2, Check, GripVertical, Hand, ZoomIn, Brush, Eraser, Crop, MousePointer2, ChevronRight, ChevronLeft, ChevronDown, Wand2, Lock, Unlock, Folder, FolderOpen, FolderPlus, Edit2, Plus, Download, Copy, Maximize, Palette, Upload, Info, PanelLeft, PanelRight, Sliders, RotateCcw, Sparkles, AlertTriangle } from 'lucide-react';
import { FabricCanvas, FabricCanvasRef } from './FabricCanvas';
import * as fabric from 'fabric';
import { Layer, ActiveTool } from '../types';
import { removeImageBackground } from '../services/segmentation';
import { refineImage, realizeLayers, enhanceSketch, analyzeImageStyle, applyImageStyle, generativePoseRefine, generativeTransformationAI } from '../services/gemini';
import { detectPoseInImage } from '../services/mediapipe';
import { PosePair } from '../services/pose';
import { callReveAPI, prepareReveRequest } from '../services/reve';

import { Loader2 } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface SortableLayerItemProps {
    layer: Layer;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Layer>) => void;
    onDelete: (id: string) => void;
    depth?: number;
}

const SortableLayerItem = ({ layer, isSelected, onSelect, onUpdate, onDelete, depth = 0 }: SortableLayerItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(layer.name || layer.sourceId);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: layer.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
        opacity: isDragging ? 0.5 : 1,
        paddingLeft: `${depth * 24 + 8}px`,
    };

    const handleRename = () => {
        onUpdate(layer.id, { name: editName });
        setIsEditing(false);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => onSelect(layer.id)}
            className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-fashion-accent/20 border border-fashion-accent/30' : 'hover:bg-white/5 border border-transparent'}`}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/60 p-1"
            >
                <GripVertical className="w-4 h-4" />
            </div>
            
            <div className="w-8 h-8 flex items-center justify-center bg-black/50 rounded overflow-hidden border border-white/10 relative flex-shrink-0">
                {layer.type === 'group' ? (
                    layer.collapsed ? <Folder className="w-4 h-4 text-fashion-accent" /> : <FolderOpen className="w-4 h-4 text-fashion-accent" />
                ) : (
                    <img src={layer.image} className="w-full h-full object-cover" />
                )}
            </div>

            {isEditing ? (
                <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    className="text-xs bg-black/40 text-white border border-fashion-accent/50 rounded px-1 flex-1 outline-none"
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span 
                    className="text-xs text-white/80 truncate flex-1"
                    onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                >
                    {layer.name || layer.sourceId}
                </span>
            )}

            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                    className="p-1 text-white/40 hover:text-white"
                    title="Rename"
                >
                    <Edit2 className="w-3 h-3" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
                    className="p-1 text-white/40 hover:text-red-500"
                    title="Delete"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
                {layer.type === 'group' && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { collapsed: !layer.collapsed }); }}
                        className="p-1 text-white/40 hover:text-white"
                    >
                        {layer.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                    </button>
                )}
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { locked: !layer.locked }); }}
                className={`p-1 ${layer.locked ? 'text-fashion-accent' : 'text-white/40 hover:text-white'}`}
                title={layer.locked ? "Unlock Layer" : "Lock Layer"}
            >
                {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { visible: !layer.visible }); }}
                className="text-white/40 hover:text-white p-1"
            >
                {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
        </div>
    );
};

interface LayerEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (flattenedImage: string, layers: Layer[]) => void;
    initialLayers: Layer[];
    canvasSize?: { width: number; height: number };
    onRefiningChange?: (isRefining: boolean) => void;
}

// Reusable Slider Component
const SliderControl = ({ 
    label, 
    value, 
    min, 
    max, 
    step = 1, 
    onChange, 
    formatValue = (v: number) => Math.round(v) 
}: { 
    label: string; 
    value: number; 
    min: number; 
    max: number; 
    step?: number; 
    onChange: (val: number) => void; 
    formatValue?: (v: number) => string | number;
}) => (
    <div className="space-y-1 group">
        <div className="flex justify-between text-[10px] items-center">
            <span className="text-white/60 group-hover:text-white/90 transition-colors">{label}</span>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="bg-transparent text-right text-white/40 group-hover:text-white/90 w-12 outline-none focus:text-white transition-colors"
                />
                {value !== 0 && (
                    <button 
                        onClick={() => onChange(0)}
                        className="text-white/20 hover:text-white transition-colors"
                        title="Reset"
                    >
                        <RotateCcw size={10} />
                    </button>
                )}
            </div>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.5)] hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
        />
    </div>
);

// Collapsible Section Component
const Section = ({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-t border-white/10 py-3">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex justify-between items-center w-full text-[10px] uppercase font-bold text-white/40 hover:text-white/80 mb-2 transition-colors"
            >
                {title}
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {isOpen && <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
        </div>
    );
};

const lerpColor = (c1: string, c2: string, t: number) => {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const getColorAtOffset = (stops: { offset: number, color: string }[], offset: number) => {
    const sortedStops = [...stops].sort((a, b) => a.offset - b.offset);
    if (offset <= sortedStops[0].offset) return sortedStops[0].color;
    if (offset >= sortedStops[sortedStops.length - 1].offset) return sortedStops[sortedStops.length - 1].color;
    
    for (let i = 0; i < sortedStops.length - 1; i++) {
        if (offset >= sortedStops[i].offset && offset <= sortedStops[i+1].offset) {
            const t = (offset - sortedStops[i].offset) / (sortedStops[i+1].offset - sortedStops[i].offset);
            return lerpColor(sortedStops[i].color, sortedStops[i+1].color, t);
        }
    }
    return sortedStops[0].color;
};

export const LayerEditorModal: React.FC<LayerEditorModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialLayers,
    canvasSize = { width: 1024, height: 1024 },
    onRefiningChange
}) => {
    const [layers, setLayers] = useState<Layer[]>(initialLayers);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ActiveTool>('move');
    const [brushColor, setBrushColor] = useState<string>('#00cc88');
    const [brushSize, setBrushSize] = useState<number>(20);
    const [activeChannel, setActiveChannel] = useState<'master' | 'red' | 'green' | 'blue'>('master');
    const [activeToneRange, setActiveToneRange] = useState<'shadows' | 'midtones' | 'highlights'>('midtones');
    const [activeSelectiveRange, setActiveSelectiveRange] = useState<'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas' | 'whites' | 'neutrals' | 'blacks'>('reds');
    const [activeGradientStopId, setActiveGradientStopId] = useState<string | null>(null);
    const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
    const gradientBarRef = useRef<HTMLDivElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const shouldOpenColorPickerRef = useRef(false);
    const grabOffsetRef = useRef<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);

    const [isRefining, setIsRefining] = useState(false);

    const [showLayersPanel, setShowLayersPanel] = useState(true);
    const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);
    const [posePoints, setPosePoints] = useState<PosePair[]>([]);
    const [isGenerativeRefine, setIsGenerativeRefine] = useState(true);
    const [canvasDimensions, setCanvasDimensions] = useState(canvasSize);
    const [viewScale, setViewScale] = useState(1);
    const [isTransformingAI, setIsTransformingAI] = useState(false);
    const [isTransformingReve, setIsTransformingReve] = useState(false);
    



    const isHistoryActionRef = useRef(false);
    const layersRef = useRef(layers);
    
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);
    
    const [historyState, setHistoryState] = useState<{
        items: { layers: Layer[], canvasDimensions: { width: number, height: number } }[];
        index: number;
    }>({
        items: [{ layers: initialLayers, canvasDimensions: canvasSize }],
        index: 0
    });


    const pushHistory = useCallback((newLayers: Layer[], newDims?: { width: number, height: number }) => {
        if (isHistoryActionRef.current) return;

        setHistoryState(prev => {
            const currentState = prev.items[prev.index];
            const nextLayers = JSON.parse(JSON.stringify(newLayers));
            const nextDims = newDims || currentState.canvasDimensions;

            // Simple check to avoid redundant history entries
            if (JSON.stringify(nextLayers) === JSON.stringify(currentState.layers) && 
                JSON.stringify(nextDims) === JSON.stringify(currentState.canvasDimensions)) {
                return prev;
            }

            const newItems = prev.items.slice(0, prev.index + 1);
            const nextState = {
                layers: nextLayers,
                canvasDimensions: nextDims
            };
            const updatedItems = [...newItems, nextState].slice(-100);
            return {
                items: updatedItems,
                index: updatedItems.length - 1
            };
        });
    }, []);

    const handleUndo = useCallback(() => {
        setHistoryState(prev => {
            if (prev.index > 0) {
                isHistoryActionRef.current = true;
                const newIndex = prev.index - 1;
                const state = prev.items[newIndex];
                setLayers(JSON.parse(JSON.stringify(state.layers)));
                setCanvasDimensions(state.canvasDimensions);
                setTimeout(() => { isHistoryActionRef.current = false; }, 100);
                return { ...prev, index: newIndex };
            }
            return prev;
        });
    }, []);

    const handleRedo = useCallback(() => {
        setHistoryState(prev => {
            if (prev.index < prev.items.length - 1) {
                isHistoryActionRef.current = true;
                const newIndex = prev.index + 1;
                const state = prev.items[newIndex];
                setLayers(JSON.parse(JSON.stringify(state.layers)));
                setCanvasDimensions(state.canvasDimensions);
                setTimeout(() => { isHistoryActionRef.current = false; }, 100);
                return { ...prev, index: newIndex };
            }
            return prev;
        });
    }, []);

    const handleDeleteLayer = useCallback((id?: string) => {
        const targetId = id || selectedLayerId;
        if (!targetId) return;

        const layerToDelete = layers.find(l => l.id === targetId);
        if (!layerToDelete) return;

        // Find all children if it's a group
        const idsToDelete = new Set([targetId]);
        if (layerToDelete.type === 'group') {
            const findChildren = (parentId: string) => {
                layers.forEach(l => {
                    if (l.parentId === parentId) {
                        idsToDelete.add(l.id);
                        if (l.type === 'group') findChildren(l.id);
                    }
                });
            };
            findChildren(targetId);
        }

        const newLayers = layers.filter(l => !idsToDelete.has(l.id));
        setLayers(newLayers);
        pushHistory(newLayers);

        if (targetId === selectedLayerId) {
            setSelectedLayerId(null);
        }
    }, [selectedLayerId, layers, pushHistory]);

    // Auto-migrate gradient map to double black default
    useEffect(() => {
        if (!selectedLayerId) return;
        const layer = layers.find(l => l.id === selectedLayerId);
        if (!layer || !layer.gradientMap?.enabled) return;

        const stops = layer.gradientMap.stops;
        const defaultStops = [{ id: 'stop-0', offset: 0, color: '#000000' }, { id: 'stop-1', offset: 1, color: '#000000' }];
        
        // Helper to normalize color for comparison
        const normalizeColor = (c: string) => c.toLowerCase().replace(/\s/g, '');
        const isBlack = (c: string) => ['#000000', '#000', 'black', 'rgb(0,0,0)'].includes(normalizeColor(c));
        const isWhite = (c: string) => ['#ffffff', '#fff', 'white', 'rgb(255,255,255)'].includes(normalizeColor(c));

        // Aggressive check: If 2 stops, and one is black and one is white (regardless of offset), reset it.
        const isOldDefault = stops.length === 2 && 
            stops.some(s => isBlack(s.color)) && 
            stops.some(s => isWhite(s.color));

        // Also check for single black stop (previous fix) and convert to double black
        const isSingleBlack = stops.length === 1 && isBlack(stops[0].color);

        if (isOldDefault || isSingleBlack) {
            console.log('[GradientMap] Auto-migrating layer to double black default');
            handleLayerUpdate(layer.id, {
                gradientMap: {
                    ...layer.gradientMap,
                    stops: defaultStops
                }
            });
        }
    }, [selectedLayerId, layers]);

    useEffect(() => {
        if (!isOpen) return;
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'z') {
                    if (e.shiftKey) {
                        handleRedo();
                    } else {
                        handleUndo();
                    }
                    e.preventDefault();
                } else if (e.key.toLowerCase() === 'y') {
                    handleRedo();
                    e.preventDefault();
                }
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'v': setActiveTool('move'); break;
                case 'b': setActiveTool('brush'); break;
                case 'e': setActiveTool('eraser'); break;
                case 'c': setActiveTool('crop'); break;

                case 'backspace':
                case 'delete':
                    handleDeleteLayer();
                    e.preventDefault();
                    break;
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isOpen, historyState, handleUndo, handleRedo, handleDeleteLayer]);

    useEffect(() => {
        onRefiningChange?.(isRefining);
    }, [isRefining, onRefiningChange]);


    const [selectionMask, setSelectionMask] = useState<string | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const fabricCanvasRef = React.useRef<FabricCanvasRef>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (isOpen) {
            // Only initialize if we don't have layers yet or if we're opening fresh
            // We check if layers is empty to allow initialization, but avoid overwriting if we already have content
            if (layers.length === 0 && initialLayers.length > 0) {
                 setLayers(initialLayers);
                 setHistoryState({
                    items: [{ layers: initialLayers, canvasDimensions: canvasSize }],
                    index: 0
                });
            }
            // If layers are already there (e.g. from previous edits or just added), don't overwrite with initialLayers
            
            if (initialLayers.length > 0 && !selectedLayerId) {
                setSelectedLayerId(initialLayers[0].id);
                const firstLayer = initialLayers[0];
                if (firstLayer.width && firstLayer.height) {
                    const newWidth = Math.max(canvasSize.width, firstLayer.width);
                    const newHeight = Math.max(canvasSize.height, firstLayer.height);
                    const newDims = { width: newWidth, height: newHeight };
                    setCanvasDimensions(newDims);
                    setLayers(prev => {
                        const newLayers = [...prev];
                        if (newLayers[0]) {
                            newLayers[0] = {
                                ...newLayers[0],
                                x: newWidth / 2,
                                y: newHeight / 2
                            };
                        }
                        return newLayers;
                    });
                }
            } else if (layers.length === 0) {
                setCanvasDimensions(canvasSize);
            }
        }
    }, [isOpen, initialLayers]);

    useEffect(() => {
        const selectedLayer = layers.find(l => l.id === selectedLayerId);
        if (selectedLayer?.type === 'group' && (activeTool === 'brush' || activeTool === 'eraser')) {
            setActiveTool('move');
        }
    }, [selectedLayerId, activeTool, layers]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        
        const activeIndex = layers.findIndex(l => l.id === activeId);
        const overIndex = layers.findIndex(l => l.id === overId);
        const activeLayer = layers[activeIndex];
        const overLayer = layers[overIndex];

        if (!activeLayer || !overLayer) return;

        if (activeLayer.type === 'group') {
            let current = overLayer;
            while (current.parentId) {
                if (current.parentId === activeId) return;
                const parent = layers.find(l => l.id === current.parentId);
                if (!parent) break;
                current = parent;
            }
        }

        let newLayers = [...layers];
        let result: Layer[];
        if (overLayer.type === 'group') {
            const updatedActive = { ...activeLayer, parentId: overId };
            newLayers[activeIndex] = updatedActive;
            const targetIndex = activeIndex < overIndex ? overIndex - 1 : overIndex;
            result = arrayMove(newLayers, activeIndex, targetIndex);
        } else {
            const updatedActive = { ...activeLayer, parentId: overLayer.parentId };
            newLayers[activeIndex] = updatedActive;
            result = arrayMove(newLayers, activeIndex, overIndex);
        }
        setLayers(result);
        pushHistory(result);
    };

    const handleLayerUpdate = (id: string, updates: Partial<Layer>, skipHistory = false) => {
        setLayers(prev => {
            const next = prev.map(l => l.id === id ? { ...l, ...updates } : l);
            // Only push to history if it's not a history action and not skipped
            if (!isHistoryActionRef.current && !skipHistory) {
                pushHistory(next);
            }
            return next;
        });
    };

    // Handle global mouse events for dragging
    useEffect(() => {
        if (draggingStopId === null) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!gradientBarRef.current || !selectedLayerId) return;
            
            const rect = gradientBarRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left - grabOffsetRef.current;
            const offset = Math.max(0, Math.min(1, x / rect.width));
            
            setLayers(prev => {
                const layer = prev.find(l => l.id === selectedLayerId);
                if (!layer?.gradientMap?.stops) return prev;

                // Drag off to delete logic
                const rect = gradientBarRef.current!.getBoundingClientRect();
                const verticalDist = Math.abs(e.clientY - (rect.top + rect.height / 2));
                if (verticalDist > 100 && layer.gradientMap.stops.length > 1) {
                    const newStops = layer.gradientMap.stops.filter(s => s.id !== draggingStopId);
                    setDraggingStopId(null);
                    return prev.map(l => l.id === selectedLayerId ? {
                        ...l,
                        gradientMap: { ...l.gradientMap!, stops: newStops }
                    } : l);
                }

                const newStops = layer.gradientMap.stops.map(stop => 
                    stop.id === draggingStopId ? { ...stop, offset } : stop
                ).sort((a, b) => a.offset - b.offset || (a.id || '').localeCompare(b.id || ''));
                
                return prev.map(l => l.id === selectedLayerId ? {
                    ...l,
                    gradientMap: { ...l.gradientMap!, stops: newStops }
                } : l);
            });
        };

        const handleMouseUp = () => {
            if (draggingStopId !== null) {
                pushHistory(layersRef.current);
            }
            setDraggingStopId(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingStopId, selectedLayerId, pushHistory]);

    useEffect(() => {
        if (shouldOpenColorPickerRef.current && colorInputRef.current) {
            colorInputRef.current.click();
            shouldOpenColorPickerRef.current = false;
        }
    }, [activeGradientStopId]);

    const handleSelectionChange = (id: string | null) => {
        setSelectedLayerId(id);
        if (id) {
            const layer = layers.find(l => l.id === id);
            if (layer?.gradientMap?.enabled && layer.gradientMap.stops.length > 0) {
                setActiveGradientStopId(layer.gradientMap.stops[0].id);
            }
        }
    };


    const handleAddFolder = () => {
        const newFolder: Layer = {
            id: `group-${Date.now()}`,
            sourceId: 'New Folder',
            name: 'New Folder',
            image: '',
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            blendMode: 'normal',
            visible: true,
            zIndex: layers.length,
            type: 'group',
            collapsed: false
        };
        const next = [...layers, newFolder];
        setLayers(next);
        pushHistory(next);
        setSelectedLayerId(newFolder.id);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            if (result) {
                const img = new window.Image();
                img.onload = () => {
                    let newWidth = canvasDimensions.width;
                    let newHeight = canvasDimensions.height;
                    let newScale = 0.5; // Default scale if not resizing canvas
                    
                    // Prompt user to resize canvas
                    const shouldResize = window.confirm(
                        `Resize canvas to match image dimensions? (${img.width}x${img.height})`
                    );

                    if (shouldResize) {
                        newWidth = img.width;
                        newHeight = img.height;
                        setCanvasDimensions({ width: newWidth, height: newHeight });
                        newScale = 1; // Full scale if canvas matches image
                    } else {
                        // Smart scaling to fit if too large
                        const scaleX = (canvasDimensions.width * 0.8) / img.width;
                        const scaleY = (canvasDimensions.height * 0.8) / img.height;
                        newScale = Math.min(scaleX, scaleY, 1);
                    }

                    const newLayer: Layer = {
                        id: `layer-${Date.now()}`,
                        sourceId: file.name,
                        image: result,
                        x: newWidth / 2,
                        y: newHeight / 2,
                        scale: newScale,
                        rotation: 0,
                        opacity: 1,
                        blendMode: 'normal',
                        visible: true,
                        zIndex: layers.length,
                        width: img.width,
                        height: img.height
                    };
                    
                    setLayers(prev => {
                        const next = [...prev, newLayer];
                        // If we resized, we should probably update history with new dims
                        pushHistory(next, shouldResize ? { width: newWidth, height: newHeight } : undefined);
                        return next;
                    });
                    setSelectedLayerId(newLayer.id);
                };
                img.src = result;
            }
        };
        reader.readAsDataURL(file);
        if (e.target) e.target.value = '';
    };

    const handleRemoveBackground = async () => {
        if (!selectedLayerId) return;
        const layer = layers.find(l => l.id === selectedLayerId);
        if (!layer || layer.type === 'group') return;

        setIsProcessing(true);
        try {
            const newImage = await removeImageBackground(layer.image);
            handleLayerUpdate(selectedLayerId, { image: newImage });
        } catch (error) {
            console.error("Failed to remove background", error);
        } finally {
            setIsProcessing(false);
        }
    };



    const handleSelectionFill = async () => {
        if (!fabricCanvasRef.current || !selectedLayerId) return;
        
        const layer = layers.find(l => l.id === selectedLayerId);
        if (!layer || layer.type === 'group') {
            alert("Please select a valid image layer.");
            return;
        }

        const localRect = fabricCanvasRef.current.getLocalSelectionRect(selectedLayerId);
        if (!localRect) {
            alert("Please select an area using the crop tool first.");
            return;
        }

        const confirmed = window.confirm("Allow system to capture and send FULL ORIGINAL image to AI for processing?");
        if (!confirmed) return;

        setIsRefining(true);
        
        // Yield to main thread to allow UI to update (show spinner)
        setTimeout(async () => {
            try {
                // --- PROCESS ORIGINAL LAYER STRATEGY ---
                
                console.log(`[SelectionFill] Processing Layer: ${layer.name} (${layer.width}x${layer.height})`);
                
                if ((layer.width || 0) > 4096 || (layer.height || 0) > 4096) {
                    console.warn("[SelectionFill] Warning: Image is very large (>4096px). Processing may be slow.");
                }

                console.log(`[SelectionFill] Local Selection: ${localRect.x},${localRect.y} ${localRect.width}x${localRect.height}`);

                // 1. Use the ORIGINAL layer image
                const originalImageBase64 = layer.image;

                // 2. Create a Mask matching the ORIGINAL image dimensions
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = layer.width!;
                maskCanvas.height = layer.height!;
                const mctx = maskCanvas.getContext('2d');
                if (!mctx) throw new Error("Could not create mask context");
                
                // Fill Black (Protected)
                mctx.fillStyle = 'black';
                mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
                
                // Fill White (Selection) using LOCAL coordinates
                
                // Dynamic Padding based on image size (Blur removed as requested)
                const maxDim = Math.max(layer.width || 0, layer.height || 0);
                // Large padding to clear the object, NO blur
                const paddingAmount = Math.max(50, Math.round(maxDim * 0.10)); // 10%
                
                console.log(`[SelectionFill] Dynamic Mask: Padding=${paddingAmount}px (Blur Removed)`);

                mctx.filter = 'none'; 

                mctx.fillStyle = 'white';
                
                const maskPadding = paddingAmount;
                mctx.fillRect(
                    localRect.x - maskPadding, 
                    localRect.y - maskPadding, 
                    localRect.width + (maskPadding * 2), 
                    localRect.height + (maskPadding * 2)
                );
                mctx.filter = 'none';
                
                const maskDataUrl = maskCanvas.toDataURL('image/png');

                // 3. Prompt AI
                const smartFillPrompt = `
                    TASK: OBJECT REMOVAL / INPAINTING.
                    I have provided a FULL RESOLUTION PHOTO and a MASK.
                    The WHITE area in the mask is the selection to be filled.
                    
                    INSTRUCTIONS:
                    1. COMPLETELY REMOVE the object inside the WHITE masked area.
                    2. GENERATE NEW BACKGROUND that seamlessly extends the surrounding area.
                    3. CRITICAL: BLEND THE EDGES PERFECTLY. There must be NO visible seam, border, or outline where the mask ends.
                    4. IGNORE any "edges" or "frames" from the original photo inside the mask. The transition must be invisible.
                    5. Return the image with EXACTLY the same dimensions as the input.
                    6. Do not change the black protected areas.
                `.trim();

                const resultImage = await enhanceSketch(
                    originalImageBase64, 
                    null,
                    smartFillPrompt,
                    {},
                    maskDataUrl
                );

                // Verify Result Dimensions
                const imgCheck = new Image();
                imgCheck.src = resultImage;
                await new Promise(resolve => imgCheck.onload = resolve);
                
                if (imgCheck.width !== layer.width || imgCheck.height !== layer.height) {
                    console.warn(`[SelectionFill] Mismatch: Sent ${layer.width}x${layer.height}, Received ${imgCheck.width}x${imgCheck.height}. API may have resized.`);
                    // We could alert the user here if strictness is required
                } else {
                    console.log(`[SelectionFill] Success: Received exact dimensions ${imgCheck.width}x${imgCheck.height}`);
                }
                
                // 4. Update the Layer with the Result
                // We replace the layer's image directly since we processed the full resolution original
                handleLayerUpdate(selectedLayerId, {
                    image: resultImage
                });
                
                // Clear selection
                setActiveTool('move');
                
            } catch (error) {
                console.error("Selection Fill failed:", error);
                alert("Selection Fill failed. Please try again.");
            } finally {
                setIsRefining(false);
            }
        }, 50); // 50ms delay to ensure React render cycle completes

    };




    // --- RIGHT SIDEBAR STYLE TRANSFER LOGIC ---
    interface SavedStyle {
        id: string;
        name: string;
        description: string;
        thumbnail: string;
    }

    const [isStyleLibraryExpanded, setIsStyleLibraryExpanded] = useState(false);
    const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
    const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
    const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
    const styleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('atelier_saved_styles');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setSavedStyles(parsed);
                    if (parsed.length > 0) {
                        setSelectedStyleId(parsed[0].id);
                    }
                }
            } catch (e) {
                console.error("Failed to parse saved styles", e);
            }
        }
    }, []);

    const saveStylesToStorage = (styles: SavedStyle[]) => {
        localStorage.setItem('atelier_saved_styles', JSON.stringify(styles));
    };

    const handleUploadStyle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzingStyle(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const result = event.target?.result as string;
            if (result) {
                try {
                    console.log(`[StyleTransfer] Analyzing uploaded style reference...`);
                    const description = await analyzeImageStyle(result);
                    console.log(`[StyleTransfer] Analysis complete:`, description);
                    
                    const newStyle: SavedStyle = {
                        id: Date.now().toString(),
                        name: file.name.split('.')[0], // Remove extension
                        description: description,
                        thumbnail: result // Use the uploaded image as thumbnail
                    };

                    const updatedStyles = [...savedStyles, newStyle];
                    setSavedStyles(updatedStyles);
                    saveStylesToStorage(updatedStyles);
                    setSelectedStyleId(newStyle.id); // Auto-select new style

                } catch (error: any) {
                    console.error("Style analysis failed:", error);
                    alert(`Failed to analyze style: ${error.message || error}`);
                } finally {
                    setIsAnalyzingStyle(false);
                }
            }
        };
        reader.readAsDataURL(file);
        if (e.target) e.target.value = '';
    };

    const handleDeleteStyle = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmed = window.confirm("Are you sure you want to delete this style?");
        if (!confirmed) return;

        const updatedStyles = savedStyles.filter(s => s.id !== id);
        setSavedStyles(updatedStyles);
        saveStylesToStorage(updatedStyles);
        
        if (selectedStyleId === id) {
            setSelectedStyleId(updatedStyles.length > 0 ? updatedStyles[0].id : null);
        }
    };

    const handleApplySavedStyle = async () => {
        if (!selectedLayerId || !selectedStyleId) return;
        
        const style = savedStyles.find(s => s.id === selectedStyleId);
        const layer = layers.find(l => l.id === selectedLayerId);
        
        if (!style || !layer || layer.type === 'group') return;

        const confirmed = window.confirm(`Apply style "${style.name}" to layer "${layer.name || 'Layer'}"? This will regenerate the image.`);
        if (!confirmed) return;

        setIsRefining(true);
        try {
            console.log(`[StyleTransfer] Applying style "${style.name}" to layer: ${layer.name}`);
            const resultImage = await applyImageStyle(layer.image, style.description);
            
            handleLayerUpdate(selectedLayerId, { image: resultImage });
        } catch (error) {
            console.error("Style application failed:", error);
            alert("Failed to apply style. Please try again.");
        } finally {
            setIsRefining(false);
        }
    };

    const handleAutoDetect = async () => {
        if (!selectedLayerId) return;
        const layer = layers.find(l => l.id === selectedLayerId);
        if (!layer || layer.type === 'group') return;

        setIsAnalyzingStyle(true); // Reuse for spinner
        try {
            const points = await detectPoseInImage(layer.image, layer.width || 1000, layer.height || 1000);
            
            const newPairs: PosePair[] = points.map(p => ({
                handle: { x: p.x, y: p.y },
                target: { x: p.x, y: p.y },
                label: p.label
            }));
            
            setPosePoints(newPairs);
        } catch (error) {
            console.error("Auto detect failed:", error);
            alert("Failed to auto-detect points.");
        } finally {
            setIsAnalyzingStyle(false);
        }
    };

    const handleApplyReveTransformation = async () => {
        if (!selectedLayerId || posePoints.length === 0) return;
        const layer = layers.find(l => l.id === selectedLayerId);
        if (!layer) return;

        setIsTransformingReve(true);
        try {
            // 1. Prepare data
            const pointsData = prepareReveRequest(
                posePoints, 
                layer.width || 1024, 
                layer.height || 1024
            );

            // 2. Call Reve API
            // We send the original clean image
            const resultUrl = await callReveAPI(layer.image, pointsData);

            // 3. Update Layer
            handleLayerUpdate(selectedLayerId, { 
                image: resultUrl,
                preview: resultUrl 
            });
            
            // Clear points after successful application
            setPosePoints([]);
            
        } catch (error) {
            console.error("Reve Transformation failed:", error);
            alert("Failed to apply transformation. Please check your API key and try again.");
        } finally {
            setIsTransformingReve(false);
        }
    };



    const handleMagicExpand = async (targetWidth: number, targetHeight: number) => {
        if (!fabricCanvasRef.current) return;
        
        const confirmed = window.confirm("Allow system to resize canvas and use AI to fill the empty space?");
        if (!confirmed) return;

        setIsRefining(true);
        try {
            // 1. Calculate dimensions
            const currentWidth = canvasDimensions.width;
            const currentHeight = canvasDimensions.height;
            
            // 2. Capture current composition (World Space)
            const currentComposition = fabricCanvasRef.current.getDataURL({ 
                multiplier: 1, 
                fullWorld: true,
                width: currentWidth,
                height: currentHeight,
                left: 0,
                top: 0
            });

            // 3. Create a temporary canvas for the EXPANDED composition
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            const ctx = tempCanvas.getContext('2d');
            if (!ctx) throw new Error("Could not create temp context");

            // Fill with WHITE (solid background for AI)
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // Draw the current composition in the CENTER
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = currentComposition;
            });
            
            const offsetX = (targetWidth - currentWidth) / 2;
            const offsetY = (targetHeight - currentHeight) / 2;
            ctx.drawImage(img, offsetX, offsetY);
            
            const expandedImageBase64 = tempCanvas.toDataURL('image/png');

            // 4. Create the MASK
            // White = Generate (The new border area)
            // Black = Keep (The original center area)
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = targetWidth;
            maskCanvas.height = targetHeight;
            const mctx = maskCanvas.getContext('2d');
            if (!mctx) throw new Error("Could not create mask context");

            // Fill background with WHITE (Generate everything by default)
            mctx.fillStyle = 'white';
            mctx.fillRect(0, 0, targetWidth, targetHeight);

            // Dynamic Overlap based on image size (Blur removed)
            const maxDim = Math.max(currentWidth, currentHeight);
            const blendOverlap = Math.max(10, Math.round(maxDim * 0.01)); // 1% overlap

            // Draw BLACK rectangle in center (Protect original content)
            // NO Feathering for hard edge blend
            mctx.filter = 'none'; 
 
            mctx.fillStyle = 'black';
            
            // Contract the protected area slightly to ensure edge blending happens ON the original image edge
            mctx.fillRect(
                offsetX + blendOverlap, 
                offsetY + blendOverlap, 
                currentWidth - (blendOverlap * 2), 
                currentHeight - (blendOverlap * 2)
            );
            mctx.filter = 'none';

            const maskDataUrl = maskCanvas.toDataURL('image/png');

            // 5. Prompt AI
            const outpaintPrompt = `
                TASK: GENERATIVE FILL & SCENE EXTENSION.
                I have provided an image with a central content area and blank borders.
                The MASK indicates the blank borders as WHITE (Active Area).
                
                INSTRUCTIONS:
                1. INTELLIGENTLY FILL the masked area based on the surrounding context.
                2. EXPAND the scene realistically, matching the lighting, perspective, and texture of the central image EXACTLY.
                3. Ensure the transition between the center and the new borders is invisible.
                4. Do not modify the central protected area (Black in mask).
                5. The result must be PHOTOREALISTIC and indistinguishable from the original.
                6. Return the full expanded image.
            `.trim();

            const resultImage = await enhanceSketch(
                expandedImageBase64, 
                null,
                outpaintPrompt,
                {},
                maskDataUrl
            );

            // 6. Update State
            // Update canvas dimensions
            setCanvasDimensions({ width: targetWidth, height: targetHeight });
            
            // Add the result as a new background layer
            const newLayer: Layer = {
                id: `magic-expand-${Date.now()}`,
                sourceId: 'Magic Expand Result',
                name: 'Expanded Background',
                image: resultImage,
                x: targetWidth / 2,
                y: targetHeight / 2,
                scale: 1,
                rotation: 0,
                opacity: 1,
                blendMode: 'normal',
                visible: true,
                zIndex: 0, // Put at bottom
                type: 'layer',
                width: targetWidth,
                height: targetHeight,
                eraserPaths: []
            };

            // Shift existing layers to match new center? 
            // Actually, since we are replacing the background or adding a new full-size layer, 
            // we might want to group existing layers or just leave them.
            // But wait, if we expand the canvas, the existing layers' (x,y) which are relative to top-left 
            // need to be shifted by (offsetX, offsetY) to stay visually in the center!
            
            setLayers(prev => {
                const shiftedLayers = prev.map(l => ({
                    ...l,
                    x: l.x + offsetX,
                    y: l.y + offsetY
                }));
                const next = [newLayer, ...shiftedLayers]; // Add new background at bottom
                pushHistory(next, { width: targetWidth, height: targetHeight });
                return next;
            });
            
            setActiveTool('move');

        } catch (error) {
            console.error("Magic Expand failed:", error);
            alert("Magic Expand failed. Please try again.");
        } finally {
            setIsRefining(false);
        }
    };

    const handleAIRefine = async () => {
        if (!selectedLayerId || !fabricCanvasRef.current) return;
        const layer = layers.find(l => l.id === selectedLayerId);
        if (!layer || layer.type === 'group') return;

        setIsRefining(true);
        try {
            // Use ORIGINAL layer image to preserve resolution
            const originalImage = layer.image;
            console.log(`[AIRefine] Processing original image: ${layer.width}x${layer.height}`);

            const refinedImage = await refineImage(originalImage);
            
            // Verify Result Dimensions
            const imgCheck = new Image();
            imgCheck.src = refinedImage;
            await new Promise(resolve => imgCheck.onload = resolve);
            
            if (imgCheck.width !== layer.width || imgCheck.height !== layer.height) {
                console.warn(`[AIRefine] Mismatch: Sent ${layer.width}x${layer.height}, Received ${imgCheck.width}x${imgCheck.height}. API may have resized.`);
            } else {
                console.log(`[AIRefine] Success: Received exact dimensions ${imgCheck.width}x${imgCheck.height}`);
            }
            
            handleLayerUpdate(selectedLayerId, { 
                image: refinedImage,
                x: canvasDimensions.width / 2,
                y: canvasDimensions.height / 2,
                scale: 1,
                rotation: 0,
                eraserPaths: []
            });
            
        } catch (error: any) {
            console.error("AI Refine failed:", error);
            alert(`AI Refine failed: ${error.message || "Unknown error"}`);
        } finally {
            setIsRefining(false);
        }
    };

    const handleCrop = async (rect: { x: number, y: number, width: number, height: number }) => {
        if (!selectedLayerId) return;
        const selectedLayer = layers.find(l => l.id === selectedLayerId);
        if (!selectedLayer || selectedLayer.type === 'group') return;

        const tempCanvasEl = document.createElement('canvas');
        tempCanvasEl.width = rect.width;
        tempCanvasEl.height = rect.height;
        const tempCanvas = new fabric.StaticCanvas(tempCanvasEl);
        tempCanvas.setViewportTransform([1, 0, 0, 1, -rect.x, -rect.y]);

        try {
            const img = await fabric.Image.fromURL(selectedLayer.image, { crossOrigin: 'anonymous' });
            if (!img) return;
            
            img.set({
                left: selectedLayer.x,
                top: selectedLayer.y,
                scaleX: selectedLayer.scale,
                scaleY: selectedLayer.scale,
                angle: selectedLayer.rotation,
                opacity: 1,
                originX: 'center',
                originY: 'center'
            });

            // Handle Eraser Paths (ClipPath)
            if (selectedLayer.eraserPaths && selectedLayer.eraserPaths.length > 0) {
                const spacer = new fabric.Rect({
                    width: 10000,
                    height: 10000,
                    fill: 'transparent',
                    left: 0,
                    top: 0,
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false,
                    // @ts-ignore
                    id: 'spacer-eraser'
                });
                const clipGroup = new fabric.Group([spacer], {
                    inverted: true,
                    absolutePositioned: false,
                    originX: 'center',
                    originY: 'center',
                    left: 0,
                    top: 0
                });
                
                for (const pData of selectedLayer.eraserPaths) {
                    const path = await fabric.Path.fromObject(pData);
                    path.set({
                        left: pData.left,
                        top: pData.top,
                        scaleX: pData.scaleX,
                        scaleY: pData.scaleY,
                        angle: pData.angle,
                        stroke: 'black',
                        fill: '',
                        originX: pData.originX || 'left',
                        originY: pData.originY || 'top'
                    });
                    clipGroup.add(path);
                }
                clipGroup.set({ left: 0, top: 0 });
                img.set({ clipPath: clipGroup });
            }

            // Handle Brush Paths (Draw on top)
            if (selectedLayer.brushPaths && selectedLayer.brushPaths.length > 0) {
                tempCanvas.add(img);
                
                // Calculate matrix to transform local brush coords to world coords
                // We need to ensure coords are calculated
                img.setCoords(); 
                const matrix = img.calcTransformMatrix();

                for (const pData of selectedLayer.brushPaths) {
                    const path = await fabric.Path.fromObject(pData);
                    
                    // Transform local point to world point (matching FabricCanvas rendering logic)
                    const worldPoint = fabric.util.transformPoint(
                        new fabric.Point(pData.left, pData.top), 
                        matrix
                    );

                    path.set({
                        left: worldPoint.x,
                        top: worldPoint.y,
                        scaleX: pData.scaleX * (img.scaleX || 1),
                        scaleY: pData.scaleY * (img.scaleY || 1),
                        angle: pData.angle + (img.angle || 0),
                        stroke: pData.stroke,
                        strokeWidth: pData.strokeWidth,
                        fill: pData.fill,
                        originX: pData.originX || 'left',
                        originY: pData.originY || 'top'
                    });
                    tempCanvas.add(path);
                }
            } else {
                // No brush paths, just add the image directly
                tempCanvas.add(img);
            }
            
            tempCanvas.renderAll();
            const croppedDataUrl = tempCanvas.toDataURL({ format: 'png', multiplier: 1 });
            if (croppedDataUrl.length < 100) return;

            handleLayerUpdate(selectedLayerId, {
                image: croppedDataUrl,
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                scale: 1,
                rotation: 0,
                width: rect.width,
                height: rect.height,
                eraserPaths: [],
                brushPaths: []
            });
            setActiveTool('move');
        } catch (error) {
            console.error('[LayerEditorModal] Error during crop:', error);
        } finally {
            tempCanvas.dispose();
        }
    };

    const handleDownload = () => {
        if (fabricCanvasRef.current) {
            const dataUrl = fabricCanvasRef.current.getDataURL();
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `composition-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleZoomToFit = () => {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const padding = 80;
        const availableWidth = container.clientWidth - padding;
        const availableHeight = container.clientHeight - padding;
        const scaleX = availableWidth / canvasDimensions.width;
        const scaleY = availableHeight / canvasDimensions.height;
        const newScale = Math.min(scaleX, scaleY, 1);
        setViewScale(newScale);
    };

    useEffect(() => {
        handleZoomToFit();
    }, [canvasDimensions, isOpen]);

    const handleSave = () => {
        if (fabricCanvasRef.current) {
            const flattenedImage = fabricCanvasRef.current.getDataURL();
            onSave(flattenedImage, layers);
        }
        onClose();
    };

    if (!isOpen) return null;
    const selectedLayer = layers.find(l => l.id === selectedLayerId);

    const getLayerDepth = (layer: Layer) => {
        let depth = 0;
        let current = layer;
        while (current.parentId) {
            const parent = layers.find(l => l.id === current.parentId);
            if (parent) {
                depth++;
                current = parent;
            } else {
                break;
            }
        }
        return depth;
    };

    const modalContent = (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onWheel={(e) => e.stopPropagation()}>
            <div className="w-full h-full max-w-[1400px] max-h-[900px] bg-[#111] border border-white/10 rounded-2xl flex overflow-hidden shadow-2xl">
                {/* LEFT TOOLBAR */}
                <div className="w-16 bg-[#161616] border-r border-white/5 flex flex-col items-center py-4 gap-2 z-20 overflow-y-auto custom-scrollbar">
                    <button
                        onClick={() => {
                            const selectedLayer = layers.find(l => l.id === selectedLayerId);
                            if (selectedLayer?.type !== 'group') setActiveTool('move');
                        }}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'move' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Move Tool (V)"
                    >
                        <Move className="w-5 h-5" />
                    </button>

                    <div className="w-8 h-[1px] bg-white/10 my-1" />

                    <button
                        onClick={() => {
                            const selectedLayer = layers.find(l => l.id === selectedLayerId);
                            if (selectedLayer?.type !== 'group') setActiveTool('brush');
                        }}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'brush' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'} ${(layers.find(l => l.id === selectedLayerId)?.type === 'group') ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Brush Tool (B)"
                    >
                        <Brush className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            const selectedLayer = layers.find(l => l.id === selectedLayerId);
                            if (selectedLayer?.type !== 'group') setActiveTool('eraser');
                        }}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'eraser' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'} ${(layers.find(l => l.id === selectedLayerId)?.type === 'group') ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Eraser Tool (E)"
                    >
                        <Eraser className="w-5 h-5" />
                    </button>

                    <div className="w-8 h-[1px] bg-white/10 my-1" />

                    <button
                        onClick={() => setActiveTool('crop')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'crop' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Crop Tool (C)"
                    >
                        <Crop className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setActiveTool('expand')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'expand' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Magic Expand"
                    >
                        <Maximize className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setActiveTool('transformation')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'transformation' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="AI Pose Tool (D)"
                    >
                        <MousePointer2 className="w-5 h-5" />
                    </button>

                    <div className="w-8 h-[1px] bg-white/10 my-1" />

                    <button
                        onClick={() => setActiveTool('style_transfer')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'style_transfer' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'} relative group`}
                        title="AI Style Transfer"
                    >
                        <Palette className="w-5 h-5" />
                    </button>

                    <button
                        onClick={() => setActiveTool('color_adjust')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'color_adjust' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Color Adjustments"
                    >
                        <Sliders className="w-5 h-5" />
                    </button>

                    <div className="flex-1" /> {/* Spacer */}

                    <button
                        onClick={() => setShowLayersPanel(!showLayersPanel)}
                        className={`p-3 rounded-xl transition-all ${showLayersPanel ? 'text-white bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        title="Toggle Layers Panel"
                    >
                        <PanelLeft className="w-5 h-5" />
                    </button>
                </div>



                {/* LAYERS PANEL */}
                <div className={`bg-[#161616] border-r border-white/5 flex flex-col transition-all duration-300 flex-shrink-0 ${showLayersPanel ? 'w-64' : 'w-0 overflow-hidden'}`}>
                    <div className="p-4 border-b border-white/5 flex justify-between items-center min-w-[256px]">
                        <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                            <Layers className="w-4 h-4" /> Layers
                        </h3>
                        <div className="flex items-center gap-2">
                            <button onClick={handleAddFolder} className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded" title="Add Folder">
                                <FolderPlus className="w-4 h-4" />
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded" title="Add Image">
                                <Plus className="w-4 h-4" />
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 min-w-[256px]">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={layers.map(l => l.id).reverse()} strategy={verticalListSortingStrategy}>
                                {[...layers].reverse().filter(layer => {
                                    let current = layer;
                                    while (current.parentId) {
                                        const parent = layers.find(l => l.id === current.parentId);
                                        if (parent?.collapsed) return false;
                                        if (!parent) break;
                                        current = parent;
                                    }
                                    return true;
                                }).map(layer => (
                                    <SortableLayerItem
                                        key={layer.id}
                                        layer={layer}
                                        isSelected={selectedLayerId === layer.id}
                                        onSelect={() => setSelectedLayerId(layer.id)}
                                        onUpdate={handleLayerUpdate}
                                        onDelete={handleDeleteLayer}
                                        depth={getLayerDepth(layer)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                        {selectedLayer && (
                            <button onClick={() => handleDeleteLayer(selectedLayer.id)} disabled={isRefining} className="w-full py-2 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2">
                                <Trash2 className="w-4 h-4" /> Delete {selectedLayer.type === 'group' ? 'Folder' : 'Layer'}
                            </button>
                        )}
                    </div>
                </div>
                {/* CENTER CANVAS */}
                <div className="flex-1 bg-[#0a0a0a] relative flex flex-col min-w-0">
                    <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur px-3 py-1 rounded-full border border-white/10 text-[10px] text-white/50 flex items-center gap-2">
                        <span>{canvasDimensions.width} x {canvasDimensions.height}</span>
                        <span className="text-white uppercase font-bold">{activeTool}</span>
                        {activeTool === 'crop' && <span className="text-white/30 ml-2 border-l border-white/10 pl-2">Double-click or Enter to Crop</span>}
                    </div>

                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                        <button
                            onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
                            className={`p-2 rounded-lg transition-all ${showPropertiesPanel ? 'bg-white/10 text-white' : 'bg-black/50 text-white/40 hover:text-white hover:bg-white/10'} border border-white/10 backdrop-blur`}
                            title="Toggle Properties Panel"
                        >
                            <PanelRight className="w-5 h-5" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg bg-black/50 text-white/40 hover:text-white hover:bg-red-500/20 border border-white/10 backdrop-blur transition-all"
                            title="Close Modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div id="canvas-container" className="flex-1 overflow-hidden flex items-center justify-center p-8 relative">
                        <div 
                            className="shadow-2xl border border-white/5 transition-transform duration-300 origin-center"
                            style={{ transform: `scale(${viewScale})` }}
                        >
                            <FabricCanvas
                                ref={fabricCanvasRef}
                                width={canvasDimensions.width}
                                height={canvasDimensions.height}
                                layers={layers.map(l => {
                                    let isVisible = l.visible;
                                    let isLocked = l.locked;
                                    let current = l;
                                    while (current.parentId) {
                                        const parent = layers.find(p => p.id === current.parentId);
                                        if (parent) {
                                            isVisible = isVisible && parent.visible;
                                            isLocked = isLocked || parent.locked;
                                            current = parent;
                                        } else break;
                                    }
                                    return { ...l, visible: isVisible, locked: isLocked };
                                })}
                                onLayerUpdate={handleLayerUpdate}
                                onSelectionChange={handleSelectionChange}
                                selectedLayerId={selectedLayerId}
                                activeTool={activeTool}
                                onCrop={handleCrop}
                                brushColor={brushColor}
                                brushSize={brushSize}
                                viewScale={viewScale}
                                posePoints={posePoints}
                                onPosePointsChange={setPosePoints}
                            />
                        </div>
                    </div>
                    <div className="h-16 bg-[#161616] border-t border-white/5 flex items-center justify-between px-6">
                        <div className="flex items-center gap-4">
                            <button onClick={onClose} disabled={isRefining} className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white transition-colors disabled:opacity-50">Cancel</button>
                            <div className="w-[1px] h-4 bg-white/10" />
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={handleUndo} 
                                    disabled={historyState.index === 0 || isRefining}
                                    className="p-2 text-white/40 hover:text-white disabled:opacity-20 transition-all"
                                    title="Undo (Ctrl+Z)"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={handleRedo} 
                                    disabled={historyState.index === historyState.items.length - 1 || isRefining}
                                    className="p-2 text-white/40 hover:text-white disabled:opacity-20 transition-all"
                                    title="Redo (Ctrl+Shift+Z)"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={handleDownload} 
                                disabled={isRefining}
                                className="px-6 py-2 bg-white/5 text-white border border-white/10 rounded-lg text-xs font-bold hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-50"
                                title="Download as PNG"
                            >
                                <Download className="w-4 h-4" /> Download
                            </button>
                            <button onClick={handleSave} disabled={isRefining} className="px-6 py-2 bg-fashion-accent text-white border border-white/20 rounded-lg text-xs font-bold hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-50">
                                <Check className="w-4 h-4" /> Apply Composition
                            </button>
                        </div>
                    </div>
                </div>
                {/* PROPERTIES PANEL */}
                <div className={`bg-[#161616] border-l border-white/5 flex flex-col transition-all duration-300 flex-shrink-0 ${showPropertiesPanel ? 'w-80' : 'w-0 overflow-hidden'}`}>
                    <div className="flex-1 min-w-[320px] p-4 space-y-6 overflow-y-auto">
                        {/* CANVAS SETTINGS */}
                        <div className="space-y-4 pb-6 border-b border-white/5">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] uppercase font-bold text-white/40">Sheet Size</label>
                                <button 
                                    onClick={handleZoomToFit}
                                    className="text-[10px] text-white hover:underline font-bold"
                                >
                                    Zoom to Fit
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-[9px] text-white/20 uppercase">Width</span>
                                    <input 
                                        type="number" 
                                        value={canvasDimensions.width} 
                                        onChange={(e) => {
                                            const newDims = { ...canvasDimensions, width: parseInt(e.target.value) || 0 };
                                            setCanvasDimensions(newDims);
                                            pushHistory(layersRef.current, newDims);
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded p-2 text-xs text-white outline-none focus:border-white/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] text-white/20 uppercase">Height</span>
                                    <input 
                                        type="number" 
                                        value={canvasDimensions.height} 
                                        onChange={(e) => {
                                            const newDims = { ...canvasDimensions, height: parseInt(e.target.value) || 0 };
                                            setCanvasDimensions(newDims);
                                            pushHistory(layersRef.current, newDims);
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded p-2 text-xs text-white outline-none focus:border-white/50"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: 'Square', w: 1024, h: 1024 },
                                    { label: 'HD', w: 1920, h: 1080 },
                                    { label: 'Portrait', w: 1080, h: 1920 },
                                    { label: '4K', w: 3840, h: 2160 }
                                ].map(preset => (
                                    <button
                                        key={preset.label}
                                        onClick={() => {
                                            const newDims = { width: preset.w, height: preset.h };
                                            setCanvasDimensions(newDims);
                                            pushHistory(layersRef.current, newDims);
                                        }}
                                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] text-white/60 transition-colors"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedLayer ? (
                            <>
                                {/* MAGIC EXPAND PROPERTIES */}
                                {activeTool === 'expand' && (
                                    <div className="space-y-4 pb-6 border-b border-white/5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Maximize className="w-4 h-4 text-fashion-accent" />
                                            <span className="text-xs font-bold text-white">Magic Expand</span>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase font-bold text-white/40">Target Aspect Ratio</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { label: '16:9 Landscape', w: 1920, h: 1080 },
                                                    { label: '4:3 Standard', w: 1024, h: 768 },
                                                    { label: '1:1 Square', w: 1024, h: 1024 },
                                                    { label: '9:16 Portrait', w: 1080, h: 1920 }
                                                ].map(ratio => (
                                                    <button
                                                        key={ratio.label}
                                                        onClick={() => handleMagicExpand(ratio.w, ratio.h)}
                                                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-white/80 transition-colors text-left"
                                                    >
                                                        {ratio.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => handleMagicExpand(canvasDimensions.width * 1.5, canvasDimensions.height * 1.5)}
                                            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 text-white hover:from-pink-500 hover:to-rose-500 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-500/20"
                                        >
                                            <Wand2 className="w-4 h-4" />
                                            Expand 1.5x
                                        </button>
                                    </div>
                                )}

                                {activeTool === 'crop' && (
                                    <div className="space-y-2">
                                        <button 
                                            onClick={() => {
                                                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                                            }}
                                            className="w-full py-3 rounded-xl bg-fashion-accent text-white border border-white/20 hover:bg-white/10 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-white/10"
                                        >
                                            <Check className="w-4 h-4" /> Confirm Crop
                                        </button>
                                        <button 
                                            onClick={handleSelectionFill}
                                            disabled={isRefining}
                                            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                        >
                                            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                            Selection Fill
                                        </button>

                                    </div>
                                )}
                                {(activeTool === 'brush' || activeTool === 'eraser') && (
                                    <div className="space-y-4 pb-6 border-b border-white/5">
                                        <SliderControl
                                            label={`${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} Size`}
                                            value={brushSize}
                                            min={1}
                                            max={200}
                                            onChange={(v) => setBrushSize(v)}
                                            formatValue={(v) => `${v}px`}
                                        />
                                        {activeTool === 'brush' && (
                                            <div className="space-y-2">
                                                <label className="text-[10px] uppercase font-bold text-white/40">Brush Color</label>
                                                <div className="flex gap-2 flex-wrap">
                                                    {['#00cc88', '#ff4444', '#4488ff', '#ffcc00', '#ffffff', '#000000'].map(color => (
                                                        <button
                                                            key={color}
                                                            onClick={() => setBrushColor(color)}
                                                            className={`w-6 h-6 rounded-full border-2 ${brushColor === color ? 'border-white' : 'border-transparent'} transition-all hover:scale-110`}
                                                            style={{ backgroundColor: color }}
                                                        />
                                                    ))}
                                                    <input 
                                                        type="color" 
                                                        value={brushColor} 
                                                        onChange={(e) => setBrushColor(e.target.value)}
                                                        className="w-6 h-6 bg-transparent border-none cursor-pointer rounded-full overflow-hidden"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTool === 'transformation' && (
                                    <div className="space-y-4 pb-6 border-b border-white/5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <MousePointer2 className="w-4 h-4 text-fashion-accent" />
                                            <span className="text-xs font-bold text-white">AI Pose Refinement</span>
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button 
                                                onClick={() => setPosePoints([])}
                                                className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/10 hover:bg-red-500/20 text-xs font-bold transition-all"
                                            >
                                                Clear Points
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* COLOR ADJUSTMENTS - REFACTORED */}
                                {activeTool === 'color_adjust' && (
                                    <div className="mt-4 space-y-1">
                                        
                                        <Section title="Basic Adjustments" defaultOpen={true}>
                                            <SliderControl
                                                label="Opacity"
                                                value={(selectedLayer.opacity ?? 1) * 100}
                                                min={0}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { opacity: v / 100 })}
                                                formatValue={(v) => `${Math.round(v)}%`}
                                            />
                                            <SliderControl
                                                label="Exposure"
                                                value={selectedLayer.exposure || 0}
                                                min={-2}
                                                max={2}
                                                step={0.1}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { exposure: v })}
                                                formatValue={(v) => v.toFixed(1)}
                                            />
                                            <SliderControl
                                                label="Contrast"
                                                value={selectedLayer.contrast || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { contrast: v })}
                                            />
                                            <SliderControl
                                                label="Brightness"
                                                value={selectedLayer.brightness || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { brightness: v })}
                                            />
                                            <SliderControl
                                                label="Saturation"
                                                value={selectedLayer.saturation || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { saturation: v })}
                                            />
                                            <SliderControl
                                                label="Hue"
                                                value={selectedLayer.hue || 0}
                                                min={-180}
                                                max={180}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { hue: v })}
                                                formatValue={(v) => `${Math.round(v)}°`}
                                            />
                                            <SliderControl
                                                label="Gamma"
                                                value={selectedLayer.gamma || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { gamma: v })}
                                            />
                                        </Section>

                                        <Section title="Curves">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    <select 
                                                        className="bg-black/40 text-[10px] text-white/60 border border-white/10 rounded px-1 py-0.5 outline-none focus:border-white/30"
                                                        onChange={(e) => {
                                                            const preset = CURVES_PRESETS.find(p => p.id === e.target.value);
                                                            if (preset) {
                                                                handleLayerUpdate(selectedLayer.id, { 
                                                                    curves: preset.curves
                                                                });
                                                            }
                                                        }}
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled>Presets</option>
                                                        {CURVES_PRESETS.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                    <div className="flex bg-black/40 rounded p-0.5 gap-0.5">
                                                    {(['master', 'red', 'green', 'blue'] as const).map(channel => (
                                                        <button
                                                            key={channel}
                                                            onClick={() => setActiveChannel(channel)}
                                                            className={`w-4 h-4 rounded-sm flex items-center justify-center transition-colors ${
                                                                activeChannel === channel
                                                                    ? 'bg-white/20 text-white'
                                                                    : 'text-white/40 hover:text-white/80'
                                                            }`}
                                                            title={channel.charAt(0).toUpperCase() + channel.slice(1)}
                                                        >
                                                            <div
                                                                className={`w-2 h-2 rounded-full ${
                                                                    channel === 'master' ? 'bg-white' :
                                                                    channel === 'red' ? 'bg-red-500' :
                                                                    channel === 'green' ? 'bg-green-500' :
                                                                    'bg-blue-500'
                                                                }`}
                                                            />
                                                        </button>
                                                    ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-black/20 rounded-lg p-2 h-64 border border-white/5">
                                                <CurvesControl
                                                    points={selectedLayer.curves?.[activeChannel] || [{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                                                    onChange={(points) => {
                                                        console.log('[LayerEditor] Updating curves for channel:', activeChannel, points);
                                                        handleLayerUpdate(selectedLayer.id, {
                                                            curves: {
                                                                ...(selectedLayer.curves || { master: [{x:0,y:0}, {x:1,y:1}], red: [{x:0,y:0}, {x:1,y:1}], green: [{x:0,y:0}, {x:1,y:1}], blue: [{x:0,y:0}, {x:1,y:1}] }),
                                                                [activeChannel]: points
                                                            }
                                                        });
                                                    }}
                                                    channel={activeChannel}
                                                    width={280}
                                                    height={240}
                                                />
                                            </div>
                                        </Section>

                                        <Section title="Color Balance">
                                            <div className="flex bg-black/40 rounded p-1 mb-4">
                                                {(['shadows', 'midtones', 'highlights'] as const).map(range => (
                                                    <button
                                                        key={range}
                                                        onClick={() => setActiveToneRange(range)}
                                                        className={`flex-1 py-1 text-[10px] uppercase font-bold rounded transition-colors ${
                                                            activeToneRange === range 
                                                                ? 'bg-white/20 text-white' 
                                                                : 'text-white/40 hover:text-white/80'
                                                        }`}
                                                    >
                                                        {range}
                                                    </button>
                                                ))}
                                            </div>

                                            <SliderControl
                                                label="Cyan - Red"
                                                value={selectedLayer.colorBalance?.[activeToneRange][0] || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => {
                                                    const current = selectedLayer.colorBalance || {
                                                        shadows: [0,0,0], midtones: [0,0,0], highlights: [0,0,0], preserveLuminosity: true
                                                    };
                                                    const newRange = [...current[activeToneRange]] as [number, number, number];
                                                    newRange[0] = v;
                                                    handleLayerUpdate(selectedLayer.id, {
                                                        colorBalance: { ...current, [activeToneRange]: newRange }
                                                    });
                                                }}
                                            />
                                            <SliderControl
                                                label="Magenta - Green"
                                                value={selectedLayer.colorBalance?.[activeToneRange][1] || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => {
                                                    const current = selectedLayer.colorBalance || {
                                                        shadows: [0,0,0], midtones: [0,0,0], highlights: [0,0,0], preserveLuminosity: true
                                                    };
                                                    const newRange = [...current[activeToneRange]] as [number, number, number];
                                                    newRange[1] = v;
                                                    handleLayerUpdate(selectedLayer.id, {
                                                        colorBalance: { ...current, [activeToneRange]: newRange }
                                                    });
                                                }}
                                            />
                                            <SliderControl
                                                label="Yellow - Blue"
                                                value={selectedLayer.colorBalance?.[activeToneRange][2] || 0}
                                                min={-100}
                                                max={100}
                                                onChange={(v) => {
                                                    const current = selectedLayer.colorBalance || {
                                                        shadows: [0,0,0], midtones: [0,0,0], highlights: [0,0,0], preserveLuminosity: true
                                                    };
                                                    const newRange = [...current[activeToneRange]] as [number, number, number];
                                                    newRange[2] = v;
                                                    handleLayerUpdate(selectedLayer.id, {
                                                        colorBalance: { ...current, [activeToneRange]: newRange }
                                                    });
                                                }}
                                            />

                                            <div className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    id="preserveLuminosity"
                                                    checked={selectedLayer.colorBalance?.preserveLuminosity ?? true}
                                                    onChange={(e) => {
                                                        const current = selectedLayer.colorBalance || {
                                                            shadows: [0,0,0], midtones: [0,0,0], highlights: [0,0,0], preserveLuminosity: true
                                                        };
                                                        handleLayerUpdate(selectedLayer.id, {
                                                            colorBalance: { ...current, preserveLuminosity: e.target.checked }
                                                        });
                                                    }}
                                                    className="rounded bg-white/10 border-white/20"
                                                />
                                                <label htmlFor="preserveLuminosity" className="text-[10px] text-white/60 cursor-pointer select-none">Preserve Luminosity</label>
                                            </div>
                                        </Section>

                                        <Section title="Selective Color">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <select
                                                        className="bg-black/40 text-[10px] text-white/60 border border-white/10 rounded px-2 py-1 outline-none focus:border-white/30 w-32"
                                                        value={activeSelectiveRange}
                                                        onChange={(e) => setActiveSelectiveRange(e.target.value as any)}
                                                    >
                                                        <option value="reds">Reds</option>
                                                        <option value="yellows">Yellows</option>
                                                        <option value="greens">Greens</option>
                                                        <option value="cyans">Cyans</option>
                                                        <option value="blues">Blues</option>
                                                        <option value="magentas">Magentas</option>
                                                        <option value="whites">Whites</option>
                                                        <option value="neutrals">Neutrals</option>
                                                        <option value="blacks">Blacks</option>
                                                    </select>
                                                    
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            id="selectiveRelative"
                                                            checked={selectedLayer.selectiveColor?.relative ?? true}
                                                            onChange={(e) => {
                                                                const current = selectedLayer.selectiveColor || {};
                                                                handleLayerUpdate(selectedLayer.id, {
                                                                    selectiveColor: { ...current, relative: e.target.checked }
                                                                });
                                                            }}
                                                            className="rounded bg-white/10 border-white/20"
                                                        />
                                                        <label htmlFor="selectiveRelative" className="text-[10px] text-white/60 cursor-pointer select-none">Relative</label>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    {['cyan', 'magenta', 'yellow', 'black'].map((channel) => (
                                                        <SliderControl
                                                            key={channel}
                                                            label={channel.charAt(0).toUpperCase() + channel.slice(1)}
                                                            value={selectedLayer.selectiveColor?.[activeSelectiveRange as keyof typeof selectedLayer.selectiveColor]?.[channel as 'cyan'|'magenta'|'yellow'|'black'] || 0}
                                                            min={-100}
                                                            max={100}
                                                            onChange={(v) => {
                                                                const current = selectedLayer.selectiveColor || {};
                                                                const currentRange = current[activeSelectiveRange as keyof typeof current] || { cyan: 0, magenta: 0, yellow: 0, black: 0 };
                                                                
                                                                handleLayerUpdate(selectedLayer.id, {
                                                                    selectiveColor: {
                                                                        ...current,
                                                                        [activeSelectiveRange]: {
                                                                            ...currentRange,
                                                                            [channel]: v
                                                                        }
                                                                    }
                                                                });
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const current = selectedLayer.selectiveColor || {};
                                                            handleLayerUpdate(selectedLayer.id, {
                                                                selectiveColor: {
                                                                    ...current,
                                                                    [activeSelectiveRange]: { cyan: 0, magenta: 0, yellow: 0, black: 0 }
                                                                }
                                                            });
                                                        }}
                                                        className="flex-1 py-1 text-[10px] text-white/40 hover:text-white border border-white/10 hover:border-white/30 rounded transition-colors"
                                                    >
                                                        Reset {activeSelectiveRange.charAt(0).toUpperCase() + activeSelectiveRange.slice(1)}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            handleLayerUpdate(selectedLayer.id, {
                                                                selectiveColor: {
                                                                    relative: selectedLayer.selectiveColor?.relative ?? true
                                                                }
                                                            });
                                                        }}
                                                        className="px-3 py-1 text-[10px] text-red-400/60 hover:text-red-400 border border-red-400/10 hover:border-red-400/30 rounded transition-colors"
                                                        title="Reset All Ranges"
                                                    >
                                                        Reset All
                                                    </button>
                                                </div>
                                            </div>
                                        </Section>

                                        {/* Gradient Map */}
                                        <Section title="Gradient Map" defaultOpen={false}>
                                            {/* Auto-migration for existing layers */}
                                            {/* Auto-migration for existing layers - Moved to top level */}

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-white/60">Enable</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLayer.gradientMap?.enabled ?? false}
                                                        onChange={(e) => {
                                                                const isEnabling = e.target.checked;
                                                                const defaultStops = [{ id: 'stop-0', offset: 0, color: '#000000' }, { id: 'stop-1', offset: 1, color: '#000000' }];
                                                                let stops = selectedLayer.gradientMap?.stops || defaultStops;
                                                                
                                                                // If we have the old B&W default, force it to the new double black stop default
                                                                // Helper to normalize color for comparison
                                                                const normalizeColor = (c: string) => c.toLowerCase().replace(/\s/g, '');
                                                                const isBlack = (c: string) => ['#000000', '#000', 'black', 'rgb(0,0,0)'].includes(normalizeColor(c));
                                                                const isWhite = (c: string) => ['#ffffff', '#fff', 'white', 'rgb(255,255,255)'].includes(normalizeColor(c));

                                                                // Aggressive check: If 2 stops, and one is black and one is white (regardless of offset), reset it.
                                                                // This catches cases where the user might have moved the white stop to the middle.
                                                                const isOldDefault = stops.length === 2 && 
                                                                    stops.some(s => isBlack(s.color)) && 
                                                                    stops.some(s => isWhite(s.color));

                                                                // Also check for single black stop (previous fix) and convert to double black
                                                                const isSingleBlack = stops.length === 1 && isBlack(stops[0].color);

                                                                if (isOldDefault || isSingleBlack) {
                                                                    stops = defaultStops;
                                                                }
                                                                
                                                                handleLayerUpdate(selectedLayer.id, {
                                                                    gradientMap: {
                                                                        enabled: isEnabling,
                                                                        stops: stops,
                                                                        opacity: selectedLayer.gradientMap?.opacity ?? 1
                                                                    }
                                                                });

                                                                if (isEnabling && stops.length > 0) {
                                                                    setActiveGradientStopId(stops[0].id);
                                                                }
                                                        }}
                                                        className="rounded bg-white/10 border-white/10 text-purple-500 focus:ring-purple-500/50"
                                                    />
                                                </div>

                                                {selectedLayer.gradientMap?.enabled && (
                                                    <>
                                                        {/* Visual Editor */}
                                                        <div className="space-y-4 mb-4">
                                                            {/* Gradient Bar */}
                                                            <div className="space-y-1">
                                                                <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Editor</div>
                                                                <div 
                                                                    className="relative pt-1 pb-6 px-2 -mx-2 cursor-crosshair group select-none overflow-visible"
                                                                    onClick={(e) => {
                                                                        // Only add if clicking the bar or the empty track area
                                                                        if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('gradient-bar-bg')) return;
                                                                        
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        const x = e.clientX - rect.left;
                                                                        const offset = Math.max(0, Math.min(1, x / rect.width));
                                                                        
                                                                        // Check if we're clicking near existing stops (within 5%)
                                                                        const nearbyStops = selectedLayer.gradientMap!.stops
                                                                            .filter(s => Math.abs(s.offset - offset) < 0.05)
                                                                            .sort((a, b) => Math.abs(a.offset - offset) - Math.abs(b.offset - offset));
                                                                        
                                                                        if (nearbyStops.length > 0) {
                                                                            // If we have multiple, cycle through them if the current one is already active
                                                                            const currentIndex = nearbyStops.findIndex(s => s.id === activeGradientStopId);
                                                                            const nextStop = nearbyStops[(currentIndex + 1) % nearbyStops.length];
                                                                            setActiveGradientStopId(nextStop.id);
                                                                            return;
                                                                        }

                                                                        // Sample color at this offset
                                                                        const color = getColorAtOffset(selectedLayer.gradientMap!.stops, offset);
                                                                        const newStop = { id: `stop-${Date.now()}`, offset, color };
                                                                        const newStops = [...selectedLayer.gradientMap!.stops, newStop]
                                                                            .sort((a, b) => a.offset - b.offset);
                                                                        
                                                                        // Set flag to open color picker automatically
                                                                        shouldOpenColorPickerRef.current = true;
                                                                        
                                                                        handleLayerUpdate(selectedLayer.id, {
                                                                            gradientMap: {
                                                                                ...selectedLayer.gradientMap!,
                                                                                stops: newStops
                                                                            }
                                                                        });
                                                                        setActiveGradientStopId(newStop.id);
                                                                    }}
                                                                >
                                                                    {/* Gradient Bar */}
                                                                    <div 
                                                                        ref={gradientBarRef}
                                                                        className="gradient-bar-bg h-6 rounded border border-white/20 relative pointer-events-none"
                                                                        style={{
                                                                            background: selectedLayer.gradientMap.stops.length === 1 
                                                                                ? selectedLayer.gradientMap.stops[0].color 
                                                                                : `linear-gradient(to right, ${[...selectedLayer.gradientMap.stops]
                                                                                    .sort((a, b) => a.offset - b.offset)
                                                                                    .map(s => `${s.color} ${s.offset * 100}%`)
                                                                                    .join(', ')})`
                                                                        }}
                                                                    />
                                                                    
                                                                    {/* Stop Markers */}
                                                                    {selectedLayer.gradientMap.stops.map((stop, index) => {
                                                                        // Add a tiny visual offset if stops are perfectly overlapping
                                                                        const sameOffsetCount = selectedLayer.gradientMap!.stops.filter(s => s.offset === stop.offset).length;
                                                                        const sameOffsetIndex = selectedLayer.gradientMap!.stops.filter(s => s.offset === stop.offset).findIndex(s => s.id === stop.id);
                                                                        const visualOffset = (sameOffsetCount > 1 && stop.id !== draggingStopId) ? (sameOffsetIndex - (sameOffsetCount - 1) / 2) * 4 : 0;

                                                                        return (
                                                                            <div
                                                                                key={stop.id}
                                                                                className={`absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center group/stop ${
                                                                                    stop.id === activeGradientStopId ? 'z-30' : 'z-10'
                                                                                }`}
                                                                                style={{ 
                                                                                    left: `${stop.offset * 100}%`,
                                                                                    transform: `translateX(${visualOffset}px)`
                                                                                }}
                                                                            onMouseDown={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveGradientStopId(stop.id);
                                                                                setDraggingStopId(stop.id);
                                                                                
                                                                                if (gradientBarRef.current) {
                                                                                    const rect = gradientBarRef.current.getBoundingClientRect();
                                                                                    const mouseX = e.clientX - rect.left;
                                                                                    const stopX = stop.offset * rect.width;
                                                                                    grabOffsetRef.current = mouseX - stopX;
                                                                                }
                                                                            }}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (stop.id === activeGradientStopId) {
                                                                                    colorInputRef.current?.click();
                                                                                } else {
                                                                                    shouldOpenColorPickerRef.current = true;
                                                                                    setActiveGradientStopId(stop.id);
                                                                                }
                                                                            }}
                                                                        >
                                                                            {/* Arrow/Triangle */}
                                                                            <div 
                                                                                className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] transition-colors cursor-pointer mt-6 ${
                                                                                    stop.id === activeGradientStopId ? 'border-b-purple-500' : 'border-b-white/50 group-hover/stop:border-b-white/80'
                                                                                }`}
                                                                            />
                                                                            {/* Color Box */}
                                                                            <button
                                                                                className={`w-3 h-3 rounded-sm border shadow-sm transition-all focus:outline-none cursor-grab active:cursor-grabbing ${
                                                                                    stop.id === activeGradientStopId ? 'border-white scale-110 ring-1 ring-purple-500' : 'border-white/30'
                                                                                }`}
                                                                                style={{ backgroundColor: stop.color }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                                </div>
                                                                <div className="flex justify-end pt-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            const newStops = selectedLayer.gradientMap!.stops.map(s => ({
                                                                                ...s,
                                                                                offset: 1 - s.offset
                                                                            })).sort((a, b) => a.offset - b.offset);
                                                                            handleLayerUpdate(selectedLayer.id, {
                                                                                gradientMap: { ...selectedLayer.gradientMap!, stops: newStops }
                                                                            });
                                                                        }}
                                                                        className="text-[10px] text-white/40 hover:text-white flex items-center gap-1 transition-colors"
                                                                    >
                                                                        <RotateCcw size={10} />
                                                                        Reverse
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Selected Stop Controls */}
                                                            {selectedLayer.gradientMap.stops.find(s => s.id === activeGradientStopId) && (
                                                                <div className="bg-white/5 p-2 rounded border border-white/10 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] text-white/60">Selected Stop</span>
                                                                        {selectedLayer.gradientMap.stops.length > 1 && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    const newStops = selectedLayer.gradientMap!.stops.filter(s => s.id !== activeGradientStopId);
                                                                                    handleLayerUpdate(selectedLayer.id, {
                                                                                        gradientMap: { ...selectedLayer.gradientMap!, stops: newStops }
                                                                                    });
                                                                                    setActiveGradientStopId(newStops[0].id);
                                                                                }}
                                                                                className="text-red-400 hover:text-red-300 p-1 hover:bg-red-400/10 rounded"
                                                                                title="Delete Stop"
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="flex gap-2">
                                                                        <div className="flex-1 space-y-1">
                                                                            <label className="text-[10px] text-white/40">Color</label>
                                                                            <div className="flex items-center gap-2 h-6 bg-white/10 rounded px-1 border border-white/10 relative">
                                                                                <input
                                                                                    ref={colorInputRef}
                                                                                    type="color"
                                                                                    value={selectedLayer.gradientMap.stops.find(s => s.id === activeGradientStopId).color}
                                                                                    onChange={(e) => {
                                                                                        
                                                                                        const newStops = selectedLayer.gradientMap.stops.map(s => s.id === activeGradientStopId ? { ...s, color: e.target.value } : s);
                                                                                        handleLayerUpdate(selectedLayer.id, {
                                                                                            gradientMap: { ...selectedLayer.gradientMap!, stops: newStops }
                                                                                        });
                                                                                    }}
                                                                                    className="w-full h-full opacity-0 absolute inset-0 cursor-pointer"
                                                                                />
                                                                                <div 
                                                                                    className="w-4 h-4 rounded-full border border-white/20"
                                                                                    style={{ backgroundColor: selectedLayer.gradientMap.stops.find(s => s.id === activeGradientStopId).color }}
                                                                                />
                                                                                <span className="text-[10px] text-white/80 font-mono">
                                                                                    {selectedLayer.gradientMap.stops.find(s => s.id === activeGradientStopId).color}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 space-y-1">
                                                                            <label className="text-[10px] text-white/40">Location %</label>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max="100"
                                                                                value={Math.round(selectedLayer.gradientMap.stops.find(s => s.id === activeGradientStopId).offset * 100)}
                                                                                onChange={(e) => {
                                                                                    const val = Math.max(0, Math.min(100, parseFloat(e.target.value))) / 100;
                                                                                    
                                                                                    const newStops = selectedLayer.gradientMap.stops.map(s => s.id === activeGradientStopId ? { ...s, offset: val } : s);
                                                                                    handleLayerUpdate(selectedLayer.id, {
                                                                                        gradientMap: { ...selectedLayer.gradientMap!, stops: newStops }
                                                                                    });
                                                                                }}
                                                                                className="w-full h-6 bg-white/10 rounded px-2 text-[10px] text-white outline-none focus:ring-1 focus:ring-purple-500 border border-white/10"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Presets</div>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {[
                                                                    { name: 'Black', stops: [{ id: 'bw-0', offset: 0, color: '#000000' }, { id: 'bw-1', offset: 1, color: '#000000' }] },
                                                                    { name: 'Sepia', stops: [{ id: 'sep-0', offset: 0, color: '#2b1b00' }, { id: 'sep-1', offset: 0.5, color: '#9c7c38' }, { id: 'sep-2', offset: 1, color: '#ffebcd' }] },
                                                                    { name: 'Sunset', stops: [{ id: 'sun-0', offset: 0, color: '#2d1b4e' }, { id: 'sun-1', offset: 0.5, color: '#b33951' }, { id: 'sun-2', offset: 1, color: '#ffcc00' }] },
                                                                    { name: 'Rainbow', stops: [{ id: 'rbw-0', offset: 0, color: '#ff0000' }, { id: 'rbw-1', offset: 0.2, color: '#ffff00' }, { id: 'rbw-2', offset: 0.4, color: '#00ff00' }, { id: 'rbw-3', offset: 0.6, color: '#00ffff' }, { id: 'rbw-4', offset: 0.8, color: '#0000ff' }, { id: 'rbw-5', offset: 1, color: '#ff00ff' }] },
                                                                    { name: 'Ocean', stops: [{ id: 'ocn-0', offset: 0, color: '#001a33' }, { id: 'ocn-1', offset: 0.5, color: '#0066cc' }, { id: 'ocn-2', offset: 1, color: '#e6f7ff' }] },
                                                                    { name: 'Forest', stops: [{ id: 'for-0', offset: 0, color: '#0a1a05' }, { id: 'for-1', offset: 0.5, color: '#2d5a27' }, { id: 'for-2', offset: 1, color: '#d5e8d4' }] },
                                                                    { name: 'Chrome', stops: [{ id: 'chr-0', offset: 0, color: '#000000' }, { id: 'chr-1', offset: 0.5, color: '#888888' }, { id: 'chr-2', offset: 1, color: '#ffffff' }] },
                                                                    { name: 'Metallic', stops: [{ id: 'met-0', offset: 0, color: '#1a1a1a' }, { id: 'met-1', offset: 0.4, color: '#666666' }, { id: 'met-2', offset: 0.6, color: '#999999' }, { id: 'met-3', offset: 1, color: '#eeeeee' }] },
                                                                    { name: 'Gold', stops: [{ id: 'gld-0', offset: 0, color: '#3e2723' }, { id: 'gld-1', offset: 0.5, color: '#ffd700' }, { id: 'gld-2', offset: 1, color: '#fff8e1' }] },
                                                                ].map(preset => (
                                                                    <button
                                                                        key={preset.name}
                                                                        onClick={() => {
                                                                            handleLayerUpdate(selectedLayer.id, {
                                                                                gradientMap: {
                                                                                    ...selectedLayer.gradientMap!,
                                                                                    stops: preset.stops
                                                                                }
                                                                            });
                                                                        }}
                                                                        className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors text-center"
                                                                    >
                                                                        {preset.name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    handleLayerUpdate(selectedLayer.id, {
                                                                        gradientMap: {
                                                                            ...selectedLayer.gradientMap!,
                                                                            stops: [
                                                                                { id: 'reset-0', offset: 0, color: '#000000' },
                                                                                { id: 'reset-1', offset: 1, color: '#000000' }
                                                                            ]
                                                                        }
                                                                    });
                                                                }}
                                                                className="w-full py-1 text-[10px] text-white/40 hover:text-white border border-white/10 hover:border-white/30 rounded transition-colors mt-2"
                                                            >
                                                                Reset Gradient
                                                            </button>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Opacity</div>
                                                            <SliderControl
                                                                label=""
                                                                value={(selectedLayer.gradientMap.opacity ?? 1) * 100}
                                                                min={0}
                                                                max={100}
                                                                onChange={(val) => {
                                                                    handleLayerUpdate(selectedLayer.id, {
                                                                        gradientMap: {
                                                                            ...selectedLayer.gradientMap!,
                                                                            opacity: val / 100
                                                                        }
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </Section>

                                        <Section title="Effects">
                                            <SliderControl
                                                label="Blur"
                                                value={(selectedLayer.blur || 0) * 100}
                                                min={0}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { blur: v / 100 })}
                                                formatValue={(v) => `${Math.round(v)}%`}
                                            />
                                            <SliderControl
                                                label="Noise"
                                                value={selectedLayer.noise || 0}
                                                min={0}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { noise: v })}
                                            />
                                            <SliderControl
                                                label="Sharpen"
                                                value={(selectedLayer.sharpen || 0) * 100}
                                                min={0}
                                                max={100}
                                                onChange={(v) => handleLayerUpdate(selectedLayer.id, { sharpen: v / 100 })}
                                                formatValue={(v) => `${Math.round(v)}%`}
                                            />
                                        </Section>
                                    </div>
                                )}

                                {/* OTHER PROPERTIES */}
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-white/40">Blend Mode</label>
                                    <select value={selectedLayer.blendMode} onChange={(e) => handleLayerUpdate(selectedLayer.id, { blendMode: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-white outline-none">
                                        <option value="normal">Normal</option>
                                        <option value="multiply">Multiply</option>
                                        <option value="screen">Screen</option>
                                        <option value="overlay">Overlay</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-white/40">Parent Folder</label>
                                    <select value={selectedLayer.parentId || ''} onChange={(e) => handleLayerUpdate(selectedLayer.id, { parentId: e.target.value || null })} className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-white outline-none">
                                        <option value="">None (Root)</option>
                                        {layers.filter(l => l.type === 'group' && l.id !== selectedLayer.id).map(group => (
                                            <option key={group.id} value={group.id}>{group.name || group.sourceId}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* STYLE LIBRARY - Verified */}
                                {activeTool === 'style_transfer' && (
                                    <>
                                        <div 
                                            className="flex items-center justify-between mb-1 cursor-pointer"
                                            onClick={() => setIsStyleLibraryExpanded(!isStyleLibraryExpanded)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Palette className="w-4 h-4 text-white" />
                                                <span className="text-xs font-bold text-white">Style Library</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); styleInputRef.current?.click(); }}
                                                    className="text-[10px] px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-white transition-colors flex items-center gap-1"
                                                >
                                                    <Upload className="w-3 h-3" /> Add New
                                                </button>
                                                <button className="text-white/40 hover:text-white">
                                                    {isStyleLibraryExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <input 
                                            type="file" 
                                            ref={styleInputRef}
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={handleUploadStyle}
                                        />

                                        {isStyleLibraryExpanded && (
                                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                {isAnalyzingStyle && (
                                                    <div className="text-center py-4">
                                                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-fashion-accent mb-2" />
                                                        <p className="text-[10px] text-white/50">Analyzing style...</p>
                                                    </div>
                                                )}

                                                {!isAnalyzingStyle && savedStyles.length === 0 && (
                                                    <div className="text-center py-6 border-2 border-dashed border-white/10 rounded-lg">
                                                        <Palette className="w-6 h-6 mx-auto text-white/20 mb-2" />
                                                        <p className="text-[10px] text-white/40">No styles saved yet.</p>
                                                        <p className="text-[10px] text-white/30">Upload an image to extract its style.</p>
                                                    </div>
                                                )}

                                                {savedStyles.length > 0 && (
                                                    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                                        {savedStyles.map(style => (
                                                            <div 
                                                                key={style.id}
                                                                onClick={() => setSelectedStyleId(style.id)}
                                                                className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedStyleId === style.id ? 'border-fashion-accent' : 'border-transparent hover:border-white/30'}`}
                                                            >
                                                                <img src={style.thumbnail} alt={style.name} className="w-full h-20 object-cover" />
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-2">
                                                                    <p className="text-[10px] font-medium text-white truncate">{style.name}</p>
                                                                </div>
                                                                <button 
                                                                    onClick={(e) => handleDeleteStyle(style.id, e)}
                                                                    className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-500/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {selectedStyleId && (
                                                    <div className="space-y-2">
                                                        <div className="p-2 bg-white/5 rounded border border-white/10">
                                                            <div className="flex items-start gap-2">
                                                                <Info className="w-3 h-3 text-fashion-accent shrink-0 mt-0.5" />
                                                                <p className="text-[10px] text-white/60 line-clamp-2">
                                                                    {savedStyles.find(s => s.id === selectedStyleId)?.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={handleApplySavedStyle}
                                                            disabled={isRefining}
                                                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                                        >
                                                            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                                                            Apply Selected Style
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* DRAG TOOL PANEL */}
                                {activeTool === 'transformation' && (
                                    <div className="space-y-4">
                                        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                                            <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                                                <MousePointer2 className="w-4 h-4 text-fashion-accent" />
                                                Drag Instructions
                                            </h4>
                                            <ul className="text-[10px] text-white/60 space-y-1 list-disc list-inside">
                                                <li>Click once to place a <strong>Handle Point</strong> (Red).</li>
                                                <li>Click again to place a <strong>Target Point</strong> (Blue).</li>
                                                <li>The image will warp to move Red points to Blue points.</li>
                                            </ul>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-white/60">Points Added:</span>
                                            <span className="text-xs font-bold text-white">{posePoints.length} pairs</span>
                                        </div>

                                        <button
                                            onClick={handleAutoDetect}
                                            disabled={isAnalyzingStyle || isTransformingAI || isTransformingReve}
                                            className="w-full py-2 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mb-4"
                                        >
                                            {isAnalyzingStyle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-yellow-400" />}
                                            Auto-Detect Points
                                        </button>

                                        <button
                                            onClick={handleApplyReveTransformation}
                                            disabled={isAnalyzingStyle || isTransformingAI || isTransformingReve || posePoints.length === 0}
                                            className="w-full py-3 rounded bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                                        >
                                            {isTransformingReve ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                            {isTransformingReve ? 'Applying Transformation...' : 'Apply Transformation'}
                                        </button>



                                        {/* Points List */}
                                        {posePoints.length > 0 && (
                                            <div className="space-y-2 mb-4">
                                                <h5 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Detected Points</h5>
                                                <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                                    {posePoints.map((point, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 group">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex gap-1">
                                                                    <div className="w-2 h-2 rounded-full bg-[#00cc88]" title="Original" />
                                                                    <div className="w-2 h-2 rounded-full bg-blue-600" title="Target" />
                                                                </div>
                                                                <span className="text-xs text-white">{point.label || `Point ${idx + 1}`}</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => {
                                                                    const newPoints = [...posePoints];
                                                                    newPoints.splice(idx, 1);
                                                                    setPosePoints(newPoints);
                                                                }}
                                                                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className={`p-3 rounded-lg border transition-all ${isGenerativeRefine ? 'bg-fashion-accent/10 border-fashion-accent/30' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className={`w-4 h-4 ${isGenerativeRefine ? 'text-fashion-accent' : 'text-white/40'}`} />
                                                    <span className="text-xs font-bold text-white">Generative Refine</span>
                                                    {isGenerativeRefine && (
                                                        <span className="text-[8px] px-1.5 py-0.5 bg-fashion-accent text-white rounded-full uppercase font-black">Recommended</span>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={() => setIsGenerativeRefine(!isGenerativeRefine)}
                                                    className={`w-8 h-4 rounded-full transition-colors relative ${isGenerativeRefine ? 'bg-fashion-accent' : 'bg-white/20'}`}
                                                >
                                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isGenerativeRefine ? 'left-4.5' : 'left-0.5'}`} />
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-white/50 leading-tight">
                                                {isGenerativeRefine 
                                                    ? "Uses AI to fix warping artifacts and maintain realism." 
                                                    : "Fast mode. May result in 'smearing' or distortions."}
                                            </p>
                                            {!isGenerativeRefine && (
                                                <div className="mt-2 flex items-center gap-1.5 text-yellow-500/80">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span className="text-[9px] font-bold uppercase">Low Quality Mode</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setPosePoints([])}
                                                disabled={posePoints.length === 0}
                                                className="py-2 rounded bg-white/5 text-white/60 hover:text-white hover:bg-white/10 text-xs font-bold transition-colors disabled:opacity-50"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setPosePoints(prev => prev.slice(0, -1))}
                                                disabled={posePoints.length === 0}
                                                className="py-2 rounded bg-white/5 text-white/60 hover:text-white hover:bg-white/10 text-xs font-bold transition-colors disabled:opacity-50"
                                            >
                                                Undo
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-white/60">Points Added:</span>
                                            <span className="text-xs font-bold text-white">{posePoints.length} pairs</span>
                                        </div>

                                        {/* Points List */}
                                        {posePoints.length > 0 && (
                                            <div className="space-y-2 mb-4">
                                                <h5 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Detected Points</h5>
                                                <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                                    {posePoints.map((point, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 group">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                                                <span className="text-[10px] text-white/80">{point.label || `Point Pair ${idx + 1}`}</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => {
                                                                    const newPoints = [...posePoints];
                                                                    newPoints.splice(idx, 1);
                                                                    setPosePoints(newPoints);
                                                                }}
                                                                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="w-full h-[1px] bg-white/5 my-2" />

                                <div className="space-y-2">
                                    <button 
                                        onClick={handleAIRefine} 
                                        disabled={isRefining || isProcessing} 
                                        className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-lg">✨</span>}
                                        {isRefining ? 'Gemini is refining...' : 'AI Refine'}
                                    </button>
                                    <button onClick={handleRemoveBackground} disabled={isProcessing || isRefining} className="w-full py-2 rounded bg-white/5 text-white border border-white/10 hover:bg-white/10 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                        {isProcessing ? 'Removing Background...' : 'Remove Background'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-white/20 text-xs italic p-8 text-center h-[500px]">Select a layer to edit properties</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};
