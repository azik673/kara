
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GraphCanvas } from './components/GraphCanvas';
import { FloatingPanel } from './components/FloatingPanel';
import { ProjectSettings } from './components/ProjectSettings';
import { SpatialHistoryView } from './components/SpatialHistoryView';
import { Node, Edge, NodeStatus, Port, HistoryState, ViewMode, UserRole } from './types';
import { Play, ZoomIn, ZoomOut, Maximize, RefreshCw, Box, Trash2, Map, GitBranch, Camera, Settings, User, Plus, MousePointerClick } from 'lucide-react';
import { executeGraph, NODE_REGISTRY } from './services/nodeEngine';
import { storageService } from './services/storage';

// Helper: Recursively find all downstream nodes and edges
const getDownstreamNetwork = (startNodeId: string, allNodes: Node[], allEdges: Edge[]) => {
    const visited = new Set<string>();
    const nodesInNetwork: Node[] = [];
    const edgesInNetwork: Edge[] = [];

    // Start with immediate children (edges originating from startNode)
    const initialEdges = allEdges.filter(e => e.source === startNodeId);
    const stack = initialEdges.map(e => e.target);

    while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);

        const node = allNodes.find(n => n.id === id);
        if (node) nodesInNetwork.push(node);

        // Find edges starting from this node (recursively downstream)
        const outgoing = allEdges.filter(e => e.source === id);
        edgesInNetwork.push(...outgoing);

        outgoing.forEach(e => stack.push(e.target));
    }

    // We also need edges that connect any two nodes WITHIN the network
    // (The traversal above catches edges originating from the network, which covers internal links)

    return { nodes: nodesInNetwork, edges: edgesInNetwork, initialEdges };
};

// Helper: Generate Low-Res Thumbnail for Performance
const generateThumbnail = (dataUrl: string, width: number = 200): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const aspect = img.height / img.width;
            canvas.width = width;
            canvas.height = width * aspect;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Use default smoothing
                ctx.drawImage(img, 0, 0, width, width * aspect);
                // Export as JPEG with 70% quality for smaller size
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            } else {
                resolve(dataUrl); // Fallback
            }
        };
        img.onerror = () => resolve(dataUrl); // Fallback
        img.src = dataUrl;
    });
};


class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: any }
> {
    readonly props: { children: React.ReactNode };
    readonly state: { hasError: boolean; error: any };

    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.props = props;
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error("Uncaught Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-screen bg-black text-red-500 p-10 flex-col gap-4">
                    <h1 className="text-2xl font-bold">Something went wrong.</h1>
                    <pre className="bg-gray-900 p-4 rounded border border-red-900 text-sm overflow-auto max-w-full">
                        {this.state.error?.toString()}
                    </pre>
                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700">
                        Reload Application
                    </button>
                </div>
            );
        }

        return <>{this.props.children}</>;
    }
}

import { FloatingActionButton, ToolbarView } from './components/FloatingActionButton';
import { ComparisonViewModal } from './components/ComparisonViewModal';




// Smart Guides Component


const AppContent: React.FC = () => {
    // --- CORE STATE ---
    const [viewMode, setViewMode] = useState<ViewMode>('EDITOR');
    const [comparisonState, setComparisonState] = useState<{
        isOpen: boolean;
        baseNodeId: string | null;
        targetNodeId: string | null;
    }>({ isOpen: false, baseNodeId: null, targetNodeId: null });

    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [historyNodes, setHistoryNodes] = useState<HistoryState[]>([]);
    const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
    const [undoStack, setUndoStack] = useState<Array<{ nodes: Node[], edges: Edge[] }>>([]);
    const [redoStack, setRedoStack] = useState<Array<{ nodes: Node[], edges: Edge[] }>>([]);
    const [clipboard, setClipboard] = useState<{ nodes: Node[], edges: Edge[] } | null>(null);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [savedComponents, setSavedComponents] = useState<Array<{
        id: string;
        label: string;
        description: string;
        data: any;
    }>>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const [autoRunEnabled, setAutoRunEnabled] = useState(false);
    const [hasStartedWork, setHasStartedWork] = useState(() => {
        return localStorage.getItem('onboarding_complete_v2') === 'true';
    });
    const [zoom, setZoomState] = useState(() => {
        const saved = localStorage.getItem('graph_zoom');
        return saved ? parseFloat(saved) : 1;
    });
    const [pan, setPanState] = useState(() => {
        const saved = localStorage.getItem('graph_pan');
        return saved ? JSON.parse(saved) : { x: 0, y: 0 };
    });
    const [recentSnapshotIds, setRecentSnapshotIds] = useState<string[]>([]);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
    const [activeLibraryView, setActiveLibraryView] = useState<ToolbarView>('NODES');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [projectName, setProjectName] = useState('Autumn Collection V2');
    const [selectedModel, setSelectedModel] = useState('Flux.1 Dev');
    const [shareRole, setShareRole] = useState<UserRole>('CONSTRUCTOR');
    const [exportedImages, setExportedImages] = useState<Array<{ id: string; url: string; date: string; timestamp: number }>>([]);
    const [activityLog, setActivityLog] = useState<Array<{ id: string; text: string; timestamp: number }>>([]);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [confirmationDialogue, setConfirmationDialogue] = useState<{
        isOpen: boolean;
        nodeId: string | null;
        nodeName: string | null;
    }>({ isOpen: false, nodeId: null, nodeName: null });

    const profileMenuRef = useRef<HTMLDivElement>(null);
    const autoRunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRegenerationsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const setZoom = setZoomState;
    const setPan = setPanState;

    // Load exported images from storage on mount
    useEffect(() => {
        const loadImages = async () => {
            try {
                // const images = await storageService.getImages();
                // setExportedImages(images);
            } catch (error) {
                console.error("Failed to load exported images:", error);
            }
        };
        loadImages();
    }, []);

    // --- AUTO-SAVE & LOAD PROJECT ---
    const [isProjectLoaded, setIsProjectLoaded] = useState(false);

    // Load Project on Mount
    useEffect(() => {
        const loadProject = async () => {
            const savedState = await storageService.loadProject();
            if (savedState) {
                setNodes(savedState.nodes);
                setEdges(savedState.edges);
                // If we have saved layers, we might need to pass them down or restore them
                // For now, restoring nodes/edges restores the graph structure and node data (including images)
                console.log('Project restored from local storage');
            }
            setIsProjectLoaded(true);
        };
        loadProject();
    }, []);

    // Auto-Save Effect (Debounced)
    useEffect(() => {
        if (!isProjectLoaded) return; // Don't save before initial load completes

        const saveTimeout = setTimeout(() => {
            const state = {
                id: 'current-project',
                lastModified: Date.now(),
                nodes,
                edges,
                layerState: [], // Placeholder if we need global layer state later
                images: {}, // Images are currently stored in node data, so this can be empty or used for deduplication later
                canvasSize: { width: 1024, height: 1024 } // Default or dynamic
            };
            storageService.saveProject(state);
        }, 2000); // 2 second debounce

        return () => clearTimeout(saveTimeout);
    }, [nodes, edges, isProjectLoaded]);


    const handleStartWork = useCallback(() => {
        setNodes([
            {
                id: 'n-0', type: 'image_source', position: { x: 100, y: 50 },
                data: { label: 'Main Subject', params: { image: null, role: 'MAIN' }, status: 'idle' }
            },
            {
                id: 'n-4', type: 'image_source', position: { x: 100, y: 350 },
                data: { label: 'Ref. Object', params: { image: null, role: 'REF' }, status: 'idle' }
            },
            {
                id: 'n-1', type: 'input_prompt', position: { x: 100, y: 650 },
                data: { label: 'Text Prompt', params: { text: 'Wear the blue hat on the model and make the final picture realistic.' }, status: 'idle' }
            },
            {
                id: 'n-3', type: 'output_result', position: { x: 650, y: 250 },
                data: { label: 'Final Preview', params: { role: 'MAIN' }, status: 'idle' }
            }
        ]);
        setEdges([
            { id: 'e-0', source: 'n-0', sourceHandle: 'image', target: 'n-3', targetHandle: 'main_subject' },
            { id: 'e-ref', source: 'n-4', sourceHandle: 'image', target: 'n-3', targetHandle: 'ref_style' },
            { id: 'e-1', source: 'n-1', sourceHandle: 'text', target: 'n-3', targetHandle: 'prompt_in' }
        ]);
        setHasStartedWork(true);
        localStorage.setItem('onboarding_complete_v2', 'true');
    }, []);



    const pushToUndo = useCallback((nodesToPush: Node[], edgesToPush: Edge[], description: string = 'Action') => {
        setUndoStack(prev => {
            const next = [...prev, { 
                nodes: JSON.parse(JSON.stringify(nodesToPush)), 
                edges: JSON.parse(JSON.stringify(edgesToPush)) 
            }];
            if (next.length > 50) next.shift();
            return next;
        });
        setRedoStack([]);
        
        // Add to Activity Log
        setActivityLog(prev => [{
            id: `act-${Date.now()}`,
            text: description,
            timestamp: Date.now()
        }, ...prev].slice(0, 50));
    }, []);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        
        const prevState = undoStack[undoStack.length - 1];
        const currentState = { 
            nodes: JSON.parse(JSON.stringify(nodes)), 
            edges: JSON.parse(JSON.stringify(edges)) 
        };

        setRedoStack(prev => [...prev, currentState]);
        setUndoStack(prev => prev.slice(0, -1));
        
        setNodes(prevState.nodes);
        setEdges(prevState.edges);
    }, [undoStack, nodes, edges]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;

        const nextState = redoStack[redoStack.length - 1];
        const currentState = { 
            nodes: JSON.parse(JSON.stringify(nodes)), 
            edges: JSON.parse(JSON.stringify(edges)) 
        };

        setUndoStack(prev => [...prev, currentState]);
        setRedoStack(prev => prev.slice(0, -1));

        setNodes(nextState.nodes);
        setEdges(nextState.edges);
    }, [redoStack, nodes, edges]);

    const deleteSelectedNodes = useCallback(() => {
        if (selectedNodeIds.length === 0) return;
        pushToUndo(nodes, edges, 'Delete Nodes');
        setNodes(prev => prev.filter(n => !selectedNodeIds.includes(n.id)));
        setEdges(prev => prev.filter(e => !selectedNodeIds.includes(e.source) && !selectedNodeIds.includes(e.target)));
        setSelectedNodeIds([]);
    }, [selectedNodeIds, nodes, edges, pushToUndo]);

    const handleCopy = useCallback(() => {
        if (selectedNodeIds.length === 0) return;
        
        const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
        const selectedEdges = edges.filter(e => 
            selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target)
        );

        setClipboard({
            nodes: JSON.parse(JSON.stringify(selectedNodes)),
            edges: JSON.parse(JSON.stringify(selectedEdges))
        });
    }, [nodes, edges, selectedNodeIds]);

    const handleCut = useCallback(() => {
        if (selectedNodeIds.length === 0) return;
        handleCopy();
        deleteSelectedNodes();
    }, [handleCopy, deleteSelectedNodes, selectedNodeIds]);

    const handlePaste = useCallback(() => {
        if (!clipboard) return;

        pushToUndo(nodes, edges, 'Paste Nodes');

        const idMap: Record<string, string> = {};
        const newNodes: Node[] = clipboard.nodes.map(node => {
            const newId = `n-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            idMap[node.id] = newId;
            return {
                ...node,
                id: newId,
                position: {
                    x: node.position.x + 40,
                    y: node.position.y + 40
                },
                data: {
                    ...node.data,
                    status: 'idle',
                    result: undefined
                }
            };
        });

        const newEdges: Edge[] = clipboard.edges.map(edge => ({
            ...edge,
            id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            source: idMap[edge.source],
            target: idMap[edge.target]
        }));

        setNodes(prev => [...prev, ...newNodes]);
        setEdges(prev => [...prev, ...newEdges]);
        setSelectedNodeIds(newNodes.map(n => n.id));
    }, [clipboard, nodes, edges, pushToUndo]);






    useEffect(() => {
        if (nodes.length > 0 && !hasStartedWork) {
            setHasStartedWork(true);
            localStorage.setItem('onboarding_complete_v2', 'true');
        }
    }, [nodes.length, hasStartedWork]);
    // Persist Pan and Zoom


    useEffect(() => {
        localStorage.setItem('graph_zoom', zoom.toString());
    }, [zoom]);

    useEffect(() => {
        localStorage.setItem('graph_pan', JSON.stringify(pan));
    }, [pan]);






    const canPerform = useCallback((action: 'EDIT_NODES' | 'EXECUTE_FLOW' | 'CHANGE_SETTINGS' | 'VIEW_ONLY') => {
        switch (shareRole) {
            case 'CONSTRUCTOR':
                return true;
            case 'USER_ADMIN':
                return true;
            case 'USER_EDITOR':
                return action === 'EDIT_NODES' || action === 'EXECUTE_FLOW';
            case 'USER_VIEWER':
                return action === 'VIEW_ONLY';
            default:
                return false;
        }
    }, [shareRole]);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as any)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const count = parseInt(sessionStorage.getItem('debug_load_count') || '0');
        sessionStorage.setItem('debug_load_count', (count + 1).toString());
        // Force re-render to show new count (hacky but works for debug)
        setProjectName(prev => prev);
    }, []);

    // Robust Layout Initialization




    // --- NODE OPERATIONS ---


    // --- HISTORY LOGIC ---

    const createSnapshot = useCallback(async (label: string = 'Snapshot') => {
        // Find the "Output Result" node to get the thumbnail
        const resultNode = nodes.find(n => n.type === 'output_result');
        const thumbnail = resultNode?.data.result || null;

        let thumbnailLowRes = null;
        if (thumbnail) {
            thumbnailLowRes = await generateThumbnail(thumbnail);
        }

        const newSnapshot: HistoryState = {
            id: `hist-${Date.now()}`,
            label,
            timestamp: Date.now(),
            thumbnail,

            position: { x: Math.random() * 200, y: Math.random() * 200 }, // Initial pos, will organize later
            parentId: currentHistoryId, // Track lineage from currently loaded state
            graph: {
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges))
            }
        };

        setHistoryNodes(prev => [...prev, newSnapshot]);
        setCurrentHistoryId(newSnapshot.id); // Auto-switch context to the new snapshot

        // Track as recent snapshot (keep last 3)
        setRecentSnapshotIds(prev => {
            const updated = [newSnapshot.id, ...prev];
            return updated.slice(0, 3);  // Keep only last 3
        });

        return newSnapshot;
    }, [nodes, edges, currentHistoryId]);

    // Initial Snapshot on Load
    useEffect(() => {
        if (historyNodes.length === 0 && nodes.length > 0) {
            createSnapshot('Initial State');
        }
    }, []); // Run once

    const handleForkHistory = useCallback((sourceId: string, position: { x: number; y: number }) => {
        const sourceState = historyNodes.find(h => h.id === sourceId);
        if (!sourceState) return;

        console.log(`⚡ Forking History from ${sourceId}`);

        // CORE FORK LOGIC: DEEP COPY & RE-ID
        // We must regenerate IDs so the new branch is completely independent
        const idMap: Record<string, string> = {};

        const newNodes = sourceState.graph.nodes.map(n => {
            const newId = `n-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            idMap[n.id] = newId;
            return {
                ...n,
                id: newId,
                // Reset status to idle for the new branch
                data: {
                    ...n.data,
                    status: 'idle' as NodeStatus,
                    result: undefined,
                    params: { ...n.data.params, is_committed: false }
                }
            };
        });

        const newEdges = sourceState.graph.edges.map(e => ({
            ...e,
            id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            source: idMap[e.source] || e.source,
            target: idMap[e.target] || e.target
        }));

        const newHistoryNode: HistoryState = {
            id: `branch-${Date.now()}`,
            label: `Fork of ${sourceState.label}`,
            timestamp: Date.now(),
            thumbnail: null, // Empty until executed
            position,
            parentId: sourceId,
            graph: { nodes: newNodes, edges: newEdges }
        };

        setHistoryNodes(prev => [...prev, newHistoryNode]);
        // Note: We do NOT auto-switch to the fork. The user must explicitly "Load" it.
    }, [historyNodes]);

    const loadHistoryState = useCallback((stateId: string) => {
        const state = historyNodes.find(h => h.id === stateId);
        if (!state) return;

        // Load into Editor
        setNodes(JSON.parse(JSON.stringify(state.graph.nodes)));
        setEdges(JSON.parse(JSON.stringify(state.graph.edges)));

        setCurrentHistoryId(stateId); // Update Active Context
        setViewMode('EDITOR');
    }, [historyNodes]);

    const updateHistoryPosition = useCallback((id: string, pos: { x: number, y: number }) => {
        setHistoryNodes(prev => prev.map(h => h.id === id ? { ...h, position: pos } : h));
    }, []);

    /**
     * CHECK ARCHIVE ELIGIBILITY
     * Determines if a history node can be safely archived (soft deleted).
     * Returns { allowed: boolean, reason?: string }
     */
    const checkArchiveStatus = useCallback((id: string) => {
        // CHECK 1: Active Load
        if (id === currentHistoryId) {
            return { allowed: false, reason: "Cannot archive: This state is currently active in the Editor." };
        }

        // CHECK 2: Active Dependencies (Unarchived Children)
        const hasActiveDependencies = historyNodes.some(h => h.parentId === id && !h.is_archived);
        if (hasActiveDependencies) {
            return { allowed: false, reason: "Cannot archive: This state is the parent of active design forks." };
        }

        return { allowed: true, reason: "Safe to Archive" };
    }, [currentHistoryId, historyNodes]);

    const handleTogglePin = useCallback((historyId: string) => {
        setHistoryNodes(prev => prev.map(h =>
            h.id === historyId
                ? { ...h, isPinned: !h.isPinned }
                : h
        ));
    }, []);

    // Safe Soft Delete (Archive)
    const deleteHistoryNode = useCallback((id: string) => {
        const status = checkArchiveStatus(id);

        if (!status.allowed) {
            // Fallback alert if the UI button wasn't disabled for some reason
            alert(status.reason);
            return;
        }

        // SOFT DELETE (ARCHIVE)
        setHistoryNodes(prev => prev.map(h => h.id === id ? { ...h, is_archived: true } : h));
    }, [checkArchiveStatus]);



    const markDownstreamDirty = useCallback((nodeId: string, currentNodes: Node[], currentEdges: Edge[]): Node[] => {
        const newNodes = [...currentNodes];
        const visited = new Set<string>();
        const stack = [nodeId];
        while (stack.length > 0) {
            const currentId = stack.pop()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            const nodeIndex = newNodes.findIndex(n => n.id === currentId);
            if (nodeIndex !== -1) {
                // Don't mark output_result nodes as dirty to prevent auto-regeneration
                // They should only regenerate when user explicitly clicks Execute
                if (newNodes[nodeIndex].type !== 'output_result') {
                    newNodes[nodeIndex] = { ...newNodes[nodeIndex], data: { ...newNodes[nodeIndex].data, status: 'dirty', error: undefined } };
                }
            }
            const outgoingEdges = currentEdges.filter(e => e.source === currentId);
            outgoingEdges.forEach(e => stack.push(e.target));
        }
        return newNodes;
    }, []);

    const updateNodeData = useCallback((id: string, newData: any) => {
        // console.log('[App] updateNodeData called for:', id);
        setNodes(currentNodes => {
            const updatedNodes = currentNodes.map(n => {
                if (n.id === id) {
                    const { position: explicitPosition, data: partialData, ...rest } = newData;

                    // Merge data and params
                    const mergedData = {
                        ...n.data,
                        ...(partialData || {}),
                        params: {
                            ...n.data.params,
                            ...((partialData?.params) || {})
                        }
                    };

                    return {
                        ...n,
                        ...rest,
                        data: mergedData,
                        position: explicitPosition || n.position
                    };
                }
                return n;
            });

            if (newData.data?.params) {
                return markDownstreamDirty(id, updatedNodes, edges);
            }
            return updatedNodes;
        });
    }, [edges, markDownstreamDirty]);

    /**
     * NON-DESTRUCTIVE PROCEDURAL FORKING WITH DELAYED REGENERATION CONFIRMATION
     * Handles state changes by creating parallel branches instead of destroying history.
     * Implements latency timer to detect when user finishes editing before asking to regenerate.
     */
    const handleNodeParamChange = useCallback((nodeId: string, newParams: any) => {
        pushToUndo(nodes, edges, 'Update Node Parameters');
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        if (JSON.stringify(node.data.params) === JSON.stringify(newParams)) return;

        // Check if this node has an existing result
        const hasExistingResult = node.data.result &&
            (node.type === 'output_result' || node.type === 'ai_generator');

        // Clear existing timer for this node
        const existingTimer = pendingRegenerationsRef.current[nodeId];
        if (existingTimer) {
            clearTimeout(existingTimer);
            delete pendingRegenerationsRef.current[nodeId];
        }

        // --- PRIORITY LOGIC HELPERS ---
        const isVisualChange = (
            newParams.visualLightData !== node.data.params.visualLightData ||
            newParams.visualCameraData !== node.data.params.visualCameraData
        );

        // SIMPLE IN-PLACE UPDATE
        // All parameter changes update the node directly without forking.
        // PRIORITY LOGIC: SIDE EFFECTS
        let nodesToUpdate = [{
            id: nodeId,
            data: {
                ...node.data,
                params: newParams,
                status: hasExistingResult ? 'pending_changes' as const : 'idle' as const
            }
        }];

        // Case A: FEEDBACK CHANNEL (Output -> Generator)
        if (node.type === 'output_result' && isVisualChange) {
            const incomingEdge = edges.find(e => e.target === nodeId);
            if (incomingEdge) {
                const generator = nodes.find(n => n.id === incomingEdge.source && n.type === 'ai_generator');
                if (generator) {
                    nodesToUpdate.push({
                        id: generator.id,
                        data: {
                            ...generator.data,
                            status: 'idle', // Force re-run
                            params: {
                                ...generator.data.params,
                                visualLightData: newParams.visualLightData ?? generator.data.params.visualLightData,
                                visualCameraData: newParams.visualCameraData ?? generator.data.params.visualCameraData
                            }
                        }
                    });
                }
            }
        }

        // Case B: INPUT TRIGGER (Input -> Generator Reset)
        if (node.type === 'image_source' && isVisualChange) {
            const outgoingEdges = edges.filter(e => e.source === nodeId);
            outgoingEdges.forEach(edge => {
                const generator = nodes.find(n => n.id === edge.target && n.type === 'ai_generator');
                if (generator) {
                    nodesToUpdate.push({
                        id: generator.id,
                        data: {
                            ...generator.data,
                            status: 'idle', // Force re-run
                            params: {
                                ...generator.data.params,
                                visualLightData: null,
                                visualCameraData: null
                            }
                        }
                    });
                }
            });
        }

        // Apply all updates
        setNodes(currentNodes => {
            const updatedNodes = currentNodes.map(n => {
                const update = nodesToUpdate.find(u => u.id === n.id);
                return update ? { ...n, data: update.data } : n;
            });

            // Mark downstream dirty for the primary node
            return markDownstreamDirty(nodeId, updatedNodes, edges);
        });

        // DISABLED: Automatic confirmation dialogue
        // The user should manually click the regenerate button instead
        // This prevents unwanted regeneration when just adjusting parameters
        /*
        if (hasExistingResult) {
            const timer = setTimeout(() => {
                setConfirmationDialogue({
                    isOpen: true,
                    nodeId: nodeId,
                    nodeName: node.data.label || node.type
                });
     
                delete pendingRegenerationsRef.current[nodeId];
            }, 4000);
     
            pendingRegenerationsRef.current[nodeId] = timer;
        }
        */
    }, [nodes, edges, markDownstreamDirty]);

    const updateNodeStatus = useCallback((id: string, status: string, result?: any, error?: string) => {
        setNodes(nds => nds.map(n => {
            if (n.id === id) {
                return { ...n, data: { ...n.data, status: status as any, result: result !== undefined ? result : n.data.result, error: error } };
            }
            return n;
        }));
    }, []);

    const deleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
        setSelectedNodeIds(prev => prev.filter(i => i !== id));
    };



    const handleCreateGroup = useCallback(() => {
        if (selectedNodeIds.length === 0) return;
        pushToUndo(nodes, edges, 'Create Group');

        const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedNodes.forEach(n => {
            const w = n.data.width || (n.type === 'mask_editor' || n.type === 'group' ? 400 : 256);
            const h = n.data.height || (n.type === 'mask_editor' || n.type === 'group' ? 400 : 300);
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + w);
            maxY = Math.max(maxY, n.position.y + h);
        });
        const padding = 50;
        const groupNode: Node = {
            id: `g-${Date.now()}`,
            type: 'group',
            position: { x: minX - padding, y: minY - padding },
            data: {
                label: 'New Group',
                params: {
                    color: '#ffffff',
                    members: selectedNodeIds,
                    isCollapsed: false,
                    expandedHeight: (maxY - minY) + (padding * 2)
                },
                status: 'idle',
                width: (maxX - minX) + (padding * 2),
                height: (maxY - minY) + (padding * 2)
            }
        };

        // Mark child nodes as part of group (removed macro logic)
        setNodes(prev => {
            const updatedNodes = prev.map(n => {
                if (selectedNodeIds.includes(n.id)) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            params: {
                                ...n.data.params,
                                is_part_of_macro: false // No longer part of macro
                            }
                        }
                    };
                }
                return n;
            });
            return [groupNode, ...updatedNodes];
        });

        setSelectedNodeIds([groupNode.id]);
    }, [nodes, selectedNodeIds]);

    const transferGroupToSidebar = useCallback((groupId: string) => {
        const groupNode = nodes.find(n => n.id === groupId);
        if (!groupNode) return;

        const memberIds = groupNode.data.params.members || [];
        const memberNodes = nodes.filter(n => memberIds.includes(n.id));
        const idsToDelete = [groupId, ...memberIds];
        const internalEdges = edges.filter(e => memberIds.includes(e.source) && memberIds.includes(e.target));

        // Serialize the group data
        const groupData = {
            width: groupNode.data.width,
            height: groupNode.data.height,
            nodes: memberNodes.map(n => ({
                ...n,
                position: {
                    x: n.position.x - groupNode.position.x,
                    y: n.position.y - groupNode.position.y
                }
            })),
            edges: internalEdges
        };

        // Create new component (simplified, no macroId check)
        const newComponent = {
            id: `comp-${Date.now()}`,
            label: groupNode.data.label,
            description: `${memberNodes.length} nodes. ${new Date().toLocaleTimeString()}`,
            data: groupData
        };
        setSavedComponents(prev => [...prev, newComponent]);

        // Remove nodes from canvas
        setNodes(prev => prev.filter(n => !idsToDelete.includes(n.id)));
        setEdges(prev => prev.filter(e => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)));
        setSelectedNodeIds(prev => prev.filter(id => !idsToDelete.includes(id)));
    }, [nodes, edges, savedComponents]);

    const restoreGroupFromSidebar = useCallback((componentId: string, dropPosition: { x: number, y: number }) => {
        const component = savedComponents.find(c => c.id === componentId);
        if (!component) return;

        const idMap: Record<string, string> = {};
        const newGroupId = `g-${Date.now()}`;

        component.data.nodes.forEach((n: Node) => {
            idMap[n.id] = `n-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        });

        const newGroupNode: Node = {
            id: newGroupId,
            type: 'group',
            position: dropPosition,
            data: {
                label: component.label,
                width: component.data.width,
                height: component.data.height,
                params: {
                    members: component.data.nodes.map((n: Node) => idMap[n.id]),
                    color: '#ffffff',
                    isCollapsed: false,
                    expandedHeight: component.data.height
                },
                status: 'idle'
            }
        };

        const newMemberNodes = component.data.nodes.map((n: Node) => ({
            ...n,
            id: idMap[n.id],
            position: {
                x: dropPosition.x + n.position.x,
                y: dropPosition.y + n.position.y
            },
            data: {
                ...n.data,
                status: 'idle',
                result: n.data.result,
                params: {
                    ...n.data.params,
                    is_part_of_macro: false
                }
            }
        }));

        const newMemberEdges = component.data.edges.map((edge: Edge) => ({
            id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            source: idMap[edge.source],
            target: idMap[edge.target],
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle
        }));

        setNodes(prev => [...prev, newGroupNode, ...newMemberNodes]);
        setEdges(prev => [...prev, ...newMemberEdges]);
        setSelectedNodeIds([newGroupId]);
    }, [savedComponents]);

    const handleRestoreCentered = useCallback((componentId: string) => {
        const containerW = window.innerWidth;
        const containerH = window.innerHeight;
        const worldX = (containerW / 2 - pan.x) / zoom - 200;
        const worldY = (containerH / 2 - pan.y) / zoom - 200;
        restoreGroupFromSidebar(componentId, { x: worldX, y: worldY });
    }, [pan, zoom, restoreGroupFromSidebar]);

    const handleToggleGroup = useCallback((groupId: string) => {
        pushToUndo(nodes, edges, 'Toggle Group');
        setNodes(prev => {
            const groupNode = prev.find(n => n.id === groupId);
            if (!groupNode) return prev;
            const isCollapsing = !groupNode.data.params.isCollapsed;
            const memberIds = groupNode.data.params.members || [];
            return prev.map(n => {
                if (n.id === groupId) {
                    const memberIds = n.data.params.members || [];
                    const collapsedHeight = 60 + (memberIds.length * 24);
                    return { 
                        ...n, 
                        data: { 
                            ...n.data, 
                            params: { 
                                ...n.data.params, 
                                isCollapsed: isCollapsing, 
                                expandedHeight: isCollapsing ? n.data.height : n.data.params.expandedHeight 
                            }, 
                            height: isCollapsing ? collapsedHeight : (n.data.params.expandedHeight || n.data.height) 
                        } 
                    };
                }
                if (memberIds.includes(n.id)) return { ...n, hidden: isCollapsing };
                return n;
            });
        });
    }, []);

    const handleLoopback = (imageUrl: string, sourceNodeId?: string) => {
        if (!imageUrl) return;
        pushToUndo(nodes, edges, 'Loopback Image');
        let pos = { x: 0, y: 0 };
        if (sourceNodeId) {
            const sourceNode = nodes.find(n => n.id === sourceNodeId);
            if (sourceNode) pos = { x: sourceNode.position.x + 40, y: sourceNode.position.y + 40 };
        } else {
            const viewportCenterX = (window.innerWidth - 64) / 2 + 64;
            const viewportCenterY = window.innerHeight / 2;
            pos = { x: (viewportCenterX - pan.x) / zoom, y: (viewportCenterY - pan.y) / zoom };
        }
        const newNode: Node = {
            id: `n-${Date.now()}`,
            type: 'image_source',
            position: pos,
            data: { label: 'Iterated Input', params: { image: imageUrl, role: 'MAIN' }, status: 'idle' }
        };
        setNodes(prev => [...prev, newNode]);
    };

    const handleExportImage = useCallback(async (imageUrl: string) => {
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
        const newImage = {
            id: `img-${Date.now()}`,
            url: imageUrl,
            date: dateStr,
            timestamp: Date.now()
        };
        
        setExportedImages(prev => [newImage, ...prev]);
        
        // Save to persistent storage
        try {
            await StorageService.saveImage(newImage);
        } catch (error) {
            console.error("Failed to save image to storage:", error);
        }
    }, []);

    const handleAddNode = (type: string) => {
        const def = NODE_REGISTRY[type];
        if (!def) return;
        pushToUndo(nodes, edges, `Add ${def.label}`);
        const viewportCenterX = (window.innerWidth - 64) / 2 + 64;
        const viewportCenterY = window.innerHeight / 2;
        const worldX = (viewportCenterX - pan.x) / zoom;
        const worldY = (viewportCenterY - pan.y) / zoom;
        let activeParams = { ...def.defaultParams };
        if (type === 'ai_generator') {
            const masterNode = nodes.find(n => n.id === 'n-2');
            if (masterNode) activeParams = JSON.parse(JSON.stringify(masterNode.data.params));
        }
        const newNode: Node = { id: `n-${Date.now()}`, type, position: { x: worldX - 128, y: worldY - 50 }, data: { label: def.label, params: activeParams, status: 'idle' } };
        setNodes(prev => [...prev, newNode]);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        pushToUndo(nodes, edges, 'Drop Node');
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = { x: (x - pan.x) / zoom, y: (y - pan.y) / zoom };
        const componentId = e.dataTransfer.getData('application/reactflow-component');
        if (componentId) {
            restoreGroupFromSidebar(componentId, worldPos);
            return;
        }
        const type = e.dataTransfer.getData('application/reactflow');
        if (!type || !NODE_REGISTRY[type]) return;
        const def = NODE_REGISTRY[type];
        const newNode: Node = { id: `n-${Date.now()}`, type, position: worldPos, data: { label: def.label, params: { ...def.defaultParams }, status: 'idle' } };
        setNodes(prev => [...prev, newNode]);
    };

    const handleExecute = useCallback(async (targetNodeId?: string) => {
        // If targetNodeId is provided, only regenerate that specific node
        // Otherwise, regenerate all nodes (explicit user action)

        const executionContext = {
            targetNodeIds: targetNodeId ? [targetNodeId] : undefined,
            explicitTrigger: true  // User clicked Execute button
        };


        // DISABLED: Forced status reset bypasses flow isolation logic
        // Let nodeEngine.ts decide based on input hash comparison
        /*
        setNodes(currentNodes => currentNodes.map(n =>
            n.type === 'output_result' && (!targetNodeId || n.id === targetNodeId)
                ? { ...n, data: { ...n.data, status: 'idle' } }
                : n
        ));
        */

        // Only reset status if explicitly targeting a specific node
        if (targetNodeId) {
            setNodes(currentNodes => currentNodes.map(n =>
                n.id === targetNodeId
                    ? { ...n, data: { ...n.data, status: 'idle' } }
                    : n
            ));
        }

        // Small delay to ensure state update completes
        await new Promise(resolve => setTimeout(resolve, 50));

        setIsExecuting(true);
        try {
            await executeGraph(nodes, edges, updateNodeStatus, undefined, executionContext);
        } catch (error) {
            console.error("Execution failed:", error);
        } finally {
            setIsExecuting(false);
        }
    }, [nodes, edges, updateNodeStatus]);

    const handleElementAction = useCallback((action?: string) => {
        if (!action || action === 'NONE') return;

        switch (action) {
            case 'EXECUTE_FLOW': handleExecute(); break;
            case 'TOGGLE_LIBRARY': setIsLibraryOpen(prev => !prev); break;
            case 'OPEN_SETTINGS': setIsSettingsOpen(true); break;
        }
    }, [handleExecute]);

    useEffect(() => {
        if (!autoRunEnabled) return;
        // Exclude output_result and ai_generator nodes from auto-run trigger to prevent unwanted regeneration
        const hasDirtyNodes = nodes.some(n =>
            n.type !== 'output_result' &&
            n.type !== 'ai_generator' &&
            (n.data.status === 'dirty' || (n.data.status === 'idle' && !n.data.result && edges.some(e => e.target === n.id)))
        );
        if (hasDirtyNodes) {
            if (autoRunTimeoutRef.current) clearTimeout(autoRunTimeoutRef.current);
            autoRunTimeoutRef.current = setTimeout(() => { handleExecute(); }, 800);
        }
        return () => { if (autoRunTimeoutRef.current) clearTimeout(autoRunTimeoutRef.current); };
    }, [nodes, edges, autoRunEnabled, handleExecute]);

    // --- Node Interaction ---
    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        if (isEditorOpen) return; // Safety gate: Disable node selection when editor is open
        e.stopPropagation(); // Prevent React Flow's default drag behavior if we're handling selection
        if (e.shiftKey) {
            setSelectedNodeIds(prev => prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]);
        } else {
            if (!selectedNodeIds.includes(id)) setSelectedNodeIds([id]);
        }
    };

    const handleCompareNode = useCallback((nodeId: string) => {
        setComparisonState(prev => {
            // Click 1: Select Base
            if (!prev.baseNodeId || prev.baseNodeId === nodeId) {
                // Toggle off if clicking same node, or set as base
                return {
                    isOpen: false,
                    baseNodeId: prev.baseNodeId === nodeId ? null : nodeId,
                    targetNodeId: null
                };
            }

            // Click 2: Select Target and Launch
            return {
                isOpen: true,
                baseNodeId: prev.baseNodeId,
                targetNodeId: nodeId
            };
        });
    }, []);

    const handleCloseComparison = () => {
        setComparisonState(prev => ({ ...prev, isOpen: false, targetNodeId: null }));
        // Keep baseNodeId? User might want to compare against same base again. 
        // Let's keep it for smoother workflow, or clear it if "strictly manual" implies full reset.
        // For now, let's clear to be safe and explicit.
        setComparisonState({ isOpen: false, baseNodeId: null, targetNodeId: null });
    };

    const handleSaveComparison = () => {
        if (comparisonState.baseNodeId && comparisonState.targetNodeId) {
            createSnapshot(`Comparison: ${nodes.find(n => n.id === comparisonState.baseNodeId)?.data.label} vs ${nodes.find(n => n.id === comparisonState.targetNodeId)?.data.label}`);
            handleCloseComparison();
        }
    };

    const handleRegenerateNode = useCallback((nodeId: string) => {
        handleExecute(nodeId);
    }, [handleExecute]);

    const handleConfirmRegenerate = useCallback(() => {
        if (confirmationDialogue.nodeId) {
            // Reset status to idle and trigger regeneration
            setNodes(currentNodes => currentNodes.map(n =>
                n.id === confirmationDialogue.nodeId
                    ? { ...n, data: { ...n.data, status: 'idle' } }
                    : n
            ));

            // Trigger regeneration
            handleExecute(confirmationDialogue.nodeId);
        }

        setConfirmationDialogue({ isOpen: false, nodeId: null, nodeName: null });
    }, [confirmationDialogue, handleExecute]);

    const handleKeepExisting = useCallback(() => {
        // Keep the node in pending_changes state
        // User can manually regenerate later if needed
        setConfirmationDialogue({ isOpen: false, nodeId: null, nodeName: null });
    }, []);

    const handleToolbarViewChange = useCallback((view: ToolbarView) => {
        if (view === 'ACTIVITY') {
            if (viewMode === 'HISTORY') {
                setViewMode('EDITOR');
            } else {
                // Open Activity Panel instead of full screen history
                setViewMode('EDITOR');
                setActiveLibraryView('ACTIVITY');
                setIsLibraryOpen(true);
            }
            return;
        }

        if (isLibraryOpen && activeLibraryView === view) {
            setIsLibraryOpen(false);
        } else {
            setViewMode('EDITOR');
            setActiveLibraryView(view);
            setIsLibraryOpen(true);
        }
    }, [isLibraryOpen, activeLibraryView, viewMode]);

    return (
        <div className="w-full h-screen bg-black text-white flex overflow-hidden font-sans selection:bg-fashion-accent selection:text-black">
            {/* COMPARISON MODAL */}
            {comparisonState.isOpen && comparisonState.baseNodeId && comparisonState.targetNodeId && (
                <ComparisonViewModal
                    imageA={nodes.find(n => n.id === comparisonState.baseNodeId)?.data.result || nodes.find(n => n.id === comparisonState.baseNodeId)?.data.params.image || ''}
                    imageB={nodes.find(n => n.id === comparisonState.targetNodeId)?.data.result || nodes.find(n => n.id === comparisonState.targetNodeId)?.data.params.image || ''}
                    labelA={nodes.find(n => n.id === comparisonState.baseNodeId)?.data.label}
                    labelB={nodes.find(n => n.id === comparisonState.targetNodeId)?.data.label}
                    onClose={handleCloseComparison}
                    onSave={handleSaveComparison}
                />
            )}

            {/* REGENERATION CONFIRMATION DIALOGUE */}
            {confirmationDialogue.isOpen && confirmationDialogue.nodeId && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in">
                    <div className="bg-[#1e1e1e] border-2 border-fashion-accent rounded-lg p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-3">
                            Обнаружены изменения
                        </h3>
                        <p className="text-sm text-gray-300 mb-6">
                            Обнаружены изменения во входе узла <span className="text-fashion-accent font-bold">{confirmationDialogue.nodeName}</span>,
                            но у этого потока есть готовый результат. Хотите ли вы запустить регенерацию и заменить уже созданное изображение?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleKeepExisting}
                                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
                            >
                                Нет, оставить как есть
                            </button>
                            <button
                                onClick={handleConfirmRegenerate}
                                className="flex-1 px-4 py-2 bg-fashion-accent hover:bg-white/10 text-white border border-white/20 font-bold rounded-md transition-colors"
                            >
                                Да, регенерировать
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ProjectSettings
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                projectName={projectName}
                onProjectNameChange={setProjectName}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                shareRole={shareRole}
                onShareRoleChange={setShareRole}
            />

            <main className="flex-1 relative flex flex-col h-full">
                <div className="flex-1 relative overflow-hidden">
                    {viewMode === 'EDITOR' ? (
                        <div
                            className="w-full h-full transition-all duration-300"
                            style={{ pointerEvents: isEditorOpen ? 'none' : 'auto' }}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        >
                            <GraphCanvas
                                nodes={nodes}
                                edges={edges}
                                setNodes={setNodes}
                                setEdges={setEdges}
                                selectedNodeIds={selectedNodeIds}
                                setSelectedNodeIds={setSelectedNodeIds}
                                setZoom={setZoom}
                                setPan={setPan}
                                // Disable interactions for Viewers
                                onNodeMouseDown={isEditorOpen ? undefined : handleNodeMouseDown}
                                onUpdateNodeData={updateNodeData}
                                onLoopback={canPerform('EDIT_NODES') ? handleLoopback : undefined}
                                onToggleGroup={canPerform('EDIT_NODES') ? handleToggleGroup : undefined}
                                onSaveGroup={canPerform('EDIT_NODES') ? transferGroupToSidebar : undefined}
                                onRegenerateNode={canPerform('EXECUTE_FLOW') ? handleRegenerateNode : undefined}
                                onDeleteNodes={canPerform('EDIT_NODES') ? deleteSelectedNodes : undefined}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                onCopyNodes={handleCopy}
                                onCutNodes={handleCut}
                                onPasteNodes={handlePaste}
                                onPushHistory={pushToUndo}
                                onCompare={(nodeId) => {
                                    setComparisonState({
                                        isOpen: true,
                                        baseNodeId: nodeId,
                                        targetNodeId: null
                                    });
                                }}
                                onExportImage={handleExportImage}
                                onEditorToggle={setIsEditorOpen}
                                isEditorOpen={isEditorOpen}
                                zoom={zoom}
                                pan={pan}
                            />

                            {/* Empty State / Onboarding Overlay */}
                            {nodes.length === 0 && !hasStartedWork && (
                                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-black/40 animate-in fade-in duration-500">
                                    <button
                                        onDoubleClick={handleStartWork}
                                        className="pointer-events-auto flex items-center gap-2 px-4 py-1.5 bg-[#111] border border-white/10 rounded-full shadow-2xl hover:bg-[#1a1a1a] hover:border-white/20 hover:scale-105 transition-all group select-none"
                                    >
                                        <div className="relative flex items-center justify-center w-6 h-6 bg-white/5 rounded-full border border-white/10 group-hover:bg-white/10 transition-colors">
                                            <MousePointerClick className="w-3 h-3 text-white/80 group-hover:text-white transition-colors" />
                                        </div>
                                        <span className="text-xs font-medium text-white/90 tracking-wide group-hover:text-white transition-colors">Double click to start work</span>
                                    </button>
                                </div>
                            )}

                            {/* Selection Toolbar */}
                            {selectedNodeIds.length > 0 && (
                                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-[#1e1e1e] border border-[#333] p-2 rounded-lg shadow-2xl z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
                                    <div className="px-2 text-xs font-medium text-gray-400 border-r border-gray-700 mr-1">
                                        {selectedNodeIds.length} selected
                                    </div>
                                    <button onClick={handleCreateGroup} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-semibold transition-colors">
                                        <Box className="w-3.5 h-3.5" /> Group
                                    </button>
                                    <button onClick={deleteSelectedNodes} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/30 rounded text-xs font-semibold transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                </div>
                            )}

                            {/* Repositioned Zoom Controls (2) */}
                            <div className="absolute bottom-6 left-6 flex flex-col gap-2 pointer-events-auto">
                                <div className="flex flex-col bg-black/40 backdrop-blur-md border border-white/10 p-1.5 rounded-xl shadow-xl">
                                    <button 
                                        onClick={() => {
                                            const s = 1.2;
                                            const newZoom = Math.min(zoom * s, 20);
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const worldX = (centerX - pan.x) / zoom;
                                            const worldY = (centerY - pan.y) / zoom;
                                            const newPanX = centerX - worldX * newZoom;
                                            const newPanY = centerY - worldY * newZoom;
                                            setZoom(newZoom);
                                            setPan({ x: newPanX, y: newPanY });
                                        }} 
                                        className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
                                    >
                                        <ZoomIn className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const s = 0.8;
                                            const newZoom = Math.max(zoom * s, 0.05);
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const worldX = (centerX - pan.x) / zoom;
                                            const worldY = (centerY - pan.y) / zoom;
                                            const newPanX = centerX - worldX * newZoom;
                                            const newPanY = centerY - worldY * newZoom;
                                            setZoom(newZoom);
                                            setPan({ x: newPanX, y: newPanY });
                                        }} 
                                        className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
                                    >
                                        <ZoomOut className="w-4 h-4" />
                                    </button>
                                    <div className="h-px bg-white/10 my-1 mx-1.5"></div>
                                    <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"><Maximize className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <SpatialHistoryView
                            history={historyNodes}
                            currentHistoryId={currentHistoryId}
                            recentSnapshotIds={recentSnapshotIds}
                            onFork={handleForkHistory}
                            onLoad={loadHistoryState}
                            onUpdatePosition={updateHistoryPosition}
                            onDelete={deleteHistoryNode}
                            onTogglePin={handleTogglePin}
                            checkArchiveStatus={checkArchiveStatus}
                        />
                    )}
                </div>
            </main>

            {/* Floating UI Elements */}
            <div className="fixed inset-0 pointer-events-none z-50">
                {/* Top Left: Settings (Only for Admin/Constructor) */}
                {/* Top Left: Settings (Only for Admin/Constructor) */}
                {canPerform('CHANGE_SETTINGS') && (
                    <button
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className="absolute top-6 left-6 p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white/60 hover:text-white hover:bg-black/60 transition-all pointer-events-auto shadow-xl"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                )}



                {/* Top Center: View Toggle (1) */}
                {/* Top Center: View Toggle (1) */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
                    <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-1 shadow-xl">
                        <button
                            onClick={() => setViewMode('EDITOR')}
                            className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'EDITOR' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                        >
                            <Box className="w-3.5 h-3.5" /> Editor
                        </button>
                        <button
                            onClick={() => setViewMode('HISTORY')}
                            className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'HISTORY' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                        >
                            <Map className="w-3.5 h-3.5" /> Map
                        </button>
                    </div>
                </div>

                {/* Top Right: User & Actions */}
                <div className="absolute top-6 right-6 flex items-center gap-3">
                    {/* User Profile */}
                    <div className="relative" ref={profileMenuRef}>
                        <button 
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className={`p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full transition-all shadow-xl pointer-events-auto ${isProfileMenuOpen ? 'text-white bg-black/60 border-white/30' : 'text-white/60 hover:text-white hover:bg-black/60'}`}
                        >
                            <User className="w-5 h-5" />
                        </button>

                        {/* Profile Dropdown Menu */}
                        {isProfileMenuOpen && (
                            <div className="absolute top-14 right-0 w-64 bg-black/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 z-[100]">
                                <h3 className="text-white font-bold mb-6 px-2">Profile info</h3>
                                <div className="flex flex-col gap-3">
                                    <button className="w-full py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-white text-sm text-left transition-all">
                                        User name
                                    </button>
                                    <button className="w-full py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-white text-sm text-left transition-all">
                                        Pricing
                                    </button>
                                    <button className="w-full py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-white text-sm text-left transition-all">
                                        Send a feedback
                                    </button>
                                    <button className="w-full py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-white text-sm text-left transition-all mt-2">
                                        Log out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {viewMode === 'EDITOR' && (
                        <>
                            <button
                                onClick={() => handleExecute()}
                                disabled={isExecuting || !canPerform('EXECUTE_FLOW')}
                                className={`p-3 rounded-full shadow-xl flex items-center justify-center transition-all pointer-events-auto ${isExecuting ? 'bg-white/10 text-white/40 cursor-wait' : !canPerform('EXECUTE_FLOW') ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-fashion-accent text-white border border-white/20 hover:bg-white/10 hover:scale-[1.02] active:scale-[0.98]'}`}
                                title={isExecuting ? 'Running...' : 'Execute Flow'}
                            >
                                <Play className="w-5 h-5 fill-current" />
                            </button>

                            <button
                                onClick={() => setAutoRunEnabled(!autoRunEnabled)}
                                className={`p-3 bg-black/40 backdrop-blur-md border rounded-full shadow-xl flex items-center justify-center transition-all pointer-events-auto ${autoRunEnabled ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'border-white/10 text-white/40 hover:text-white hover:bg-black/60'}`}
                                title="Auto-Run"
                            >
                                <RefreshCw className={`w-5 h-5 ${autoRunEnabled ? 'animate-spin-slow' : ''}`} />
                            </button>

                            <button
                                onClick={() => createSnapshot(`Manual Save ${new Date().toLocaleTimeString()}`)}
                                className="p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 text-white/60 hover:text-white border border-white/10 rounded-full shadow-xl transition-all flex items-center justify-center pointer-events-auto"
                                title="Snapshot Current State"
                            >
                                <Camera className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Left Side: 1K Label (Moved with zoom controls) */}
                {/* Left Side: 1K Label (Moved with zoom controls) */}
                <div className="absolute bottom-40 left-6 pointer-events-auto">
                    <div className={`px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-[9px] font-bold text-white/40 tracking-widest pointer-events-auto shadow-xl cursor-default`}>
                        1K
                    </div>
                </div>

                {/* Right Side: Plus Button (3) & Zoom % */}
                <div className="absolute bottom-20 right-6 pointer-events-auto">
                    {canPerform('EDIT_NODES') ? (
                        <button
                            onClick={() => {
                                if (!isLibraryOpen) {
                                    setIsLibraryOpen(true);
                                    setActiveLibraryView('NODES');
                                } else if (activeLibraryView !== 'NODES') {
                                    setActiveLibraryView('NODES');
                                } else {
                                    setIsLibraryOpen(false);
                                }
                            }}
                            className="p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white/60 hover:text-white hover:bg-black/60 transition-all shadow-xl pointer-events-auto"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    ) : <div />}
                </div>

                <div className="absolute bottom-6 right-6 pointer-events-auto">
                    <div className="w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-[9px] font-bold text-white/40 shadow-xl pointer-events-auto">
                        {Math.round(zoom * 100)}%
                    </div>
                </div>


            </div>



            {/* Floating Library Panel */}
            <FloatingPanel
                isOpen={isLibraryOpen}
                activeView={activeLibraryView}
                onViewChange={handleToolbarViewChange}
                onAddNode={handleAddNode}
                savedComponents={savedComponents}
                onRestoreComponent={handleRestoreCentered}
                isExecuting={isExecuting}
                onToggleExpand={() => {
                    if (isLibraryOpen) {
                        setIsLibraryOpen(false);
                    } else {
                        setIsToolbarExpanded(!isToolbarExpanded);
                    }
                }}
                isExpanded={isToolbarExpanded}
                exportedImages={exportedImages}
                activityLog={activityLog}
                onOpenSpatialHistory={() => {
                    setIsLibraryOpen(false);
                    setViewMode('HISTORY');
                }}
            />

            {/* Default Toolbar (when panel is closed) */}
            {!isLibraryOpen && (
                <FloatingActionButton
                    isExpanded={isToolbarExpanded}
                    onToggleExpand={() => setIsToolbarExpanded(!isToolbarExpanded)}
                    onViewChange={handleToolbarViewChange}
                    activeView={activeLibraryView}
                    isLibraryOpen={isLibraryOpen}
                />
            )}


        </div>
    );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
};

export default App;
