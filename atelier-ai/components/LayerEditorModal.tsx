import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Layers, Eye, EyeOff, Move, Trash2, Check, GripVertical, Hand, ZoomIn, Brush, Eraser, Crop, MousePointer2, ChevronRight, ChevronLeft, ChevronDown, Wand2, Lock, Unlock, Folder, FolderOpen, FolderPlus, Edit2, Plus, Download, Copy, Maximize, Palette, Upload, Info, PanelLeft, PanelRight } from 'lucide-react';
import { FabricCanvas, FabricCanvasRef } from './FabricCanvas';
import * as fabric from 'fabric';
import { Layer, ActiveTool } from '../types';
import { removeImageBackground } from '../services/segmentation';
import { refineImage, realizeLayers, enhanceSketch, analyzeImageStyle, applyImageStyle } from '../services/gemini';

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
}

const SortableLayerItem = ({ layer, isSelected, onSelect, onUpdate, onDelete }: SortableLayerItemProps) => {
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
        paddingLeft: layer.parentId ? '24px' : '8px',
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
    const [isProcessing, setIsProcessing] = useState(false);
    const [isRefining, setIsRefining] = useState(false);

    const [showLayersPanel, setShowLayersPanel] = useState(true);
    const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);
    const [isStyleLibraryExpanded, setIsStyleLibraryExpanded] = useState(true);

    const [canvasDimensions, setCanvasDimensions] = useState(canvasSize);
    const [viewScale, setViewScale] = useState(1);
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

    const handleLayerUpdate = (id: string, updates: Partial<Layer>) => {
        setLayers(prev => {
            const next = prev.map(l => l.id === id ? { ...l, ...updates } : l);
            // Only push to history if it's not a history action
            if (!isHistoryActionRef.current) {
                pushHistory(next);
            }
            return next;
        });
    };

    const handleSelectionChange = (id: string | null) => {
        setSelectedLayerId(id);
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
        thumbnail: string; // Base64 data URL
    }

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

    const modalContent = (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onWheel={(e) => e.stopPropagation()}>
            <div className="w-full h-full max-w-[1400px] max-h-[900px] bg-[#111] border border-white/10 rounded-2xl flex overflow-hidden shadow-2xl">
                {/* LEFT TOOLBAR */}
                <div className="w-16 bg-[#161616] border-r border-white/5 flex flex-col items-center py-4 gap-2 z-20">
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

                    <div className="w-8 h-[1px] bg-white/10 my-2" />
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

                    <div className="w-8 h-[1px] bg-white/10 my-2" />
                    <button
                        onClick={() => setActiveTool('style_transfer')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'style_transfer' ? 'bg-fashion-accent text-white border border-white/20' : 'text-white/40 hover:text-white hover:bg-white/5'} relative group`}
                        title="AI Style Transfer"
                    >
                        <Palette className="w-5 h-5" />
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
                                }).map((layer) => (
                                    <SortableLayerItem
                                        key={layer.id}
                                        layer={layer}
                                        isSelected={selectedLayerId === layer.id}
                                        onSelect={setSelectedLayerId}
                                        onUpdate={handleLayerUpdate}
                                        onDelete={handleDeleteLayer}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
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
                    <div className="min-w-[320px] p-4 space-y-6 overflow-y-auto">
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
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] uppercase font-bold text-white/40">
                                                    {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} Size
                                                </label>
                                                <span className="text-[10px] text-white/60 font-mono">{brushSize}px</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="1" 
                                                max="200" 
                                                value={brushSize} 
                                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                                className="w-full accent-fashion-accent" 
                                            />
                                        </div>
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
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-white/40">Opacity</label>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.01" 
                                        value={selectedLayer.opacity} 
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            setLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, opacity: val } : l));
                                        }}
                                        onMouseUp={() => pushHistory(layersRef.current)}
                                        className="w-full accent-white" 
                                    />
                                    <div className="flex justify-between text-[10px] text-white/40"><span>0%</span><span>{Math.round(selectedLayer.opacity * 100)}%</span></div>
                                </div>
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
                                {selectedLayer.type !== 'group' && (
                                    <>
                                    {/* STYLE TRANSFER SECTION - Visible only when tool is active */}
                                    {activeTool === 'style_transfer' && (
                                    <div className="space-y-4 bg-fashion-accent/10 p-3 rounded-xl border border-fashion-accent/50 transition-all duration-300">
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
                                )}
                                <button onClick={() => handleDeleteLayer(selectedLayer.id)} disabled={isRefining} className="w-full py-2 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                    <Trash2 className="w-4 h-4" /> Delete {selectedLayer.type === 'group' ? 'Folder' : 'Layer'}
                                </button>
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
