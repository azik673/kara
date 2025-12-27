
import React, { useState, useEffect } from 'react';
import { Node, NodeDefinition, Edge } from '../types';
import { NODE_REGISTRY } from '../services/nodeEngine';
import { Search, X, Trash2, Play, Box, ChevronLeft, ChevronRight, MousePointerClick, Download, Maximize2, Repeat, Grid, Layers, Lock, GitBranch, History, GitCommitVertical, Settings2, Sliders, Image as ImageIcon, Type, Upload, HelpCircle } from 'lucide-react';
import { ToolbarView } from './FloatingActionButton';

// --- LIBRARY PANEL ---
interface LibraryPanelProps {
    onAddNode: (type: string) => void;
    savedComponents?: Array<{ id: string; label: string; description: string; data?: any }>;
    onRestoreComponent?: (id: string) => void;
    activeView: ToolbarView;
    exportedImages?: Array<{ id: string; url: string; date: string; timestamp: number }>;
    selectedDate?: string;
    activityLog?: Array<{ id: string; text: string; timestamp: number }>;
    onOpenSpatialHistory?: () => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
    onAddNode,
    savedComponents = [],
    onRestoreComponent,
    activeView,
    exportedImages = [],
    selectedDate,
    activityLog = [],
    onOpenSpatialHistory
}) => {
    const [hoveredComp, setHoveredComp] = useState<{ id: string, data: any, y: number } | null>(null);
    const categories = ['input', 'generator', 'modifier', 'output'];

    const onDragStart = (event: React.DragEvent, type: string, isComponent: boolean = false) => {
        event.dataTransfer.setData(isComponent ? 'application/reactflow-component' : 'application/reactflow', type);
        event.dataTransfer.effectAllowed = 'move';
        if (isComponent) setHoveredComp(null);
    };

    const filteredImages = exportedImages.filter(img => !selectedDate || img.date === selectedDate);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input
                        placeholder={`Search ${activeView.toLowerCase()}...`}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white/80 focus:border-white/50 focus:outline-none placeholder-white/10 transition-all"
                    />
                </div>
            </div>

            {hoveredComp && activeView === 'GROUPS' && (
                <div
                    className="fixed z-[200] w-60 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl p-3 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-200"
                    style={{
                        left: 'calc(50% + 220px)',
                        top: Math.min(window.innerHeight - 250, Math.max(10, hoveredComp.y))
                    }}
                >
                    <div className="flex items-start justify-between mb-2 border-b border-[#333] pb-2">
                        <div>
                            <h4 className="text-sm font-bold text-white">{hoveredComp.data.label}</h4>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                                {hoveredComp.data.data?.nodes?.length || 0} Nodes inside
                            </span>
                        </div>
                        <Layers className="w-4 h-4 text-gray-600" />
                    </div>
                    <p className="text-[10px] text-gray-400 italic mb-3 line-clamp-3">{hoveredComp.data.description}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
                {activeView === 'NODES' && categories.map(cat => (
                    <div key={cat}>
                        {!['generator', 'modifier'].includes(cat) && <h3 className="text-[10px] uppercase font-bold text-white/30 mb-3 tracking-widest">{cat}s</h3>}
                        <div className="grid grid-cols-2 gap-3">
                            {Object.values(NODE_REGISTRY)
                                .filter(n => n.category === cat && n.type !== 'ai_generator' && n.type !== 'group')
                                .map(def => (
                                    <div
                                        key={def.type}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, def.type)}
                                        onClick={() => onAddNode(def.type)}
                                        className="bg-white/5 border border-white/10 rounded-2xl cursor-pointer hover:border-white/50 hover:bg-white/10 transition-all group relative select-none p-4 flex flex-col items-center text-center gap-2"
                                        title={def.label}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Box className="text-white/40 group-hover:text-white w-5 h-5" />
                                        </div>
                                        <span className="text-[11px] font-medium text-white/70">{def.label}</span>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                {activeView === 'GROUPS' && (
                    <div className="space-y-3">
                        <h3 className="text-[10px] uppercase font-bold text-white/30 mb-3 tracking-widest">My Library</h3>
                        {savedComponents.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3">
                                {savedComponents.map(comp => (
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
                                        className="bg-white/5 border border-white/10 rounded-2xl cursor-pointer hover:border-white/50 hover:bg-white/10 transition-all group relative select-none p-4 flex flex-col items-center text-center gap-2"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Layers className="text-white w-5 h-5" />
                                        </div>
                                        <span className="text-[11px] font-medium text-white/70">{comp.label}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-white/20 gap-3">
                                <Box className="w-12 h-12 opacity-20" />
                                <span className="text-xs italic">No saved groups</span>
                            </div>
                        )}
                    </div>
                )}

                {activeView === 'DOWNLOADS' && (
                    <div className="space-y-4">
                        <h3 className="text-[10px] uppercase font-bold text-white/30 mb-3 tracking-widest">Recent Exports ({selectedDate || 'All'})</h3>
                        {filteredImages.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                                {filteredImages.map((img, i) => (
                                    <div key={img.id} className="aspect-square bg-white/5 border border-white/10 rounded-xl overflow-hidden group cursor-pointer hover:border-white/50 transition-all relative">
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm z-10">
                                            <a href={img.url} download={`export-${img.date}-${i}.png`} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                                                <Download className="w-4 h-4 text-white" />
                                            </a>
                                        </div>
                                        <div className="w-full h-full bg-black flex items-center justify-center">
                                            <img src={img.url} alt={`Export ${i}`} className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-white/20 gap-2 text-center">
                                <Download className="w-8 h-8 opacity-20" />
                                <p className="text-[10px] italic">No exports found for this date.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeView === 'ACTIVITY' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] uppercase font-bold text-white/30 tracking-widest">Activity Log</h3>
                            {onOpenSpatialHistory && (
                                <button 
                                    onClick={onOpenSpatialHistory}
                                    className="text-[10px] bg-white/10 hover:bg-white/20 text-white/80 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                >
                                    <GitBranch className="w-3 h-3" />
                                    Spatial Graph
                                </button>
                            )}
                        </div>
                        
                        {activityLog.length > 0 ? (
                            <div className="space-y-2 relative">
                                <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-white/10" />
                                {activityLog.map((log, i) => (
                                    <div key={log.id} className="relative pl-4 group">
                                        <div className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#1a1a1a] ${i === 0 ? 'bg-fashion-accent' : 'bg-white/20'}`} />
                                        <div className="bg-white/5 border border-white/5 rounded-lg p-3 group-hover:bg-white/10 transition-colors">
                                            <p className="text-xs text-white/90 font-medium">{log.text}</p>
                                            <span className="text-[10px] text-white/40 font-mono mt-1 block">
                                                {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-white/20 gap-3">
                                <History className="w-12 h-12 opacity-20" />
                                <span className="text-xs italic">No recent activity</span>
                            </div>
                        )}
                    </div>
                )}

                {activeView === 'FILTERS' && (
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { name: 'Cinematic', icon: ImageIcon },
                            { name: 'Studio', icon: Sliders },
                            { name: 'Vintage', icon: Repeat },
                            { name: 'High Gloss', icon: Maximize2 }
                        ].map((filter, i) => (
                            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-white/50 hover:bg-white/10 transition-all cursor-pointer group">
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <filter.icon className="w-5 h-5 text-white/40 group-hover:text-white" />
                                </div>
                                <span className="text-[11px] font-medium text-white/70">{filter.name}</span>
                            </div>
                        ))}
                    </div>
                )}

                {activeView === 'HELP' && (
                    <div className="space-y-4">
                        <h3 className="text-[10px] uppercase font-bold text-white/30 mb-3 tracking-widest">Getting Started</h3>
                        <div className="space-y-3">
                            {[
                                { title: 'Adding Nodes', desc: 'Open the Node Library (left sidebar) and drag nodes like "Image Source" or "AI Generator" onto the canvas to start building your workflow.' },
                                { title: 'Connecting', desc: 'Connect nodes by dragging a line from an output handle (right side) to an input handle (left side) of another node to pass data.' },
                                { title: 'Execution', desc: 'Select a node and click the "Execute Flow" (magic wand) button in the toolbar to generate results using the AI engine.' },
                                { title: 'AI Refine', desc: 'Use the "AI Refine" tool (wand icon on layer) to enhance details and realism of your generated images.' },
                                { title: 'History', desc: 'Access the History panel (clock icon) to view and restore previous versions of your project and track your creative iterations.' }
                            ].map((item, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-all">
                                    <h4 className="text-xs font-bold text-white mb-1">{item.title}</h4>
                                    <p className="text-[11px] text-white/50 leading-relaxed">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
