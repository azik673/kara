
import React from 'react';
import { Upload, Grid, MousePointerClick } from 'lucide-react';
import { LibraryPanel } from './Panels';
import { FloatingActionButton, ToolbarView } from './FloatingActionButton';

interface FloatingPanelProps {
    isOpen: boolean;
    activeView: ToolbarView;
    onViewChange: (view: ToolbarView) => void;
    onAddNode: (type: string) => void;
    savedComponents?: any[];
    onRestoreComponent?: (id: string) => void;
    isExecuting?: boolean;
    onToggleExpand: () => void;
    isExpanded: boolean;
    exportedImages?: string[];
    activityLog?: Array<{ id: string; text: string; timestamp: number }>;
    onOpenSpatialHistory?: () => void;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
    isOpen,
    activeView,
    onViewChange,
    onAddNode,
    savedComponents,
    onRestoreComponent,
    isExecuting,
    onToggleExpand,
    isExpanded,
    exportedImages,
    activityLog,
    onOpenSpatialHistory
}) => {
    const [selectedDate, setSelectedDate] = React.useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    });

    const formatDateDisplay = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-end justify-center pb-8">
            <div className="pointer-events-auto flex flex-col items-center gap-4">

                {/* Main Floating Panel */}
                <div className="w-[380px] h-[560px] bg-black/60 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden relative">

                    {/* Header */}
                    <div className="px-8 pt-8 pb-4 flex justify-between items-center shrink-0">
                        <div className="relative group">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 cursor-pointer hover:bg-white/10 transition-colors">
                                <span className="text-[11px] font-bold text-white/40 tracking-wider group-hover:text-white/60 transition-colors">
                                    {formatDateDisplay(selectedDate)}
                                </span>
                                <div className="w-1 h-1 rounded-full bg-white/20" />
                            </div>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <button className="text-white/40 hover:text-white transition-colors">
                                <Upload className="w-5 h-5" />
                            </button>
                            <button className="text-white/40 hover:text-white transition-colors">
                                <Grid className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content (Library) */}
                    <div className="flex-1 overflow-hidden">
                        <LibraryPanel
                            onAddNode={onAddNode}
                            savedComponents={savedComponents}
                            onRestoreComponent={onRestoreComponent}
                            activeView={activeView}
                            exportedImages={exportedImages}
                            selectedDate={formatDateDisplay(selectedDate)}
                            activityLog={activityLog}
                            onOpenSpatialHistory={onOpenSpatialHistory}
                        />
                    </div>

                    {/* Footer (Toolbar) */}
                    <div className="p-0 shrink-0">
                        <div className="relative h-12 w-full flex items-center justify-center">
                            {/* FloatingActionButton is already absolute/fixed in its own file, 
                                 but we want it to behave as a footer here. 
                                 We'll need to modify FloatingActionButton to be more flexible.
                             */}
                            <FloatingActionButton
                                isExpanded={isExpanded}
                                onToggleExpand={onToggleExpand}
                                onViewChange={onViewChange}
                                activeView={activeView}
                                isExecuting={isExecuting}
                                isLibraryOpen={isOpen}
                                inline={true}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
