import React from 'react';
import { HelpCircle, Download, Layers, Grid, Sliders, History, Globe } from 'lucide-react';

export type ToolbarView = 'HELP' | 'DOWNLOADS' | 'GROUPS' | 'NODES' | 'FILTERS' | 'ACTIVITY';

interface FloatingToolbarProps {
    isExpanded: boolean;
    onToggleExpand: () => void;
    onViewChange: (view: ToolbarView) => void;
    activeView?: ToolbarView;
    isLibraryOpen?: boolean;
    isExecuting?: boolean;
    inline?: boolean;
}

export const FloatingActionButton: React.FC<FloatingToolbarProps> = ({
    isExpanded,
    onToggleExpand,
    onViewChange,
    activeView,
    isLibraryOpen,
    isExecuting,
    inline = false
}) => {
    const containerClasses = inline
        ? `relative flex items-center bg-black/60 border border-white/10 rounded-full transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden ${isExpanded ? 'w-full h-12 px-4' : 'w-12 h-12 px-0'}`
        : `fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center`;

    const innerClasses = inline
        ? "flex items-center justify-between w-full h-full relative"
        : `relative flex items-center bg-black/60 border border-white/10 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden ${isExpanded ? 'w-[380px] h-12 px-4' : 'w-12 h-12 px-0'}`;

    const content = (
        <div className="flex items-center justify-between w-full h-full relative">
            {/* Left Icons */}
            <div className={`flex items-center gap-5 transition-all duration-500 ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}>
                <button
                    onClick={() => onViewChange('HELP')}
                    className={`transition-colors p-2 hover:bg-white/5 rounded-full ${activeView === 'HELP' ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title="Help & Tutorials"
                >
                    <HelpCircle className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onViewChange('DOWNLOADS')}
                    className={`transition-colors p-2 hover:bg-white/5 rounded-full ${activeView === 'DOWNLOADS' ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title="Download History"
                >
                    <Download className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onViewChange('GROUPS')}
                    className={`transition-colors p-2 hover:bg-white/5 rounded-full ${activeView === 'GROUPS' ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title="Groups & Flows"
                >
                    <Layers className="w-5 h-5" />
                </button>
            </div>

            {/* Center Logo (The Trigger) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <button
                    onClick={onToggleExpand}
                    className={`group relative flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-500 hover:scale-110 active:scale-95 ${isExpanded ? 'ring-2 ring-fashion-accent/30' : ''}`}
                >
                    <Globe className={`w-5 h-5 text-white transition-transform duration-700 ${isExpanded ? 'scale-110 rotate-[360deg]' : ''} drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]`} />

                    {/* Glow Effect */}
                    <div className={`absolute inset-0 bg-white/20 rounded-full blur-xl transition-opacity duration-500 ${isExpanded ? 'opacity-100' : 'opacity-0'}`} />
                </button>
            </div>

            {/* Right Icons */}
            <div className={`flex items-center gap-5 transition-all duration-500 ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10 pointer-events-none'}`}>
                <button
                    onClick={() => onViewChange('NODES')}
                    className={`transition-colors p-2 hover:bg-white/5 rounded-full ${activeView === 'NODES' ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title="Nodes Library"
                >
                    <Grid className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onViewChange('FILTERS')}
                    className={`transition-all p-2 hover:bg-white/5 rounded-full ${activeView === 'FILTERS' ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title="Filters & Presets"
                >
                    <Sliders className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onViewChange('ACTIVITY')}
                    className={`transition-colors p-2 hover:bg-white/5 rounded-full ${activeView === 'ACTIVITY' ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title="Activity History"
                >
                    <History className="w-5 h-5" />
                </button>
            </div>
        </div>
    );

    if (inline) {
        return (
            <div className={containerClasses}>
                {content}
            </div>
        );
    }

    return (
        <div className={containerClasses}>
            <div className={innerClasses}>
                {content}
            </div>
        </div>
    );
};
