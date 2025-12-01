
import React, { useState, useEffect } from 'react';
import { Node, NodeDefinition, Edge } from '../types';
import { NODE_REGISTRY } from '../services/nodeEngine';
import { Search, X, Trash2, Play, Box, ChevronLeft, ChevronRight, MousePointerClick, Download, Maximize2, Repeat, Grid, Layers, Lock, GitBranch, History, GitCommitVertical, Settings2, Sliders, Image as ImageIcon, Type, Upload } from 'lucide-react';
import { VisualControlsPanel } from './VisualControlsPanel';

// --- LIBRARY PANEL ---
interface LibraryPanelProps {
    onAddNode: (type: string) => void;
    savedComponents?: Array<{ id: string; label: string; description: string; data?: any }>;
    onRestoreComponent?: (id: string) => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ onAddNode, savedComponents = [], onRestoreComponent }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeView, setActiveView] = useState<'NODES' | 'COMPONENTS'>('NODES');
    const [hoveredComp, setHoveredComp] = useState<{ id: string, data: any, y: number } | null>(null);
    const categories = ['input', 'generator', 'modifier', 'output'];

    const onDragStart = (event: React.DragEvent, type: string, isComponent: boolean = false) => {
        event.dataTransfer.setData(isComponent ? 'application/reactflow-component' : 'application/reactflow', type);
        event.dataTransfer.effectAllowed = 'move';
        if (isComponent) setHoveredComp(null);
    };

    return (
        <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-[#111] border-r border-[#222] flex flex-col h-full z-20 transition-all duration-300 relative`}>
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-4 bg-[#222] border border-[#333] rounded-full p-0.5 text-gray-400 hover:text-white hover:border-fashion-accent z-30 shadow-md"
            >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            <div className={`p-4 border-b border-[#222] ${isCollapsed ? 'flex justify-center' : ''}`}>
                {isCollapsed ? (
                    <span className="font-serif text-xl font-bold text-fashion-accent cursor-default">A</span>
                ) : (
                    <>
                        <h1 className="font-serif text-xl font-bold text-fashion-accent tracking-widest cursor-default">ATELIER</h1>
                        <p className="text-[10px] uppercase text-gray-500 tracking-[0.2em] whitespace-nowrap">Procedural AI</p>
                    </>
                )}
            </div>

            {!isCollapsed && (
                <div className="px-3 pt-3 pb-1">
                    <div className="flex items-center bg-[#0a0a0a] border border-[#222] rounded p-0.5">
                        <button
                            onClick={() => setActiveView('NODES')}
                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition-all ${activeView === 'NODES'
                                ? 'bg-[#1e1e1e] text-fashion-accent shadow-sm border border-[#333]'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Grid className="w-3 h-3" />
                            Nodes
                        </button>
                        <button
                            onClick={() => setActiveView('COMPONENTS')}
                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition-all ${activeView === 'COMPONENTS'
                                ? 'bg-[#1e1e1e] text-fashion-accent shadow-sm border border-[#333]'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Layers className="w-3 h-3" />
                            Saved
                        </button>
                    </div>
                </div>
            )}

            {!isCollapsed && (
                <div className="px-3 py-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-500" />
                        <input
                            placeholder={activeView === 'NODES' ? "Search nodes..." : "Search components..."}
                            className="w-full bg-[#0a0a0a] border border-[#333] rounded py-2 pl-8 pr-2 text-xs text-gray-300 focus:border-fashion-accent focus:outline-none placeholder-gray-700"
                        />
                    </div>
                </div>
            )}

            {hoveredComp && activeView === 'COMPONENTS' && !isCollapsed && (
                <div
                    className="fixed z-50 w-60 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl p-3 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-200"
                    style={{
                        left: '17rem',
                        top: Math.min(window.innerHeight - 250, Math.max(10, hoveredComp.y))
                    }}
                >
                    <div className="flex items-start justify-between mb-2 border-b border-[#333] pb-2">
                        <div>
                            <h4 className="text-sm font-bold text-fashion-accent">{hoveredComp.data.label}</h4>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                                {hoveredComp.data.data?.nodes?.length || 0} Nodes inside
                            </span>
                        </div>
                        <Layers className="w-4 h-4 text-gray-600" />
                    </div>
                    <p className="text-[10px] text-gray-400 italic mb-3 line-clamp-3">{hoveredComp.data.description}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-thin scrollbar-thumb-gray-800">
                {activeView === 'NODES' && categories.map(cat => (
                    <div key={cat} className={isCollapsed ? 'flex flex-col items-center' : ''}>
                        {!isCollapsed && <h3 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-wider">{cat}s</h3>}
                        <div className={`space-y-2 ${isCollapsed ? 'w-full flex flex-col items-center gap-2 space-y-0 mb-4' : ''}`}>
                            {Object.values(NODE_REGISTRY)
                                .filter(n => n.category === cat && n.type !== 'ai_generator') // Hide ai_generator
                                .map(def => (
                                    <div
                                        key={def.type}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, def.type)}
                                        onClick={() => onAddNode(def.type)}
                                        className={`
bg-[#1e1e1e] border border-[#333] rounded cursor-pointer hover:border-fashion-accent transition-all group relative select-none
                                ${isCollapsed ? 'p-2 w-10 h-10 flex items-center justify-center' : 'p-3'}
`}
                                        title={def.label}
                                    >
                                        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                                            {!isCollapsed && <span className="text-xs font-medium text-gray-200">{def.label}</span>}
                                            <Box className={`text-gray-600 group-hover:text-fashion-accent ${isCollapsed ? 'w-5 h-5' : 'w-3 h-3'}`} />
                                        </div>
                                        {!isCollapsed && <p className="text-[9px] text-gray-500 mt-1 leading-tight">{def.description}</p>}
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                {activeView === 'COMPONENTS' && (
                    <div className={isCollapsed ? 'flex flex-col items-center' : 'space-y-2'}>
                        {!isCollapsed && <h3 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-wider">My Library</h3>}
                        {savedComponents.length > 0 ? (
                            savedComponents.map(comp => (
                                <div
                                    key={comp.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, comp.id, true)}
                                    onClick={() => onRestoreComponent && onRestoreComponent(comp.id)}
                                    onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoveredComp({ id: comp.id, data: comp, y: rect.top });
                                    }}
                                    onMouseLeave={() => setHoveredComp(null)}
                                    className={`
bg-[#1e1e1e] border border-[#333] rounded cursor-pointer hover:border-fashion-accent transition-all group relative select-none
                                ${isCollapsed ? 'p-2 w-10 h-10 flex items-center justify-center' : 'p-3'}
`}
                                >
                                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                                        {!isCollapsed && <span className="text-xs font-medium text-gray-200">{comp.label}</span>}
                                        <Layers className={`text-fashion-accent group-hover:text-white ${isCollapsed ? 'w-5 h-5' : 'w-3 h-3'}`} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-600 gap-2">
                                <Box className="w-8 h-8 opacity-20" />
                                <span className="text-[10px] italic">No saved groups</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

// --- INSPECTOR PANEL ---
interface InspectorPanelProps {
    selectedNode: Node | undefined;
    nodes: Node[];
    edges: Edge[];
    updateNodeData: (id: string, newData: any) => void;
    onUpdateNodeParams: (id: string, newParams: any) => void;
    deleteNode: (id: string) => void;
    onLoopback: (imageUrl: string, nodeId: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ selectedNode, nodes, edges, updateNodeData, onUpdateNodeParams, deleteNode, onLoopback }) => {
    if (!selectedNode) {
        return null;
    }

    const def = NODE_REGISTRY[selectedNode.type];

    // Updated handler to call the Forking-aware parent function
    const handleParamChange = (key: string, value: any) => {
        onUpdateNodeParams(selectedNode.id, {
            ...selectedNode.data.params,
            [key]: value
        });
    };

    const handleLabelChange = (newLabel: string) => {
        updateNodeData(selectedNode.id, {
            ...selectedNode.data,
            label: newLabel
        });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                handleParamChange('image', ev.target?.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const isRoleNode = selectedNode.type === 'image_source' || selectedNode.type === 'output_result';
    const isHistoryNode = selectedNode.data.isHistory;

    return (
        <aside className={`w-72 border-l flex flex-col h-full z-20 animate-in slide-in-from-right-10 duration-200 transition-colors ${isHistoryNode ? 'bg-gray-950 border-gray-800' : 'bg-[#111] border-[#222]'}`}>
            <div className="p-4 border-b border-[#222] flex justify-between items-center">
                <div className="flex flex-col gap-1 w-full mr-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">{def?.label || 'Unknown Node'}</span>
                        {selectedNode.data.params.branch_name && (
                            <span className="flex items-center px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[8px] text-gray-300 gap-1">
                                <GitBranch className="w-2 h-2" />
                                {selectedNode.data.params.branch_name}
                            </span>
                        )}
                    </div>
                    <input
                        value={selectedNode.data.label}
                        onChange={(e) => handleLabelChange(e.target.value)}
                        className={`bg-transparent border-b border-transparent hover:border-gray-700 focus:border-fashion-accent focus:outline-none text-sm font-bold w-full ${isHistoryNode ? 'text-gray-500' : 'text-gray-200'}`}
                        placeholder="Rename Node..."
                        readOnly={isHistoryNode}
                    />
                </div>
                {!isHistoryNode && (
                    <button onClick={() => deleteNode(selectedNode.id)} className="text-red-900 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 relative">
                {isHistoryNode && (
                    <div className="absolute inset-0 bg-black/5 z-50 pointer-events-none flex items-center justify-center">
                        {/* Overlay for history nodes */}
                    </div>
                )}

                {isHistoryNode && (
                    <div className="bg-gray-900/50 border border-dashed border-gray-700 rounded p-3 flex items-start gap-3">
                        <History className="w-4 h-4 text-gray-500 mt-0.5" />
                        <div>
                            <h4 className="text-xs font-bold text-gray-400">Archived State</h4>
                            <p className="text-[10px] text-gray-500 mt-1">This node is part of a previous design branch. Modifying it will fork the current branch again.</p>
                        </div>
                    </div>
                )}

                {/* --- IMAGE SOURCE SPECIFIC --- */}
                {selectedNode.type === 'image_source' && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-gray-500">Source Image</label>
                            {selectedNode.data.params.image ? (
                                <div className="relative group rounded-lg overflow-hidden border border-gray-700 bg-black/50 aspect-square flex items-center justify-center">
                                    <img src={selectedNode.data.params.image} alt="Source" className="w-full h-full object-contain" />
                                    <button
                                        onClick={() => handleParamChange('image', null)}
                                        className="absolute top-2 right-2 bg-red-900/80 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="w-full h-32 border border-dashed border-[#333] rounded flex flex-col items-center justify-center text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors cursor-pointer bg-[#0a0a0a]"
                                    onClick={() => document.getElementById('image-upload')?.click()}
                                >
                                    <Upload className="w-6 h-6 mb-2 opacity-50" />
                                    <span className="text-[10px]">Click to Upload</span>
                                    <input
                                        id="image-upload"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => handleParamChange('image', ev.target?.result);
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-gray-500">Role Assignment</label>
                            <div className="flex bg-[#0a0a0a] p-1 rounded border border-[#333]">
                                <button
                                    onClick={() => handleParamChange('role', 'MAIN')}
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-colors ${selectedNode.data.params.role === 'MAIN' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    MAIN SUBJECT
                                </button>
                                <button
                                    onClick={() => handleParamChange('role', 'REF')}
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-colors ${selectedNode.data.params.role === 'REF' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    REF. STYLE
                                </button>
                            </div>
                        </div>

                        {/* Visual Controls for Input Correction */}
                        <VisualControlsPanel
                            lightData={selectedNode.data.params.visualLightData}
                            cameraData={selectedNode.data.params.visualCameraData}
                            onLightChange={(val) => handleParamChange('visualLightData', val)}
                            onCameraChange={(val) => handleParamChange('visualCameraData', val)}
                            onMapsGenerated={(maps) => handleParamChange('controlMaps', maps)}
                        />
                    </div>
                )}

                {/* --- HISTORY LOCK TOGGLE --- */}
                {(def?.category === 'generator' || def?.category === 'modifier') && !isHistoryNode && (
                    <div className="flex items-center justify-between p-3 bg-gray-900/50 border border-gray-800 rounded mb-4">
                        <div className="flex items-center gap-2">
                            <GitCommitVertical className={`w-4 h-4 ${selectedNode.data.params.is_committed ? 'text-fashion-accent' : 'text-gray-600'}`} />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase text-gray-300">History Lock</span>
                                <span className="text-[9px] text-gray-500">
                                    {selectedNode.data.params.is_committed ? 'Next change creates new branch' : 'Scratchpad (Overwrites)'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => handleParamChange('is_committed', !selectedNode.data.params.is_committed)}
                            className={`w-8 h-4 rounded-full transition-colors relative ${selectedNode.data.params.is_committed ? 'bg-fashion-accent' : 'bg-gray-700'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 bg-black rounded-full transition-transform shadow-sm ${selectedNode.data.params.is_committed ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-gray-500">Node ID</label>
                    <div className="text-xs text-gray-400 font-mono">{selectedNode.id}</div>
                </div>

                {/* --- ROLE SETTINGS --- */}
                {isRoleNode && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-gray-500">Assigned Role</label>
                            <div className="flex bg-[#0a0a0a] p-1 rounded border border-[#333]">
                                <button
                                    onClick={() => handleParamChange('role', 'MAIN')}
                                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${selectedNode.data.params.role === 'MAIN' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                    disabled={isHistoryNode}
                                >
                                    Main
                                </button>
                                <button
                                    onClick={() => handleParamChange('role', 'REF')}
                                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${selectedNode.data.params.role === 'REF' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                    disabled={isHistoryNode}
                                >
                                    Ref
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- OUTPUT PREVIEW SPECIFIC --- */}
                {selectedNode.type === 'output_result' && (
                    <div className="flex flex-col space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-gray-500">Result Viewer</label>
                            {selectedNode.data.result ? (
                                <div className="space-y-3">
                                    <div className="relative group rounded-lg overflow-hidden border border-gray-700 bg-black/50 aspect-square flex items-center justify-center">
                                        <img src={selectedNode.data.result} alt="Final Result" className="w-full h-full object-contain" />
                                        <button
                                            onClick={() => {
                                                const win = window.open();
                                                win?.document.write(`<body style="margin:0;background:#0a0a0a;display:flex;justify-content:center;align-items:center;height:100vh;"><img src="${selectedNode.data.result}" style="max-width:100%;max-height:100vh;box-shadow:0 0 20px rgba(0,0,0,0.5);" /></body>`);
                                            }}
                                            className="absolute top-2 right-2 bg-black/80 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-fashion-accent"
                                        >
                                            <Maximize2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <a
                                            href={selectedNode.data.result}
                                            download={`atelier-design-${Date.now()}.png`}
                                            className="flex-1 flex items-center justify-center py-3 bg-fashion-gray text-white border border-gray-600 font-bold text-[10px] uppercase tracking-widest rounded hover:bg-gray-700 transition-colors gap-2"
                                        >
                                            <Download className="w-3 h-3" />
                                            Download
                                        </a>
                                        <button
                                            onClick={() => onLoopback(selectedNode.data.result, selectedNode.id)}
                                            className="flex-1 flex items-center justify-center py-3 bg-fashion-accent text-black font-bold text-[10px] uppercase tracking-widest rounded hover:bg-yellow-500 transition-colors gap-2"
                                        >
                                            <Repeat className="w-3 h-3" />
                                            Use Input
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-48 border border-dashed border-[#333] rounded flex flex-col items-center justify-center text-gray-600 space-y-2">
                                    <Box className="w-8 h-8 opacity-20" />
                                    <span className="text-[10px]">No image generated yet</span>
                                </div>
                            )}
                        </div>

                        {/* Light Control for Output */}
                        <VisualControlsPanel
                            lightData={selectedNode.data.params.visualLightData}
                            cameraData={selectedNode.data.params.visualCameraData}
                            onLightChange={(val) => handleParamChange('visualLightData', val)}
                            onCameraChange={(val) => handleParamChange('visualCameraData', val)}
                            onMapsGenerated={(maps) => handleParamChange('controlMaps', maps)}
                        />

                        {/* AI Generation Parameters (Invisible Layer Controls) */}
                        <div className="space-y-4 border-t border-gray-800 pt-4">
                            <h4 className="text-[10px] uppercase text-gray-500 font-bold">AI Generation Settings</h4>

                            {/* Object Transfer Adherence */}
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-gray-500 flex justify-between">
                                    <span>Object Adherence</span>
                                    <span className="text-fashion-accent">{selectedNode.data.params.objectAdherence ?? 0.9}</span>
                                </label>
                                <input
                                    type="range" min="0" max="1" step="0.1"
                                    value={selectedNode.data.params.objectAdherence ?? 0.9}
                                    onChange={(e) => handleParamChange('objectAdherence', parseFloat(e.target.value))}
                                    className="w-full accent-fashion-accent h-1 bg-gray-700 rounded appearance-none"
                                    disabled={isHistoryNode}
                                />
                            </div>

                            {/* Target Placement */}
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-gray-500">Target Placement Region</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.params.targetPlacement || ''}
                                    onChange={(e) => handleParamChange('targetPlacement', e.target.value)}
                                    placeholder="e.g. head, left hand, background"
                                    className="w-full bg-[#0a0a0a] border border-[#333] rounded p-2 text-xs text-gray-300 focus:border-fashion-accent focus:outline-none"
                                    disabled={isHistoryNode}
                                />
                            </div>

                            {/* Realism Weight */}
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-gray-500 flex justify-between">
                                    <span>Realism Weight</span>
                                    <span className="text-fashion-accent">{selectedNode.data.params.realismWeight ?? 1.0}</span>
                                </label>
                                <input
                                    type="range" min="0" max="1" step="0.1"
                                    value={selectedNode.data.params.realismWeight ?? 1.0}
                                    onChange={(e) => handleParamChange('realismWeight', parseFloat(e.target.value))}
                                    className="w-full accent-fashion-accent h-1 bg-gray-700 rounded appearance-none"
                                    disabled={isHistoryNode}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* --- GENERATOR SETTINGS --- */}
                {selectedNode.type === 'ai_generator' && (
                    <div className="space-y-4">
                        {/* Object Transfer Adherence */}
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-gray-500 flex justify-between">
                                <span>Object Adherence</span>
                                <span className="text-fashion-accent">{selectedNode.data.params.objectAdherence ?? 0.8}</span>
                            </label>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={selectedNode.data.params.objectAdherence ?? 0.8}
                                onChange={(e) => handleParamChange('objectAdherence', parseFloat(e.target.value))}
                                className="w-full accent-fashion-accent h-1 bg-gray-700 rounded appearance-none"
                                disabled={isHistoryNode}
                            />
                        </div>

                        {/* Target Placement */}
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-gray-500">Target Placement Region</label>
                            <input
                                type="text"
                                value={selectedNode.data.params.targetPlacement || ''}
                                onChange={(e) => handleParamChange('targetPlacement', e.target.value)}
                                placeholder="e.g. head, left hand, background"
                                className="w-full bg-[#0a0a0a] border border-[#333] rounded p-2 text-xs text-gray-300 focus:border-fashion-accent focus:outline-none"
                                disabled={isHistoryNode}
                            />
                        </div>

                        {/* Realism Weight */}
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-gray-500 flex justify-between">
                                <span>Realism Weight</span>
                                <span className="text-fashion-accent">{selectedNode.data.params.realismWeight ?? 1.0}</span>
                            </label>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={selectedNode.data.params.realismWeight ?? 1.0}
                                onChange={(e) => handleParamChange('realismWeight', parseFloat(e.target.value))}
                                className="w-full accent-fashion-accent h-1 bg-gray-700 rounded appearance-none"
                                disabled={isHistoryNode}
                            />
                        </div>
                    </div>

                )}

                {/* --- VISUAL CONTROLS (NEW) --- */}
                {selectedNode.type === 'ai_generator' && (
                    <VisualControlsPanel
                        lightData={selectedNode.data.params.visualLightData}
                        cameraData={selectedNode.data.params.visualCameraData}
                        onLightChange={(val) => handleParamChange('visualLightData', val)}
                        onCameraChange={(val) => handleParamChange('visualCameraData', val)}
                        onMapsGenerated={(maps) => handleParamChange('controlMaps', maps)}
                    />
                )}

                {selectedNode.type === 'input_prompt' && (
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-gray-500">Prompt Text</label>
                        <textarea
                            value={selectedNode.data.params.text}
                            onChange={(e) => handleParamChange('text', e.target.value)}
                            className="w-full h-32 bg-[#0a0a0a] border border-[#333] rounded p-2 text-xs text-gray-300 resize-none focus:border-fashion-accent"
                            disabled={isHistoryNode}
                        />
                    </div>
                )}
            </div>
        </aside>
    );
};
