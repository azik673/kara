import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { Layer, ActiveTool } from '../types';

interface FabricCanvasProps {
    width: number;
    height: number;
    layers: Layer[];
    onLayerUpdate: (id: string, updates: Partial<Layer>) => void;
    onSelectionChange: (selectedId: string | null) => void;
    selectedLayerId: string | null;
    activeTool: ActiveTool;
    onCrop?: (rect: { x: number, y: number, width: number, height: number }) => void;
    brushColor?: string;
    brushSize?: number;
    maskPosition?: { x: number, y: number, width: number, height: number } | null;
    viewScale?: number;

}

export interface FabricCanvasRef {
    getDataURL: (options?: { 
        multiplier?: number; 
        backgroundColor?: string;
        fullWorld?: boolean;
        width?: number;
        height?: number;
        left?: number;
        top?: number;
    }) => string;

    getSelectionRect: () => { left: number, top: number, width: number, height: number } | null;
    getLocalSelectionRect: (layerId: string) => { x: number, y: number, width: number, height: number } | null;
}

const CHECKERBOARD_BG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uPzJ96As9f50U2mZ5AE7Ic0DBy0mIDApqnG4UM3CIBCHoIEGhRE9YnKzSAAAAAASUVORK5CYII=';

export const FabricCanvas = React.forwardRef((props: FabricCanvasProps, ref: React.Ref<FabricCanvasRef>) => {
    const {
        width,
        height,
        layers,
        onLayerUpdate,
        onSelectionChange,
        selectedLayerId,
        activeTool,
        brushColor = '#00cc88',
        brushSize = 10,
        viewScale = 1,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isUpdatingRef = useRef(false);
    const pendingLayersRef = useRef<Layer[] | null>(null);

    const activeToolRef = useRef(activeTool);
    const onLayerUpdateRef = useRef(onLayerUpdate);
    const selectedLayerIdRef = useRef(selectedLayerId);
    const layersRef = useRef(layers);
    const cropRectRef = useRef<fabric.Rect | null>(null);
    const cropStartRef = useRef<{ x: number, y: number } | null>(null);

    const isMouseDownRef = useRef(false);
    const isAltPressedRef = useRef(false);
    const onCropRef = useRef(props.onCrop);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const lastPointerRef = useRef<{ x: number, y: number } | null>(null);
    const brushSizeRef = useRef(brushSize);

    useEffect(() => {
        activeToolRef.current = activeTool;
        onLayerUpdateRef.current = onLayerUpdate;
        selectedLayerIdRef.current = selectedLayerId;
        layersRef.current = layers;
        onSelectionChangeRef.current = onSelectionChange;
        onCropRef.current = props.onCrop;
        brushSizeRef.current = brushSize;

        // Update cursor immediately when tool or size changes
        if (lastPointerRef.current) {
            updateCursor(lastPointerRef.current);
        }
    }, [activeTool, onLayerUpdate, selectedLayerId, layers, props.onCrop, brushSize, onSelectionChange, viewScale]);




    const getAdjustedPointer = (e: any) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        
        const ev = e.e || e;
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        
        // This ratio accounts for CSS transforms (like scale)
        const scaleX = canvas.upperCanvasEl.offsetWidth / rect.width;
        const scaleY = canvas.upperCanvasEl.offsetHeight / rect.height;
        
        // Local coordinates in CSS pixels
        const localX = (ev.clientX - rect.left) * scaleX;
        const localY = (ev.clientY - rect.top) * scaleY;
        
        // Transform to canvas space (accounting for Fabric zoom/pan)
        const vpt = canvas.viewportTransform;
        return {
            x: (localX - vpt[4]) / vpt[0],
            y: (localY - vpt[5]) / vpt[0]
        };
    };

    const updateCursor = (pointer: { x: number, y: number }) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const tool = activeToolRef.current;
        if (tool !== 'brush' && tool !== 'eraser') return;

        let brushCursor = canvas.getObjects().find(obj => (obj as any).id === 'drawing-cursor') as fabric.Circle;


        const zoom = canvas.getZoom();
        const cursorScale = 1 / (zoom * viewScale);

        // Handle Brush Circle (for Brush and Eraser)
        const showBrushCircle = tool === 'brush' || tool === 'eraser';
        
        if (showBrushCircle) {
            // Always show native crosshair for precision, alongside the brush circle
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';



            if (!brushCursor) {
                brushCursor = new fabric.Circle({
                    radius: (brushSizeRef.current || 20) / 2,
                    fill: 'transparent',
                    stroke: tool === 'eraser' ? '#ff4444' : '#ffffff',
                    strokeWidth: 1.5,
                    strokeUniform: true,
                    shadow: new fabric.Shadow({ color: 'black', blur: 2, offsetX: 1, offsetY: 1 }),
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false,
                    // @ts-ignore
                    id: 'drawing-cursor'
                });
                canvas.add(brushCursor);
            }
            brushCursor.set({ 
                radius: (brushSizeRef.current || 20) / 2,
                left: pointer.x, 
                top: pointer.y,
                stroke: tool === 'eraser' ? '#ff4444' : '#ffffff'
            });
            canvas.bringObjectToFront(brushCursor);

        } else {
            canvas.defaultCursor = 'default';
            canvas.hoverCursor = 'default';
            if (brushCursor) canvas.remove(brushCursor);

        }



        canvas.requestRenderAll();
    };

    React.useImperativeHandle(ref, () => ({
        getDataURL: (options: any = {}) => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return '';
            
            const { fullWorld, ...fabricOptions } = options;
            const originalVpt = [...(canvas.viewportTransform || [1, 0, 0, 1, 0, 0])];
            
            try {
                if (fullWorld) {
                    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
                }
                
                canvas.renderAll();
                
                const dataUrl = canvas.toDataURL(fabricOptions);
                
                if (fullWorld) {
                    canvas.setViewportTransform(originalVpt as any);
                }
                
                return dataUrl;
            } finally {
                canvas.renderAll();
            }
        },

        getSelectionRect: () => {
            if (cropRectRef.current) {
                const rect = cropRectRef.current;
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width * (rect.scaleX || 1),
                    height: rect.height * (rect.scaleY || 1)
                };
            }
            return null;
        },

        getLocalSelectionRect: (layerId: string) => {
            const canvas = fabricCanvasRef.current;
            if (!canvas || !cropRectRef.current) return null;

            // @ts-ignore
            const target = canvas.getObjects().find(obj => obj.id === layerId);
            if (!target) return null;

            const rect = cropRectRef.current;
            const globalRect = {
                left: rect.left!,
                top: rect.top!,
                width: rect.width! * rect.scaleX!,
                height: rect.height! * rect.scaleY!
            };

            // Transform global rect points to local layer space
            const matrix = target.calcTransformMatrix();
            const invertedMatrix = fabric.util.invertTransform(matrix);

            const tl = fabric.util.transformPoint(new fabric.Point(globalRect.left, globalRect.top), invertedMatrix);
            const br = fabric.util.transformPoint(new fabric.Point(globalRect.left + globalRect.width, globalRect.top + globalRect.height), invertedMatrix);

            // Calculate local bounds (handling rotation/flipping implicitly by min/max)
            // Note: This assumes the selection is axis-aligned with the canvas, and we want the corresponding area on the rotated image.
            // If the image is rotated, the selection rect in local space might be rotated. 
            // However, for simple cropping/masking, we usually want the bounding box in local space.
            
            // For now, let's assume we want the local coordinates.
            // Since the crop tool is axis-aligned to the CANVAS, and the image might be rotated,
            // the "local selection" is technically a polygon. 
            // BUT, for "Selection Fill", we usually want to mask the area under the selection.
            
            // Let's return the top-left and dimensions in local space.
            // If rotation is involved, this is an approximation or requires a rotated mask.
            // For this implementation, we'll assume the user wants the area defined by these points.
            
            const x = Math.min(tl.x, br.x);
            const y = Math.min(tl.y, br.y);
            const width = Math.abs(br.x - tl.x);
            const height = Math.abs(br.y - tl.y);
            
            // Shift to be relative to image top-left (0,0) instead of center
            // Fabric images are centered by default (originX/Y: center), so (0,0) is the center.
            // We need coordinates relative to the top-left corner of the image for drawing on a canvas.
            // The local point (0,0) is the center of the image.
            // Image width/height are the full dimensions.
            // So top-left is (-width/2, -height/2).
            
            const imageWidth = target.width || 0;
            const imageHeight = target.height || 0;
            
            const localX = x + (imageWidth / 2);
            const localY = y + (imageHeight / 2);

            return {
                x: localX,
                y: localY,
                width: width,
                height: height
            };
        }
    }));

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = new fabric.Canvas(canvasRef.current, {
            width,
            height,
            backgroundColor: 'transparent',
            preserveObjectStacking: true,
            // @ts-ignore
            alpha: true
        });
        fabricCanvasRef.current = canvas;

        canvas.on('path:created', (e: any) => {
            const path = e.path;
            const currentTool = activeToolRef.current;

            if (currentTool === 'eraser' || currentTool === 'brush') {
                // Always remove the path from the canvas - it will be re-added via state
                canvas.remove(path);

                let activeLayerId = selectedLayerIdRef.current;
                if (!activeLayerId) {
                    const firstImageLayer = layersRef.current.find(l => l.type !== 'group');
                    if (firstImageLayer) {
                        activeLayerId = firstImageLayer.id;
                        selectedLayerIdRef.current = activeLayerId;
                        if (onSelectionChangeRef.current) onSelectionChangeRef.current(activeLayerId);
                    }
                }

                // @ts-ignore
                const target = canvas.getObjects().find(obj => obj.id === activeLayerId);

                if (target && activeLayerId && onLayerUpdateRef.current) {
                    const matrix = target.calcTransformMatrix();
                    const invertedMatrix = fabric.util.invertTransform(matrix);
                    const localPoint = fabric.util.transformPoint(new fabric.Point(path.left, path.top), invertedMatrix);

                    const pathId = `${currentTool}-${Date.now()}`;
                    
                    path.set({
                        left: localPoint.x,
                        top: localPoint.y,
                        angle: path.angle - target.angle,
                        scaleX: path.scaleX / target.scaleX,
                        scaleY: path.scaleY / target.scaleY,
                        // @ts-ignore
                        id: pathId,
                        // @ts-ignore
                        layerId: activeLayerId,
                        selectable: false,
                        evented: false
                    });

                    if (currentTool === 'eraser') {
                        path.set({ stroke: 'black', fill: '' });
                        let clipGroup = target.clipPath as fabric.Group;
                        if (!clipGroup || clipGroup.type !== 'group') {
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
                            clipGroup = new fabric.Group([spacer], {
                                inverted: true,
                                absolutePositioned: false,
                                originX: 'center',
                                originY: 'center',
                                left: 0,
                                top: 0
                            });
                            target.set({ clipPath: clipGroup });
                        }

                        clipGroup.add(path);
                        clipGroup.set({ left: 0, top: 0 });
                        target.dirty = true;
                        canvas.requestRenderAll();

                        const allEraserPaths = clipGroup.getObjects().filter(obj =>
                            // @ts-ignore
                            obj.id && obj.id.startsWith('eraser-')
                        );

                        onLayerUpdateRef.current(activeLayerId, {
                            eraserPaths: allEraserPaths.map(p => p.toObject(['id', 'layerId', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'path', 'stroke', 'strokeWidth', 'fill', 'originX', 'originY', 'pathOffset']))
                        });
                        // Optimistically update layersRef to avoid race conditions with rapid strokes
                        layersRef.current = layersRef.current.map(l => l.id === activeLayerId ? {
                            ...l,
                            eraserPaths: allEraserPaths.map(p => p.toObject(['id', 'layerId', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'path', 'stroke', 'strokeWidth', 'fill', 'originX', 'originY', 'pathOffset']))
                        } : l);
                    } else {
                        // Brush tool
                        const layer = layersRef.current.find(l => l.id === activeLayerId);
                        const currentBrushPaths = layer?.brushPaths || [];
                        const pathObj = path.toObject(['id', 'layerId', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'path', 'stroke', 'strokeWidth', 'fill', 'originX', 'originY', 'pathOffset']);
                        const nextBrushPaths = [...currentBrushPaths, pathObj];
                        
                        onLayerUpdateRef.current(activeLayerId, {
                            brushPaths: nextBrushPaths
                        });
                        // Optimistically update layersRef to avoid race conditions with rapid strokes
                        layersRef.current = layersRef.current.map(l => l.id === activeLayerId ? {
                            ...l,
                            brushPaths: nextBrushPaths
                        } : l);
                    }
                }
            }
        });

        const updateAttachedPaths = (obj: any) => {
            if (!obj || !obj.id) return;
            const layerId = obj.id;
            const layer = layersRef.current.find(l => l.id === layerId);
            if (!layer || !layer.brushPaths) return;

            const matrix = obj.calcTransformMatrix();

            layer.brushPaths.forEach(pData => {
                const pathObj = canvas.getObjects().find(o => (o as any).id === pData.id);
                if (pathObj) {
                    const worldPoint = fabric.util.transformPoint(new fabric.Point(pData.left, pData.top), matrix);
                    pathObj.set({
                        left: worldPoint.x,
                        top: worldPoint.y,
                        angle: pData.angle + obj.angle,
                        scaleX: pData.scaleX * obj.scaleX,
                        scaleY: pData.scaleY * obj.scaleY
                    });
                }
            });
        };

        canvas.on('object:moving', (e) => updateAttachedPaths(e.target));
        canvas.on('object:scaling', (e) => updateAttachedPaths(e.target));
        canvas.on('object:rotating', (e) => updateAttachedPaths(e.target));

        canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (obj && (obj as any).id && onLayerUpdateRef.current) {
                onLayerUpdateRef.current((obj as any).id, {
                    x: obj.left,
                    y: obj.top,
                    scale: obj.scaleX,
                    rotation: obj.angle
                });
            }
        });

        canvas.on('selection:created', (e) => {
            const obj = e.selected?.[0];
            if (obj && (obj as any).id && onSelectionChangeRef.current) {
                onSelectionChangeRef.current((obj as any).id);
            }
        });

        canvas.on('selection:cleared', () => {
            onSelectionChange(null);
        });

        canvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            let zoom = canvas.getZoom();
            zoom *= 0.999 ** delta;
            if (zoom > 20) zoom = 20;
            if (zoom < 0.01) zoom = 0.01;
            const pointer = getAdjustedPointer(opt.e);
            canvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), zoom);
            opt.e.preventDefault();
            opt.e.stopPropagation();
        });


        canvas.on('mouse:down', (opt) => {
            canvas.calcOffset();
            isMouseDownRef.current = true;
            const pointer = getAdjustedPointer(opt.e);



            if (activeToolRef.current !== 'crop') return;
            cropStartRef.current = { x: pointer.x, y: pointer.y };
            
            if (cropRectRef.current) {
                canvas.remove(cropRectRef.current);
            }

            const rect = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: 'rgba(0, 204, 136, 0.2)',
                stroke: '#00cc88',
                strokeWidth: 2 / (canvas.getZoom() * viewScale),
                dashArray: [5 / (canvas.getZoom() * viewScale), 5 / (canvas.getZoom() * viewScale)],
                // @ts-ignore
                id: 'crop-rect',
                selectable: false,
                evented: false,
                hasRotatingPoint: false,
                transparentCorners: false,
                cornerColor: '#00cc88',
                cornerSize: 8 / (canvas.getZoom() * viewScale)
            });

            cropRectRef.current = rect;
            canvas.add(rect);
            canvas.setActiveObject(rect);
        });

        canvas.on('mouse:move', (opt) => {
            canvas.calcOffset();
            const pointer = getAdjustedPointer(opt.e);
            lastPointerRef.current = pointer;

            if (activeToolRef.current === 'brush' || activeToolRef.current === 'eraser') {
                updateCursor(pointer);
                return;
            }

            if (activeToolRef.current !== 'crop' || !cropRectRef.current || !isMouseDownRef.current || !cropStartRef.current) return;
            
            const rect = cropRectRef.current;
            const startX = cropStartRef.current.x;
            const startY = cropStartRef.current.y;

            const left = Math.min(startX, pointer.x);
            const top = Math.min(startY, pointer.y);
            const width = Math.abs(pointer.x - startX);
            const height = Math.abs(pointer.y - startY);
            
            rect.set({
                left,
                top,
                width,
                height
            });
            canvas.requestRenderAll();
        });

        canvas.on('mouse:up', () => {
            isMouseDownRef.current = false;
            cropStartRef.current = null;

            if (activeToolRef.current === 'crop' && cropRectRef.current) {
                cropRectRef.current.set({
                    selectable: true,
                    evented: true
                });
                canvas.setActiveObject(cropRectRef.current);
                canvas.requestRenderAll();
            }



            if (activeToolRef.current !== 'crop' || !cropRectRef.current) return;
            const rect = cropRectRef.current;
            if (rect.width! < 5 || rect.height! < 5) {
                canvas.remove(rect);
                cropRectRef.current = null;
            } else {
                rect.set({ selectable: true, evented: true });
                canvas.setActiveObject(rect);
                canvas.requestRenderAll();
            }
        });

        canvas.on('mouse:dblclick', (opt) => {
            if (activeToolRef.current === 'crop' && cropRectRef.current) {
                const rect = cropRectRef.current;
                if (onCropRef.current) {
                    onCropRef.current({
                        x: rect.left!,
                        y: rect.top!,
                        width: rect.width! * rect.scaleX!,
                        height: rect.height! * rect.scaleY!
                    });
                }
                canvas.remove(rect);
                cropRectRef.current = null;
            }
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey) isAltPressedRef.current = true;
            if (e.key === 'Enter' && activeToolRef.current === 'crop' && cropRectRef.current) {
                const rect = cropRectRef.current;
                if (onCropRef.current) {
                    onCropRef.current({
                        x: rect.left!,
                        y: rect.top!,
                        width: rect.width! * rect.scaleX!,
                        height: rect.height! * rect.scaleY!
                    });
                }
                canvas.remove(rect);
                cropRectRef.current = null;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.altKey) isAltPressedRef.current = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, []);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // Cleanup logic for tool switching
        if (activeTool !== 'crop') {
            const cropRect = canvas.getObjects().find(obj => (obj as any).id === 'crop-rect');
            if (cropRect) canvas.remove(cropRect);
        }

        if (activeTool !== 'brush' && activeTool !== 'eraser') {
            
            canvas.getObjects().forEach(obj => {
                const id = (obj as any).id;
                if (id === 'drawing-cursor') {
                    canvas.remove(obj);
                }
            });
            
            canvas.defaultCursor = 'default';
            canvas.hoverCursor = 'default';
        } else {
            // Drawing tools (Brush, Eraser)
            
            // updateCursor will handle setting the cursor to 'none' or 'crosshair'
            if (lastPointerRef.current) {
                updateCursor(lastPointerRef.current);
            } else {
                canvas.defaultCursor = 'crosshair';
                canvas.hoverCursor = 'crosshair';
            }
        }

        if (activeTool === 'crop') {
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';
        }



        canvas.requestRenderAll();
    }, [activeTool]);

    useEffect(() => {
        if (fabricCanvasRef.current) {
            fabricCanvasRef.current.setDimensions({ width, height });
        }
    }, [width, height]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        canvas.calcOffset();
        canvas.isDrawingMode = activeTool === 'brush' || activeTool === 'eraser';
        if (canvas.isDrawingMode) {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.width = brushSize;
            if (activeTool === 'eraser') {
                // @ts-ignore
                canvas.freeDrawingBrush.globalCompositeOperation = 'destination-out';
                canvas.freeDrawingBrush.color = 'rgba(0,0,0,1)';
            } else {
                canvas.freeDrawingBrush.color = brushColor;
            }
        }

        canvas.getObjects().forEach(obj => {
            const id = (obj as any).id;
            
            if (id === 'crop-rect') {
                obj.set({
                    selectable: true,
                    evented: true,
                    hasRotatingPoint: false
                });
                return;
            }
            
            if (['drawing-cursor'].includes(id)) {
                obj.set({
                    selectable: false,
                    evented: false
                });
                return;
            }

            if (id && id.startsWith('brush-')) {
                obj.set({
                    selectable: false,
                    evented: false
                });
                return;
            }

            // Image layers and other objects
            obj.set({
                selectable: activeTool === 'move',
                evented: activeTool === 'move'
            });
        });
        canvas.requestRenderAll();
    }, [activeTool, brushColor, brushSize, selectedLayerId, props.viewScale]);

    const updateLayers = (layersToRender: Layer[]) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        if (isUpdatingRef.current) {
            pendingLayersRef.current = layersToRender;
            return;
        }

        isUpdatingRef.current = true;
        pendingLayersRef.current = null;

        const layersToRenderFiltered = layersToRender.filter(l => l.type !== 'group');
        const currentObjects = canvas.getObjects();
        const objMap = new Map<string, fabric.Object>();
        currentObjects.forEach(obj => {
            // @ts-ignore
            if (obj.id) objMap.set(obj.id, obj);
        });

        const layerIds = new Set(layersToRenderFiltered.map(l => l.id));
        const allBrushPathIds = new Set();
        layersToRender.forEach(l => {
            l.brushPaths?.forEach(p => allBrushPathIds.add(p.id));
        });

        currentObjects.forEach(obj => {
            // @ts-ignore
            const id = obj.id;
            if (id && id !== 'crop-rect' && !layerIds.has(id) && id !== 'drawing-cursor' && !id.startsWith('brush-')) {
                canvas.remove(obj);
                objMap.delete(id);
            }
            // Also remove brush paths that are not in any layer's state
            if (id && id.startsWith('brush-')) {
                if (!allBrushPathIds.has(id)) {
                    canvas.remove(obj);
                    objMap.delete(id);
                }
            }
            // Remove paths without IDs (transient brush strokes)
            if (!id && obj.type === 'path') {
                canvas.remove(obj);
            }
        });

        const loadPromises = layersToRenderFiltered.map(layer => {
            // @ts-ignore
            let img = objMap.get(layer.id) as fabric.Image;

            if (img) {
                // @ts-ignore
                const currentSrc = img.getSrc();
                const srcPromise = (currentSrc !== layer.image)
                    ? img.setSrc(layer.image).then(() => {})
                    : Promise.resolve();

                return (srcPromise as any).then(() => {
                    img.set({
                        left: layer.x,
                        top: layer.y,
                        scaleX: layer.scale,
                        scaleY: layer.scale,
                        angle: layer.rotation,
                        opacity: layer.opacity,
                        visible: layer.visible,
                        // @ts-ignore
                        id: layer.id,
                        originX: 'center',
                        originY: 'center',
                        selectable: !layer.locked,
                        evented: !layer.locked
                    });
                    img.dirty = true;

                    if (layer.eraserPaths) {
                        let clipGroup = img.clipPath as fabric.Group;
                        if (!clipGroup || clipGroup.type !== 'group') {
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
                            clipGroup = new fabric.Group([spacer], {
                                inverted: true,
                                absolutePositioned: false,
                                originX: 'center',
                                originY: 'center',
                                left: 0,
                                top: 0
                            });
                            img.set({ clipPath: clipGroup });
                        }

                        const currentEraserIds = new Set(layer.eraserPaths.map(p => p.id));
                        clipGroup.getObjects().forEach(obj => {
                            // @ts-ignore
                            if (obj.id?.startsWith('eraser-') && !currentEraserIds.has(obj.id)) {
                                clipGroup.remove(obj);
                            }
                        });

                        const existingIds = new Set(clipGroup.getObjects().map(o => (o as any).id));
                        const newPathPromises = layer.eraserPaths
                            .filter(p => !existingIds.has(p.id))
                            .map(pData => fabric.Path.fromObject(pData).then(path => {
                                path.set({
                                    left: pData.left,
                                    top: pData.top,
                                    scaleX: pData.scaleX,
                                    scaleY: pData.scaleY,
                                    angle: pData.angle,
                                    stroke: 'black',
                                    fill: '',
                                    selectable: false,
                                    evented: false,
                                    // @ts-ignore
                                    id: pData.id,
                                    originX: pData.originX || 'left',
                                    originY: pData.originY || 'top',
                                    pathOffset: pData.pathOffset || { x: 0, y: 0 }
                                });
                                clipGroup.add(path);
                            }));
                        return Promise.all(newPathPromises).then(() => {
                            clipGroup.set({ left: 0, top: 0 });
                            img.dirty = true;
                        });
                    } else {
                        img.set({ clipPath: undefined });
                    }

                    // Render brush paths
                    const brushPromises = (layer.brushPaths || []).map(pData => {
                        // @ts-ignore
                        let path = objMap.get(pData.id) as fabric.Path;
                        const matrix = img.calcTransformMatrix();
                        const worldPoint = fabric.util.transformPoint(new fabric.Point(pData.left, pData.top), matrix);

                        if (!path) {
                            return fabric.Path.fromObject(pData).then(newPath => {
                                newPath.set({
                                    left: worldPoint.x,
                                    top: worldPoint.y,
                                    angle: pData.angle + img.angle,
                                    scaleX: pData.scaleX * img.scaleX,
                                    scaleY: pData.scaleY * img.scaleY,
                                    selectable: false,
                                    evented: false,
                                    // @ts-ignore
                                    id: pData.id
                                });
                                canvas.add(newPath);
                                // Update objMap so stack management can find it
                                // @ts-ignore
                                objMap.set(pData.id, newPath);
                                return newPath;
                            });
                        } else {
                            path.set({
                                left: worldPoint.x,
                                top: worldPoint.y,
                                angle: pData.angle + img.angle,
                                scaleX: pData.scaleX * img.scaleX,
                                scaleY: pData.scaleY * img.scaleY,
                                selectable: false,
                                evented: false
                            });
                            return Promise.resolve(path);
                        }
                    });
                    
                    return Promise.all(brushPromises);
                });
            } else {
                return fabric.Image.fromURL(layer.image).then(async (newImg) => {
                    newImg.set({
                        left: layer.x,
                        top: layer.y,
                        scaleX: layer.scale,
                        scaleY: layer.scale,
                        angle: layer.rotation,
                        opacity: layer.opacity,
                        visible: layer.visible,
                        // @ts-ignore
                        id: layer.id,
                        originX: 'center',
                        originY: 'center',
                        selectable: !layer.locked,
                        evented: !layer.locked
                    });

                    if (layer.eraserPaths) {
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
                        newImg.set({ clipPath: clipGroup });

                        const pathPromises = layer.eraserPaths.map(pData => fabric.Path.fromObject(pData).then(path => {
                            path.set({
                                left: pData.left,
                                top: pData.top,
                                scaleX: pData.scaleX,
                                scaleY: pData.scaleY,
                                angle: pData.angle,
                                stroke: 'black',
                                fill: '',
                                selectable: false,
                                evented: false,
                                // @ts-ignore
                                id: pData.id,
                                originX: pData.originX || 'left',
                                originY: pData.originY || 'top',
                                pathOffset: pData.pathOffset || { x: 0, y: 0 }
                            });
                            clipGroup.add(path);
                        }));
                        return Promise.all(pathPromises).then(() => {
                            clipGroup.set({ left: 0, top: 0 });
                            newImg.dirty = true;
                            canvas.add(newImg);
                        });
                    } else {
                        canvas.add(newImg);
                    }

                    // Render brush paths for new image
                    const brushPromises = (layer.brushPaths || []).map(pData => {
                        const matrix = newImg.calcTransformMatrix();
                        const worldPoint = fabric.util.transformPoint(new fabric.Point(pData.left, pData.top), matrix);

                        return fabric.Path.fromObject(pData).then(newPath => {
                            newPath.set({
                                left: worldPoint.x,
                                top: worldPoint.y,
                                angle: pData.angle + newImg.angle,
                                scaleX: pData.scaleX * newImg.scaleX,
                                scaleY: pData.scaleY * newImg.scaleY,
                                selectable: false,
                                evented: false,
                                // @ts-ignore
                                id: pData.id
                            });
                            canvas.add(newPath);
                            // Update objMap so stack management can find it
                            // @ts-ignore
                            objMap.set(pData.id, newPath);
                            return newPath;
                        });
                    });
                    
                    return Promise.all(brushPromises);
                });
            }
        });

        Promise.all(loadPromises)
            .then(() => {
                let currentStackIndex = 0;
                const objects = canvas.getObjects();
                layersToRender.forEach((layer) => {
                    // @ts-ignore
                    const img = objMap.get(layer.id);
                    if (img) {
                        if (objects[currentStackIndex] !== img) {
                            canvas.moveObjectTo(img, currentStackIndex);
                        }
                        currentStackIndex++;
                        if (layer.brushPaths) {
                            layer.brushPaths.forEach(pData => {
                                // @ts-ignore
                                const path = objMap.get(pData.id);
                                if (path) {
                                    if (objects[currentStackIndex] !== path) {
                                        canvas.moveObjectTo(path, currentStackIndex);
                                    }
                                    currentStackIndex++;
                                }
                            });
                        }
                    }
                });
                canvas.requestRenderAll();
            })
            .catch(error => {
                console.error("Error updating layers:", error);
            })
            .finally(() => {
                isUpdatingRef.current = false;
                if (pendingLayersRef.current) updateLayers(pendingLayersRef.current);
            });
    };


    useEffect(() => {
        updateLayers(layers);
    }, [layers]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || isUpdatingRef.current) return;
        if (selectedLayerId) {
            // @ts-ignore
            const obj = canvas.getObjects().find(o => o.id === selectedLayerId);
            if (obj && canvas.getActiveObject() !== obj) {
                canvas.setActiveObject(obj);
                canvas.requestRenderAll();
            }
        } else {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }
    }, [selectedLayerId]);

    return (
        <div className="w-full h-full flex items-center justify-center bg-[#111] overflow-hidden">
            <div
                className="relative shadow-2xl"
                style={{
                    width,
                    height,
                    backgroundColor: '#1a1a1a',
                    backgroundImage: `url("${CHECKERBOARD_BG}")`,
                    backgroundSize: '16px 16px'
                }}
            >
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
});

FabricCanvas.displayName = 'FabricCanvas';
