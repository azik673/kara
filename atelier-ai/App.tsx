
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GraphCanvas } from './components/GraphCanvas';
import { LibraryPanel, InspectorPanel } from './components/Panels';
import { SpatialHistoryView } from './components/SpatialHistoryView';
import { Node, Edge, NodeStatus, Port, HistoryState, ViewMode } from './types';
import { Play, ZoomIn, ZoomOut, Maximize, RefreshCw, Box, Trash2, Sparkles, X, Map, GitBranch, Camera } from 'lucide-react';
import { executeGraph, NODE_REGISTRY } from './services/nodeEngine';

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

import { ComparisonViewModal } from './components/ComparisonViewModal';

const AppContent: React.FC = () => {
    // --- CORE STATE ---
    const [viewMode, setViewMode] = useState<ViewMode>('EDITOR');
    const [comparisonState, setComparisonState] = useState<{
        isOpen: boolean;
        baseNodeId: string | null;
        targetNodeId: string | null;
    }>({ isOpen: false, baseNodeId: null, targetNodeId: null });

    const [nodes, setNodes] = useState<Node[]>([
        // Initial example graph - AI generation is now invisible
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

    const [edges, setEdges] = useState<Edge[]>([
        // Direct connections - AI generation happens invisibly
        { id: 'e-0', source: 'n-0', sourceHandle: 'image', target: 'n-3', targetHandle: 'main_subject' },
        { id: 'e-ref', source: 'n-4', sourceHandle: 'image', target: 'n-3', targetHandle: 'ref_style' },
        { id: 'e-1', source: 'n-1', sourceHandle: 'text', target: 'n-3', targetHandle: 'prompt_in' }
    ]);

    const [historyNodes, setHistoryNodes] = useState<HistoryState[]>([]);
    const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [savedComponents, setSavedComponents] = useState<Array<{
        id: string;
        macroId: string;
        label: string;
        description: string;
        data: any;
    }>>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const [autoRunEnabled, setAutoRunEnabled] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [suggestedMacro, setSuggestedMacro] = useState<string[] | null>(null);
    const [recentSnapshotIds, setRecentSnapshotIds] = useState<string[]>([]);  // Track last 3 snapshots for active path filtering
    const autoRunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // --- AUTO-MACRO SYNTHESIS LOGIC (Existing) ---
    const detectPatterns = useCallback(() => {
        if (nodes.length < 3) return;
        if (selectedNodeIds.length >= 3) {
            const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
            let connectionCount = 0;
            edges.forEach(e => {
                if (selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target)) {
                    connectionCount++;
                }
            });
            if (connectionCount >= selectedNodeIds.length - 1) {
                setSuggestedMacro(selectedNodeIds);
                return;
            }
        }
        setSuggestedMacro(null);
    }, [nodes, edges, selectedNodeIds]);

    useEffect(() => {
        detectPatterns();
    }, [selectedNodeIds, detectPatterns]);

    const synthesizeMacro = useCallback(() => {
        if (!suggestedMacro || suggestedMacro.length === 0) return;
        const internalNodes = nodes.filter(n => suggestedMacro.includes(n.id));
        const internalEdges = edges.filter(e => suggestedMacro.includes(e.source) && suggestedMacro.includes(e.target));
        let minX = Infinity, minY = Infinity;
        internalNodes.forEach(n => {
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
        });

        const exposedInputs: Port[] = [];
        const exposedOutputs: Port[] = [];

        internalNodes.forEach(n => {
            const def = NODE_REGISTRY[n.type];
            if (!def) return;
            def.inputs.forEach(port => {
                const isInternal = internalEdges.some(e => e.target === n.id && e.targetHandle === port.id);
                if (isInternal) return;
                const hasParamValue = (port.type === 'text' && n.data.params.text) ||
                    (port.type === 'image' && n.data.params.image);
                if (!hasParamValue) {
                    exposedInputs.push({
                        id: `${n.id}__${port.id}`,
                        label: `${n.data.label} (${port.label})`,
                        type: port.type
                    });
                }
            });
            def.outputs.forEach(port => {
                const isConnectedInternally = internalEdges.some(e => e.source === n.id && e.sourceHandle === port.id);
                if (!isConnectedInternally || n.type === 'output_result' || n.type === 'ai_generator') {
                    exposedOutputs.push({
                        id: `${n.id}__${port.id}`,
                        label: n.type === 'output_result' ? 'Final Result' : `${n.data.label} Out`,
                        type: port.type
                    });
                }
            });
        });

        const macroNode: Node = {
            id: `macro-${Date.now()}`,
            type: 'macro',
            position: { x: minX, y: minY },
            data: {
                label: 'Smart Macro',
                params: { internalNodes, internalEdges },
                status: 'idle',
                width: 300,
                height: 200,
                dynamicInputs: exposedInputs,
                dynamicOutputs: exposedOutputs
            }
        };
        setNodes(prev => [...prev.filter(n => !suggestedMacro.includes(n.id)), macroNode]);
        setEdges(prev => [...prev.filter(e => !suggestedMacro.includes(e.source) && !suggestedMacro.includes(e.target))]);
        setSuggestedMacro(null);
        setSelectedNodeIds([macroNode.id]);
    }, [nodes, edges, suggestedMacro]);

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
                newNodes[nodeIndex] = { ...newNodes[nodeIndex], data: { ...newNodes[nodeIndex].data, status: 'dirty', error: undefined } };
            }
            const outgoingEdges = currentEdges.filter(e => e.source === currentId);
            outgoingEdges.forEach(e => stack.push(e.target));
        }
        return newNodes;
    }, []);

    const updateNodeData = useCallback((id: string, newData: any) => {
        setNodes(currentNodes => {
            const updatedNodes = currentNodes.map(n => n.id === id ? { ...n, data: newData } : n);
            if (newData.params) {
                return markDownstreamDirty(id, updatedNodes, edges);
            }
            return updatedNodes;
        });
    }, [edges, markDownstreamDirty]);

    /**
     * NON-DESTRUCTIVE PROCEDURAL FORKING
     * Handles state changes by creating parallel branches instead of destroying history.
     */
    const handleNodeParamChange = useCallback((nodeId: string, newParams: any) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        if (JSON.stringify(node.data.params) === JSON.stringify(newParams)) return;

        // --- PRIORITY LOGIC HELPERS ---
        const isVisualChange = (
            newParams.visualLightData !== node.data.params.visualLightData ||
            newParams.visualCameraData !== node.data.params.visualCameraData
        );

        // SIMPLE IN-PLACE UPDATE
        // All parameter changes update the node directly without forking.
        // PRIORITY LOGIC: SIDE EFFECTS
        let nodesToUpdate = [{ id: nodeId, data: { ...node.data, params: newParams, status: 'idle' as const } }];

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

    const deleteSelectedNodes = useCallback(() => {
        if (selectedNodeIds.length === 0) return;
        setNodes(prev => prev.filter(n => !selectedNodeIds.includes(n.id)));
        setEdges(prev => prev.filter(e => !selectedNodeIds.includes(e.source) && !selectedNodeIds.includes(e.target)));
        setSelectedNodeIds([]);
    }, [selectedNodeIds]);

    const handleCreateGroup = useCallback(() => {
        if (selectedNodeIds.length === 0) return;

        // Generate unique MACRO_ID
        const macroId = `macro-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
                    expandedHeight: (maxY - minY) + (padding * 2),
                    macroId: macroId  // Add MACRO_ID
                },
                status: 'idle',
                width: (maxX - minX) + (padding * 2),
                height: (maxY - minY) + (padding * 2)
            }
        };

        // Mark child nodes as part of macro
        setNodes(prev => {
            const updatedNodes = prev.map(n => {
                if (selectedNodeIds.includes(n.id)) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            params: {
                                ...n.data.params,
                                is_part_of_macro: true,
                                macroId: macroId
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

        // Check if this group has a MACRO_ID
        const macroId = groupNode.data.params.macroId;

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

        if (macroId) {
            // CHECK: Does this MACRO_ID already exist in saved components?
            const existingIndex = savedComponents.findIndex(c => c.macroId === macroId);

            if (existingIndex !== -1) {
                // UPDATE EXISTING MACRO
                console.log(`🔄 Updating existing macro: ${macroId}`);
                setSavedComponents(prev => prev.map((c, idx) =>
                    idx === existingIndex ? {
                        ...c,
                        label: groupNode.data.label,
                        description: `${memberNodes.length} nodes. Updated ${new Date().toLocaleTimeString()}`,
                        data: groupData
                    } : c
                ));
            } else {
                // CREATE NEW MACRO (first time saving)
                console.log(`✨ Creating new macro: ${macroId}`);
                const newComponent = {
                    id: `comp-${Date.now()}`,
                    macroId: macroId,
                    label: groupNode.data.label,
                    description: `${memberNodes.length} nodes. ${new Date().toLocaleTimeString()}`,
                    data: groupData
                };
                setSavedComponents(prev => [...prev, newComponent]);
            }
        } else {
            // No MACRO_ID - create new (backward compatibility)
            console.log('⚠️ No MACRO_ID found, creating new component');
            const newComponent = {
                id: `comp-${Date.now()}`,
                macroId: `macro-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                label: groupNode.data.label,
                description: `${memberNodes.length} nodes. ${new Date().toLocaleTimeString()}`,
                data: groupData
            };
            setSavedComponents(prev => [...prev, newComponent]);
        }

        // Remove nodes from canvas
        setNodes(prev => prev.filter(n => !idsToDelete.includes(n.id)));
        setEdges(prev => prev.filter(e => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)));
        setSelectedNodeIds(prev => prev.filter(id => !idsToDelete.includes(id)));
    }, [nodes, edges, savedComponents]);

    const restoreGroupFromSidebar = useCallback((componentId: string, dropPosition: { x: number, y: number }) => {
        const component = savedComponents.find(c => c.id === componentId);
        if (!component) return;

        // Ensure macroId exists (backward compatibility)
        const macroId = component.macroId || `macro-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`🔄 Restoring group with MACRO_ID: ${macroId}`);

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
                    expandedHeight: component.data.height,
                    macroId: macroId  // Preserve MACRO_ID
                },
                status: 'idle'
            }
        };

        console.log(`✅ Restored group node ${newGroupId} with macroId: ${newGroupNode.data.params.macroId}`);

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
                    is_part_of_macro: true,  // Mark as part of macro
                    macroId: macroId  // Assign MACRO_ID
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
        setNodes(prev => {
            const groupNode = prev.find(n => n.id === groupId);
            if (!groupNode) return prev;
            const isCollapsing = !groupNode.data.params.isCollapsed;
            const memberIds = groupNode.data.params.members || [];
            return prev.map(n => {
                if (n.id === groupId) return { ...n, data: { ...n.data, params: { ...n.data.params, isCollapsed: isCollapsing, expandedHeight: isCollapsing ? n.data.height : n.data.params.expandedHeight }, height: isCollapsing ? 40 : (n.data.params.expandedHeight || n.data.height) } };
                if (memberIds.includes(n.id)) return { ...n, hidden: isCollapsing };
                return n;
            });
        });
    }, []);

    const handleLoopback = (imageUrl: string, sourceNodeId?: string) => {
        if (!imageUrl) return;
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

    const handleAddNode = (type: string) => {
        const def = NODE_REGISTRY[type];
        if (!def) return;
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

    const handleExecute = useCallback(async () => {
        setIsExecuting(true);
        await executeGraph(nodes, edges, updateNodeStatus);
        setIsExecuting(false);
    }, [nodes, edges, updateNodeStatus]);

    useEffect(() => {
        if (!autoRunEnabled) return;
        const hasDirtyNodes = nodes.some(n => n.data.status === 'dirty' || (n.data.status === 'idle' && !n.data.result && edges.some(e => e.target === n.id)));
        if (hasDirtyNodes) {
            if (autoRunTimeoutRef.current) clearTimeout(autoRunTimeoutRef.current);
            autoRunTimeoutRef.current = setTimeout(() => { handleExecute(); }, 800);
        }
        return () => { if (autoRunTimeoutRef.current) clearTimeout(autoRunTimeoutRef.current); };
    }, [nodes, edges, autoRunEnabled, handleExecute]);

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
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

            <LibraryPanel
                onAddNode={handleAddNode}
                savedComponents={savedComponents}
                onRestoreComponent={handleRestoreCentered}
            />

            <main className="flex-1 relative flex flex-col h-full">
                <header className="h-14 bg-[#111] border-b border-[#222] flex items-center justify-between px-6 z-10 shrink-0">
                    <div className="flex items-center space-x-4">
                        <span className="text-xs text-gray-500">Project: </span>
                        <span className="text-sm font-medium text-gray-200">Autumn Collection V2</span>
                    </div>

                    <div className="flex items-center space-x-3">
                        {/* VIEW TOGGLE */}
                        <div className="flex bg-[#0a0a0a] border border-[#222] rounded p-0.5 mr-4">
                            <button
                                onClick={() => setViewMode('EDITOR')}
                                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${viewMode === 'EDITOR' ? 'bg-[#222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Box className="w-3 h-3" /> Editor
                            </button>
                            <button
                                onClick={() => setViewMode('HISTORY')}
                                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${viewMode === 'HISTORY' ? 'bg-[#222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Map className="w-3 h-3" /> Map
                            </button>
                        </div>

                        {viewMode === 'EDITOR' && (
                            <>
                                <button
                                    onClick={() => createSnapshot(`Manual Save ${new Date().toLocaleTimeString()}`)}
                                    className="px-3 py-1.5 rounded-md flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all"
                                    title="Snapshot Current State to History"
                                >
                                    <Camera className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide">Snapshot</span>
                                </button>

                                <div className="h-4 w-px bg-gray-800 mx-2"></div>

                                <button
                                    onClick={() => setAutoRunEnabled(!autoRunEnabled)}
                                    className={`px-3 py-1.5 rounded-md flex items-center space-x-2 transition-all border ${autoRunEnabled ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'
                                        }`}
                                >
                                    <RefreshCw className={`w-3 h-3 ${autoRunEnabled ? 'animate-spin-slow' : ''}`} />
                                    <span className="text-[10px] font-bold uppercase tracking-wide">Auto-Run: {autoRunEnabled ? 'ON' : 'OFF'}</span>
                                </button>

                                <button
                                    onClick={handleExecute}
                                    disabled={isExecuting}
                                    className={`px-4 py-1.5 rounded-md flex items-center space-x-2 transition-all ${isExecuting ? 'bg-gray-700 cursor-wait' : 'bg-fashion-accent text-black hover:bg-yellow-500'
                                        }`}
                                >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span className="text-xs font-bold uppercase tracking-wide">{isExecuting ? 'Processing...' : 'Execute Flow'}</span>
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 relative overflow-hidden">
                    {viewMode === 'EDITOR' ? (
                        <div className="w-full h-full" onDragOver={handleDragOver} onDrop={handleDrop}>
                            <GraphCanvas
                                nodes={nodes}
                                edges={edges}
                                setNodes={setNodes}
                                setEdges={setEdges}
                                selectedNodeIds={selectedNodeIds}
                                setSelectedNodeIds={setSelectedNodeIds}
                                onNodeMouseDown={handleNodeMouseDown}
                                onUpdateNodeData={updateNodeData}
                                onLoopback={handleLoopback}
                                onToggleGroup={handleToggleGroup}
                                onSaveGroup={transferGroupToSidebar}
                                onCompare={handleCompareNode}
                                comparisonBaseId={comparisonState.baseNodeId}
                                zoom={zoom}
                                pan={pan}
                                setZoom={setZoom}
                                setPan={setPan}
                            />

                            {/* Zoom Controls */}
                            <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-[#1e1e1e] p-1 rounded border border-[#333] shadow-xl z-50">
                                <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="p-2 hover:bg-[#333] rounded text-gray-400 hover:text-fashion-accent"><ZoomIn className="w-4 h-4" /></button>
                                <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))} className="p-2 hover:bg-[#333] rounded text-gray-400 hover:text-fashion-accent"><ZoomOut className="w-4 h-4" /></button>
                                <div className="h-px bg-[#333] my-0.5 mx-2"></div>
                                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-[#333] rounded text-gray-400 hover:text-fashion-accent"><Maximize className="w-4 h-4" /></button>
                            </div>
                            <div className="absolute bottom-4 right-4 bg-[#1e1e1e] px-2 py-1 rounded border border-[#333] text-[10px] text-gray-500 pointer-events-none">
                                {Math.round(zoom * 100)}%
                            </div>

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

                            {/* AI Macro Suggestion */}
                            {suggestedMacro && (
                                <div className="absolute top-4 right-6 w-72 bg-[#1a1a1a] border border-fashion-accent/30 rounded-lg shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2 text-fashion-accent">
                                            <Sparkles className="w-4 h-4" />
                                            <h4 className="text-xs font-bold uppercase tracking-wider">AI Insight</h4>
                                        </div>
                                        <button onClick={() => setSuggestedMacro(null)} className="text-gray-500 hover:text-white">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                                        I've detected a linear workflow pattern ({suggestedMacro.length} nodes).
                                        Would you like to synthesize this into a single <strong>Smart Macro</strong>?
                                    </p>
                                    <button onClick={synthesizeMacro} className="w-full py-2 bg-fashion-accent text-black font-bold text-xs uppercase rounded hover:bg-yellow-500 transition-colors">
                                        Synthesize Macro
                                    </button>
                                </div>
                            )}
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

            {viewMode === 'EDITOR' && (
                <InspectorPanel
                    selectedNode={nodes.find(n => n.id === selectedNodeIds[selectedNodeIds.length - 1])}
                    nodes={nodes}
                    edges={edges}
                    updateNodeData={updateNodeData}
                    onUpdateNodeParams={handleNodeParamChange}
                    deleteNode={deleteNode}
                    onLoopback={handleLoopback}
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
