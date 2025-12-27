
import React, { useRef, useState, useEffect, useMemo, memo } from 'react';
import { HistoryState } from '../types';
import { GitBranch, Trash2, AlertTriangle, Star, Check } from 'lucide-react';

interface SpatialHistoryViewProps {
    history: HistoryState[];
    currentHistoryId: string | null;
    recentSnapshotIds: string[];
    onFork: (sourceId: string, position: { x: number; y: number }) => void;
    onLoad: (stateId: string) => void;
    onUpdatePosition: (id: string, position: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string) => void;
    checkArchiveStatus: (id: string) => { allowed: boolean; reason: string };
}

// --- MEMOIZED NODE COMPONENT ---
const HistoryNodeItem = memo(({
    item,
    isActive,
    isHovered,
    onMouseDown,
    onForkDragStart,
    onLoad,
    onDelete,
    onTogglePin,
    onHoverStart,
    onHoverEnd,
    positionOverride,
    checkArchiveStatus
}: {
    item: HistoryState,
    isActive: boolean,
    isHovered: boolean,
    onMouseDown: (e: React.MouseEvent, id: string) => void,
    onForkDragStart: (e: React.MouseEvent, id: string) => void,
    onLoad: (id: string) => void,
    onDelete: (id: string) => void,
    onTogglePin: (id: string) => void,
    onHoverStart: (id: string) => void,
    onHoverEnd: () => void,
    positionOverride?: { x: number, y: number },
    checkArchiveStatus: (id: string) => { allowed: boolean; reason: string }
}) => {
    const x = positionOverride ? positionOverride.x : item.position.x;
    const y = positionOverride ? positionOverride.y : item.position.y;

    // Calculate opacity based on active status
    const opacity = isActive ? 1.0 : (isHovered ? 0.4 : 0.08);

    const archiveStatus = checkArchiveStatus(item.id);

    return (
        <div
            className="absolute w-[200px] h-[150px] bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl hover:border-white/50 hover:shadow-white/10 transition-all group flex flex-col overflow-hidden will-change-transform history-node"
            style={{
                transform: `translate3d(${x}px, ${y}px, 0)`,
                opacity: opacity,
                transition: 'opacity 200ms ease-out',
                cursor: 'grab'
            }}
            onMouseDown={(e) => onMouseDown(e, item.id)}
            onMouseEnter={() => onHoverStart(item.id)}
            onMouseLeave={() => onHoverEnd()}
        >
            {/* Header / Handle */}
            <div className="h-8 bg-[#222] border-b border-[#333] flex items-center justify-between pl-3 pr-1 select-none">
                <span className="text-[10px] font-bold text-gray-300 truncate max-w-[100px]">{item.label}</span>
                <div className="flex items-center gap-1">
                    <span className="text-[9px] text-gray-600 font-mono mr-1">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                    {/* Pin/Star Button */}
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(item.id);
                        }}
                        className={`p-1.5 rounded transition-colors ${item.isPinned
                                ? 'text-white hover:text-white/80'
                                : 'text-gray-600 hover:text-gray-400'
                            }`}
                        title={item.isPinned ? "Unpin from active paths" : "Pin to active paths"}
                    >
                        <Star className={`w-3 h-3 ${item.isPinned ? 'fill-current' : ''}`} />
                    </button>

                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (archiveStatus.allowed) {
                                if (window.confirm('Archive this history snapshot?')) onDelete(item.id);
                            }
                        }}
                        disabled={!archiveStatus.allowed}
                        className={`p-1.5 rounded transition-colors flex items-center justify-center ${archiveStatus.allowed
                                ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/20 cursor-pointer'
                                : 'text-gray-700 cursor-not-allowed opacity-50 hover:bg-transparent'
                            }`}
                        title={archiveStatus.allowed ? "Archive Snapshot" : archiveStatus.reason}
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
            {isActive && (
                <>
                    <div className="absolute inset-0 border-2 border-white rounded-lg z-10 pointer-events-none" />
                    <div className="absolute top-2 right-2 bg-fashion-accent text-white border border-white/20 px-2 py-1 rounded text-[10px] font-bold z-20 flex items-center gap-1 shadow-lg">
                        <Check className="w-3 h-3" /> ACTIVE
                    </div>
                </>
            )}

            {/* Thumbnail Area - Draggable for Forking */}
            <div
                className="flex-1 relative bg-black group-hover:opacity-90 transition-opacity cursor-copy"
                title="Drag to Empty Space to Fork Branch"
                onMouseDown={(e) => onForkDragStart(e, item.id)}
            >
                {item.thumbnail ? (
                    <img
                        src={item.thumbnailLowRes || item.thumbnail}
                        className="w-full h-full object-cover opacity-80 pointer-events-none"
                        loading="lazy"
                        alt="Snapshot"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 pointer-events-none">
                        <GitBranch className="w-8 h-8 mb-2 opacity-20" />
                        <span className="text-[9px]">Unexecuted State</span>
                    </div>
                )}

                {/* Overlay Action */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none overlay-action">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest border border-white/20 px-2 py-1 rounded bg-black/50">
                        Drag to Fork
                    </span>
                </div>
            </div>

            {/* Footer Action */}
            <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onLoad(item.id); }}
                className="h-7 bg-[#1e1e1e] border-t border-[#333] text-[10px] text-gray-400 hover:text-white hover:bg-[#333] transition-colors flex items-center justify-center uppercase tracking-wider font-medium load-button"
            >
                Load State
            </button>
        </div>
    );
});

export const SpatialHistoryView: React.FC<SpatialHistoryViewProps> = ({
    history,
    currentHistoryId,
    recentSnapshotIds,
    onFork,
    onLoad,
    onUpdatePosition,
    onDelete,
    onTogglePin,
    checkArchiveStatus
}) => {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    // DIRECT DOM MANIPULATION REFS
    const panRef = useRef({ x: 0, y: 0 });
    const contentLayerRef = useRef<HTMLDivElement>(null);
    const gridLayerRef = useRef<HTMLDivElement>(null);

    // Temporary positions for nodes being dragged
    const [tempNodePositions, setTempNodePositions] = useState<Record<string, { x: number, y: number }>>({});

    const lastMousePos = useRef({ x: 0, y: 0 });
    const rafRef = useRef<number | null>(null);

    // Drag State
    const [dragMode, setDragMode] = useState<'PAN' | 'MOVE_NODE' | 'FORK_DRAG' | null>(null);
    const activeItemId = useRef<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    // Active History (Non-Archived)
    // We filter here so the rest of the view logic only deals with visible items
    const activeHistory = useMemo(() => history.filter(h => !h.is_archived), [history]);

    // --- ACTIVE PATH DETECTION ---
    const getActivePaths = useMemo(() => {
        const activePaths = new Set<string>();

        // 1. Add current working branch and all ancestors
        if (currentHistoryId) {
            let current: HistoryState | undefined = history.find(h => h.id === currentHistoryId);
            while (current) {
                activePaths.add(current.id);
                current = current.parentId ? history.find(h => h.id === current!.parentId) : undefined;
            }
        }

        // 2. Add pinned branches and their ancestors
        history.forEach(h => {
            if (h.isPinned) {
                let current: HistoryState | undefined = h;
                while (current) {
                    activePaths.add(current.id);
                    current = current.parentId ? history.find(h => h.id === current!.parentId) : undefined;
                }
            }
        });

        // 3. Add recent snapshots (last 3)
        recentSnapshotIds.forEach(id => {
            const snapshot = history.find(h => h.id === id);
            if (snapshot) {
                let current: HistoryState | undefined = snapshot;
                while (current) {
                    activePaths.add(current.id);
                    current = current.parentId ? history.find(h => h.id === current!.parentId) : undefined;
                }
            }
        });

        return activePaths;
    }, [history, currentHistoryId, recentSnapshotIds]);

    const isActivePath = (id: string) => getActivePaths.has(id);

    // Sync ref with state on mount/update
    useEffect(() => {
        panRef.current = pan;
    }, [pan]);

    // --- Resize Observer for Virtualization ---
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // --- Coordinate Helpers ---
    const screenToWorld = (x: number, y: number, currentPan = panRef.current) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (x - rect.left - currentPan.x) / zoom,
            y: (y - rect.top - currentPan.y) / zoom
        };
    };

    // --- Virtualization & LOD Logic ---
    const visibleNodes = useMemo(() => {
        // Increased buffer allows for significant panning before seeing empty space,
        // while still keeping DOM node count relatively low compared to the full history.
        const BUFFER = 1500;

        const xMin = -pan.x / zoom - BUFFER;
        const yMin = -pan.y / zoom - BUFFER;
        const xMax = (containerSize.width - pan.x) / zoom + BUFFER;
        const yMax = (containerSize.height - pan.y) / zoom + BUFFER;

        return activeHistory.filter(item => {
            const pos = tempNodePositions[item.id] || item.position;
            return pos.x + 200 > xMin &&
                pos.x < xMax &&
                pos.y + 150 > yMin &&
                pos.y < yMax;
        });
    }, [activeHistory, pan, zoom, containerSize, tempNodePositions]);

    const useSimpleConnections = zoom < 0.6;

    // --- Interaction Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) {
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            setDragMode('PAN');
            // Optimize: Add class to disable pointer events on children during drag
            if (containerRef.current) containerRef.current.classList.add('is-interacting');
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        activeItemId.current = id;
        setDragMode('MOVE_NODE');
        if (containerRef.current) containerRef.current.classList.add('is-interacting');
    };

    const handleForkDragStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        e.preventDefault();
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        activeItemId.current = id;
        setDragMode('FORK_DRAG');
        if (containerRef.current) containerRef.current.classList.add('is-interacting');
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragMode) return;
        if (rafRef.current) return;

        const clientX = e.clientX;
        const clientY = e.clientY;

        rafRef.current = requestAnimationFrame(() => {
            const dx = clientX - lastMousePos.current.x;
            const dy = clientY - lastMousePos.current.y;
            lastMousePos.current = { x: clientX, y: clientY };

            if (dragMode === 'PAN') {
                panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
                const transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoom})`;

                // Synchronized update of both layers for zero-lag feel
                if (contentLayerRef.current) contentLayerRef.current.style.transform = transform;
                if (gridLayerRef.current) gridLayerRef.current.style.transform = transform;
            }
            else if (dragMode === 'MOVE_NODE' && activeItemId.current) {
                const nodeId = activeItemId.current;
                const item = activeHistory.find(h => h.id === nodeId);
                if (item) {
                    const currentPos = tempNodePositions[nodeId] || item.position;
                    setTempNodePositions(prev => ({
                        ...prev,
                        [nodeId]: {
                            x: currentPos.x + dx / zoom,
                            y: currentPos.y + dy / zoom
                        }
                    }));
                }
            }

            rafRef.current = null;
        });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (dragMode === 'PAN') {
            setPan(panRef.current);
        }
        else if (dragMode === 'MOVE_NODE' && activeItemId.current) {
            const finalPos = tempNodePositions[activeItemId.current];
            if (finalPos) {
                onUpdatePosition(activeItemId.current, finalPos);
            }
            setTempNodePositions(prev => {
                const next = { ...prev };
                delete next[activeItemId.current!];
                return next;
            });
        }
        else if (dragMode === 'FORK_DRAG' && activeItemId.current) {
            const { x, y } = screenToWorld(e.clientX, e.clientY, panRef.current);
            onFork(activeItemId.current, { x: x - 100, y: y - 75 });
        }

        // Cleanup
        setDragMode(null);
        activeItemId.current = null;
        if (containerRef.current) containerRef.current.classList.remove('is-interacting');

        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        const s = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoom * s, 0.2), 3);
        setZoom(newZoom);

        // Immediate visual update
        const transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${newZoom})`;
        if (contentLayerRef.current) contentLayerRef.current.style.transform = transform;
        if (gridLayerRef.current) gridLayerRef.current.style.transform = transform;
    };

    const connections = useMemo(() => {
        return activeHistory.map(item => {
            if (!item.parentId) return null;
            const parent = activeHistory.find(h => h.id === item.parentId);
            if (!parent) return null;

            const pPos = tempNodePositions[parent.id] || parent.position;
            const cPos = tempNodePositions[item.id] || item.position;

            const sx = pPos.x + 200;
            const sy = pPos.y + 75;
            const tx = cPos.x;
            const ty = cPos.y + 75;

            // Calculate opacity based on both nodes
            const isParentActive = isActivePath(parent.id);
            const isChildActive = isActivePath(item.id);
            const connectionOpacity = (isParentActive && isChildActive) ? 1.0 : 0.08;

            if (useSimpleConnections) {
                return (
                    <line
                        key={`conn-${parent.id}-${item.id}`}
                        x1={sx} y1={sy} x2={tx} y2={ty}
                        stroke="#444" strokeWidth="1"
                        opacity={connectionOpacity}
                        style={{ transition: 'opacity 200ms ease-out' }}
                    />
                );
            } else {
                const dist = Math.abs(tx - sx) / 2;
                const path = `M ${sx},${sy} C ${sx + dist},${sy} ${tx - dist},${ty} ${tx},${ty}`;
                return (
                    <g key={`conn-${parent.id}-${item.id}`} opacity={connectionOpacity} style={{ transition: 'opacity 200ms ease-out' }}>
                        <path d={path} stroke="#333" strokeWidth="2" fill="none" />
                        <circle cx={sx} cy={sy} r="3" fill="#555" />
                        <circle cx={tx} cy={ty} r="3" fill="#555" />
                    </g>
                );
            }
        });
    }, [activeHistory, useSimpleConnections, tempNodePositions, isActivePath]);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full bg-[#050505] overflow-hidden relative ${dragMode === 'PAN' ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            <style>{`
            /* Optimization: Disable Pointer Events during interaction */
            .is-interacting .history-node,
            .is-interacting .connection-line,
            .is-interacting .load-button,
            .is-interacting .overlay-action {
                pointer-events: none !important;
            }
            .is-interacting {
                user-select: none;
            }
        `}</style>

            {/* Background Grid - GPU Accelerated & Syncs with Content */}
            <div
                ref={gridLayerRef}
                className="absolute inset-0 pointer-events-none opacity-10 will-change-transform transform-gpu"
                style={{
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    transformOrigin: '0 0'
                }}
            />

            {/* World Layer - GPU Accelerated */}
            <div
                ref={contentLayerRef}
                className="absolute left-0 top-0 will-change-transform transform-gpu"
                style={{
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                    transformOrigin: '0 0'
                }}
            >
                <svg className="overflow-visible absolute left-0 top-0 pointer-events-none connection-line">
                    {connections}
                </svg>

                {visibleNodes.map(item => (
                    <HistoryNodeItem
                        key={item.id}
                        item={item}
                        isActive={isActivePath(item.id)}
                        isHovered={hoveredNodeId === item.id}
                        onMouseDown={handleNodeMouseDown}
                        onForkDragStart={handleForkDragStart}
                        onLoad={onLoad}
                        onDelete={onDelete}
                        onTogglePin={onTogglePin}
                        onHoverStart={setHoveredNodeId}
                        onHoverEnd={() => setHoveredNodeId(null)}
                        positionOverride={tempNodePositions[item.id]}
                        checkArchiveStatus={checkArchiveStatus}
                    />
                ))}
            </div>

            <div className="absolute top-6 left-6 pointer-events-none select-none z-50">
                <h2 className="text-2xl font-serif font-bold text-gray-200 tracking-wide">Spatial History</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xs">
                    Drag any thumbnail to an empty space to <span className="text-fashion-accent">FORK</span> a new design branch.
                </p>
                <div className="mt-2 text-[10px] text-gray-600 font-mono">
                    Visible Nodes: {visibleNodes.length} / {activeHistory.length}
                </div>

                {dragMode === 'FORK_DRAG' && (
                    <div className="mt-2 text-xs text-fashion-accent font-bold animate-pulse">
                        RELEASE TO FORK
                    </div>
                )}
            </div>
        </div>
    );
};
