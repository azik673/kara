
import React, { useRef, useState, useEffect } from 'react';
import { Node, Edge } from '../types';
import { NodeBlock } from './NodeBlock';
import { NODE_REGISTRY } from '../services/nodeEngine';

interface GraphCanvasProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodeIds: string[];
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    pan: { x: number; y: number };
    setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    onLoopback: (imageUrl: string, sourceNodeId: string) => void;
    onNodeMouseDown: (e: React.MouseEvent, id: string) => void;
    onToggleGroup: (groupId: string) => void;
    onSaveGroup?: (groupId: string) => void;
    onUpdateNodeData?: (id: string, data: any) => void; // Added prop
    onCompare?: (nodeId: string) => void;
    comparisonBaseId?: string | null;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
    nodes, edges, setNodes, setEdges, selectedNodeIds, setSelectedNodeIds,
    zoom, setZoom, pan, setPan, onLoopback, onNodeMouseDown, onToggleGroup, onSaveGroup, onUpdateNodeData,
    onCompare, comparisonBaseId
}) => {
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingNode, setIsDraggingNode] = useState<string | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    // Selection State
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);

    // Connection state
    const [connecting, setConnecting] = useState<{ nodeId: string, handle: string, isInput: boolean, x: number, y: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const panStartPos = useRef({ x: 0, y: 0 }); // To detect clicks vs drags

    // Track Spacebar for Panning Mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpacePressed(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // --- Coords Helper ---
    const screenToWorld = (x: number, y: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (x - rect.left - pan.x) / zoom,
            y: (y - rect.top - pan.y) / zoom
        };
    };

    // --- Mouse Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        // 1. Left Mouse (0) or Middle Mouse (1): Pan
        if (e.button === 0 || e.button === 1) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            panStartPos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        // 2. Right Mouse (2): Lasso Selection
        if (e.button === 2) {
            e.preventDefault();
            const { x, y } = screenToWorld(e.clientX, e.clientY);
            setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        lastMousePos.current = { x: e.clientX, y: e.clientY };

        // 1. Handle Lasso Update
        if (selectionBox) {
            const { x, y } = screenToWorld(e.clientX, e.clientY);
            setSelectionBox(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
            return;
        }

        // 2. Handle Panning
        if (isPanning) {
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            return;
        }

        // 3. Handle Node Dragging
        if (isDraggingNode) {
            const worldDx = dx / zoom;
            const worldDy = dy / zoom;

            // --- GROUP DRAG LOGIC ---
            const draggingGroupMembers = new Set<string>();
            nodes.forEach(n => {
                if (selectedNodeIds.includes(n.id) && n.type === 'group' && n.data.params.members) {
                    n.data.params.members.forEach((mid: string) => draggingGroupMembers.add(mid));
                }
            });

            setNodes(prev => prev.map(n => {
                const isSelected = selectedNodeIds.includes(n.id);
                const isGroupMember = draggingGroupMembers.has(n.id);

                // Move if it is selected OR if it belongs to a group that is being dragged
                if (isSelected || isGroupMember) {
                    return { ...n, position: { x: n.position.x + worldDx, y: n.position.y + worldDy } };
                }
                return n;
            }));
            return;
        }

        // 4. Handle Connection Line
        if (connecting) {
            setConnecting(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        // 1. Finish Lasso Selection
        if (selectionBox) {
            const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
            const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
            const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
            const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

            const isClick = Math.abs(selectionBox.currentX - selectionBox.startX) < 2 && Math.abs(selectionBox.currentY - selectionBox.startY) < 2;

            if (isClick) {
                setSelectionBox(null);
                return;
            }

            const newlySelected: string[] = [];

            nodes.forEach(n => {
                if (n.hidden) return;
                const w = n.data.width || (n.type === 'mask_editor' || n.type === 'group' ? 400 : 256);
                const h = n.data.height || (n.type === 'mask_editor' || n.type === 'group' ? 400 : 200);

                if (n.position.x < x2 && n.position.x + w > x1 &&
                    n.position.y < y2 && n.position.y + h > y1) {
                    newlySelected.push(n.id);
                }
            });

            setSelectedNodeIds(prev => {
                if (e.shiftKey) {
                    const uniqueSet = new Set([...prev, ...newlySelected]);
                    return Array.from(uniqueSet);
                }
                return newlySelected;
            });

            setSelectionBox(null);
            return;
        }

        // 2. Finish Panning
        if (isPanning) {
            setIsPanning(false);
            const dist = Math.sqrt(
                Math.pow(e.clientX - panStartPos.current.x, 2) +
                Math.pow(e.clientY - panStartPos.current.y, 2)
            );
            if (dist < 5 && e.button === 0) {
                setSelectedNodeIds([]);
            }
            return;
        }

        setIsDraggingNode(null);

        if (connecting) setConnecting(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const s = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoom * s, 0.2), 5);
        setZoom(newZoom);
    };

    // --- Node Interaction ---
    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onNodeMouseDown(e, id); // Delegate selection logic to App
        setIsDraggingNode(id);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    // --- PROPORTIONAL SCALING LOGIC ---
    const handleNodeResize = (id: string, width: number, height: number) => {
        setNodes(prev => {
            const group = prev.find(n => n.id === id);

            // Proportional Group Scaling
            if (group && group.type === 'group' && group.data.params.members?.length > 0) {
                // Prevent divide by zero
                const oldW = group.data.width || 400;
                const oldH = group.data.height || 400;

                const scaleX = width / oldW;
                const scaleY = height / oldH;

                const memberIds = group.data.params.members;

                return prev.map(n => {
                    // Update Group Node
                    if (n.id === id) {
                        return { ...n, data: { ...n.data, width, height } };
                    }

                    // Update Member Nodes
                    if (memberIds.includes(n.id)) {
                        // Calculate new Position relative to Group origin
                        const relX = n.position.x - group.position.x;
                        const relY = n.position.y - group.position.y;

                        const newX = group.position.x + (relX * scaleX);
                        const newY = group.position.y + (relY * scaleY);

                        // Calculate new Dimensions
                        const getDefaultW = (t: string) => (t === 'mask_editor' || t === 'group') ? 400 : 256;
                        const getDefaultH = (t: string) => (t === 'mask_editor' || t === 'group') ? 400 : 300;

                        const currentW = n.data.width || getDefaultW(n.type);
                        const currentH = n.data.height || getDefaultH(n.type);

                        return {
                            ...n,
                            position: { x: newX, y: newY },
                            data: {
                                ...n.data,
                                width: currentW * scaleX,
                                height: currentH * scaleY
                            }
                        };
                    }
                    return n;
                });
            }

            // Standard Resize for non-group nodes
            return prev.map(n => {
                if (n.id === id) {
                    return { ...n, data: { ...n.data, width, height } };
                }
                return n;
            });
        });
    };

    const handlePortMouseDown = (e: React.MouseEvent, nodeId: string, handleId: string, isInput: boolean) => {
        e.stopPropagation();
        if (!isInput) {
            setConnecting({ nodeId, handle: handleId, isInput, x: e.clientX, y: e.clientY });
        }
    };

    const handlePortMouseUp = (e: React.MouseEvent, targetNodeId: string, targetHandleId: string, isInput: boolean) => {
        e.stopPropagation();
        if (connecting && connecting.isInput !== isInput && connecting.nodeId !== targetNodeId) {
            const newEdge: Edge = {
                id: `e-${Date.now()}`,
                source: connecting.isInput ? targetNodeId : connecting.nodeId,
                sourceHandle: connecting.isInput ? targetHandleId : connecting.handle,
                target: connecting.isInput ? connecting.nodeId : targetNodeId,
                targetHandle: connecting.isInput ? connecting.handle : targetHandleId
            };
            setEdges(prev => [...prev, newEdge]);
        }
        setConnecting(null);
    };

    // Prevent Context Menu for Right Click functionality
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    const isHidden = (nodeId: string) => nodes.find(n => n.id === nodeId)?.hidden;

    const handleNodeParamsUpdate = (id: string, params: any) => {
        if (onUpdateNodeData) {
            const node = nodes.find(n => n.id === id);
            if (node) {
                onUpdateNodeData(id, { ...node.data, params });
            }
        }
    };

    return (
        <div
            ref={containerRef}
            className={`w-full h-full bg-[#0a0a0a] overflow-hidden relative 
            ${isPanning ? 'cursor-grabbing' : (selectionBox ? 'cursor-crosshair' : 'cursor-grab')}
        `}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
        >
            {/* Grid Pattern */}
            <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    backgroundImage: 'radial-gradient(#555 1px, transparent 1px)',
                    backgroundSize: '30px 30px',
                    transformOrigin: '0 0'
                }}
            />

            {/* World Transform Layer */}
            <div
                className="absolute left-0 top-0 transform-gpu"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0'
                }}
            >
                {/* Edges */}
                <svg className="overflow-visible absolute left-0 top-0 pointer-events-none" style={{ width: 1, height: 1 }}>
                    {edges.map(edge => {
                        if (isHidden(edge.source) || isHidden(edge.target)) return null;

                        const src = nodes.find(n => n.id === edge.source);
                        const tgt = nodes.find(n => n.id === edge.target);
                        if (!src || !tgt) return null;

                        const srcWidth = src.data.width || (src.type === 'mask_editor' || src.type === 'group' ? 400 : 256);

                        const sx = src.position.x + srcWidth;
                        const sy = src.position.y + 60;
                        const tx = tgt.position.x;
                        const ty = tgt.position.y + 60;

                        const dist = Math.abs(tx - sx) / 2;
                        const path = `M ${sx},${sy} C ${sx + dist},${sy} ${tx - dist},${ty} ${tx},${ty}`;

                        const isSelected = selectedNodeIds.includes(src.id) || selectedNodeIds.includes(tgt.id);

                        return (
                            <g key={edge.id} className={isSelected ? "opacity-100" : "opacity-0 transition-opacity duration-200"}>
                                <path d={path} stroke={isSelected ? "#777" : "#555"} strokeWidth="3" fill="none" />
                                <path d={path} stroke="#d4af37" strokeWidth="1.5" fill="none" className={isSelected ? "" : "hidden"} />
                            </g>
                        );
                    })}

                    {connecting && containerRef.current && (() => {
                        const startNode = nodes.find(n => n.id === connecting.nodeId);
                        if (!startNode) return null;

                        const startWidth = startNode.data.width || (startNode.type === 'mask_editor' || startNode.type === 'group' ? 400 : 256);
                        const sx = startNode.position.x + startWidth;
                        const sy = startNode.position.y + 60;
                        const m = screenToWorld(connecting.x, connecting.y);

                        const path = `M ${sx},${sy} L ${m.x},${m.y}`;
                        return <path d={path} stroke="#d4af37" strokeWidth="2" strokeDasharray="5,5" fill="none" />;
                    })()}
                </svg>

                {/* Nodes */}
                {nodes.map(node => {
                    if (node.hidden) return null;
                    return (
                        <div key={node.id} className="relative">
                            <NodeBlock
                                node={node}
                                nodes={nodes}
                                edges={edges}
                                selected={selectedNodeIds.includes(node.id)}
                                zoom={zoom}
                                onMouseDown={handleNodeMouseDown}
                                onPortMouseDown={handlePortMouseDown}
                                onPortMouseUp={handlePortMouseUp}
                                onLoopback={onLoopback}
                                onResize={handleNodeResize}
                                onToggleGroup={onToggleGroup}
                                onSaveGroup={onSaveGroup}
                                onUpdateNodeParams={handleNodeParamsUpdate}
                                onCompare={onCompare}
                                isComparisonBase={comparisonBaseId === node.id}
                            />
                        </div>
                    );
                })}

                {/* Lasso Selection Rectangle */}
                {selectionBox && (
                    <div
                        className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
                        style={{
                            left: Math.min(selectionBox.startX, selectionBox.currentX),
                            top: Math.min(selectionBox.startY, selectionBox.currentY),
                            width: Math.abs(selectionBox.currentX - selectionBox.startX),
                            height: Math.abs(selectionBox.currentY - selectionBox.startY),
                        }}
                    />
                )}
            </div>
        </div>
    );
};
