
import React from 'react';
import { Eraser, Brush, Upload, Sparkles, Shirt, Download, Plus, Layers, PenTool, Move } from 'lucide-react';
import { ToolType, BrushSettings } from '../types';

interface SidebarProps {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  brushSettings: BrushSettings;
  setBrushSettings: (s: BrushSettings) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddLayer: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEnhance: () => void;
  onAddDetails: () => void;
  onVisualize: () => void;
  isProcessing: boolean;
  prompt: string;
  setPrompt: (s: string) => void;
  onDownload: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  setActiveTool,
  brushSettings,
  setBrushSettings,
  onUpload,
  onAddLayer,
  onEnhance,
  onAddDetails,
  onVisualize,
  isProcessing,
  prompt,
  setPrompt,
  onDownload
}) => {
  return (
    <aside className="w-80 bg-fashion-dark border-r border-fashion-gray h-screen flex flex-col text-fashion-light">
      <div className="p-6 border-b border-fashion-gray">
        <h1 className="font-serif text-2xl font-bold tracking-wide text-fashion-accent">ATELIER</h1>
        <p className="text-xs text-gray-400 tracking-widest mt-1 uppercase">AI Design Studio</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Assets Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-wider">Assets</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col items-center justify-center h-20 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-fashion-accent hover:bg-fashion-gray/30 transition-all">
              <Upload className="w-5 h-5 text-gray-400 mb-1" />
              <span className="text-[10px] text-gray-400">New Canvas</span>
              <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
            </label>
            
            <label className="flex flex-col items-center justify-center h-20 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-fashion-accent hover:bg-fashion-gray/30 transition-all">
              <Plus className="w-5 h-5 text-gray-400 mb-1" />
              <span className="text-[10px] text-gray-400">Add Layer</span>
              <input type="file" className="hidden" accept="image/*" onChange={onAddLayer} />
            </label>
          </div>
        </section>

        {/* Tools Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-wider">Artisan Tools</h3>
          <div className="grid grid-cols-4 gap-2 mb-4">
             <button
              onClick={() => setActiveTool(ToolType.MOVE)}
              className={`flex flex-col items-center justify-center p-3 rounded-md transition-all ${
                activeTool === ToolType.MOVE ? 'bg-fashion-accent text-black' : 'bg-fashion-gray hover:bg-gray-700'
              }`}
              title="Move / Pan"
            >
              <Move className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-medium">Move</span>
            </button>
            <button
              onClick={() => setActiveTool(ToolType.BRUSH)}
              className={`flex flex-col items-center justify-center p-3 rounded-md transition-all ${
                activeTool === ToolType.BRUSH ? 'bg-fashion-accent text-black' : 'bg-fashion-gray hover:bg-gray-700'
              }`}
              title="Brush"
            >
              <Brush className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-medium">Brush</span>
            </button>
            <button
              onClick={() => setActiveTool(ToolType.MARKER)}
              className={`flex flex-col items-center justify-center p-3 rounded-md transition-all ${
                activeTool === ToolType.MARKER ? 'bg-fashion-accent text-black' : 'bg-fashion-gray hover:bg-gray-700'
              }`}
              title="Marker"
            >
              <PenTool className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-medium">Marker</span>
            </button>
            <button
              onClick={() => setActiveTool(ToolType.ERASER)}
              className={`flex flex-col items-center justify-center p-3 rounded-md transition-all ${
                activeTool === ToolType.ERASER ? 'bg-fashion-accent text-black' : 'bg-fashion-gray hover:bg-gray-700'
              }`}
              title="Erase"
            >
              <Eraser className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-medium">Erase</span>
            </button>
          </div>
          
          <div className="space-y-3">
             <div>
                <label className="text-[10px] uppercase text-gray-500 mb-1 block">Size</label>
                <input 
                  type="range" 
                  min="1" 
                  max="50" 
                  value={brushSettings.size} 
                  onChange={(e) => setBrushSettings({...brushSettings, size: parseInt(e.target.value)})}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fashion-accent"
                />
             </div>
             <div>
                <label className="text-[10px] uppercase text-gray-500 mb-1 block">Color & Opacity</label>
                <div className="flex items-center gap-2 mb-2">
                  {['#000000', '#FFFFFF', '#d4af37', '#FF0000', '#0000FF'].map(color => (
                    <button
                      key={color}
                      onClick={() => setBrushSettings({...brushSettings, color})}
                      className={`w-6 h-6 rounded-full border border-gray-600 ${brushSettings.color === color ? 'ring-2 ring-fashion-accent' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                   <input 
                    type="color" 
                    value={brushSettings.color}
                    onChange={(e) => setBrushSettings({...brushSettings, color: e.target.value})}
                    className="w-6 h-6 p-0 border-0 rounded bg-transparent"
                   />
                </div>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1" 
                  step="0.1"
                  value={brushSettings.opacity} 
                  onChange={(e) => setBrushSettings({...brushSettings, opacity: parseFloat(e.target.value)})}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fashion-accent"
                  title="Brush Opacity"
                />
             </div>
          </div>
        </section>

        {/* AI Generation Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-wider">Generative Process</h3>
          
          <div className="mb-4">
            <label className="text-[10px] uppercase text-gray-500 mb-1 block">Vision / Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the design, fabric, or details to add..."
              className="w-full bg-black border border-gray-700 rounded-md p-3 text-xs text-gray-300 focus:border-fashion-accent focus:outline-none resize-none h-24"
            />
          </div>

          <div className="space-y-2">
            <button
              onClick={onEnhance}
              disabled={isProcessing}
              className="w-full py-3 bg-fashion-light text-black hover:bg-white font-semibold rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isProcessing ? 'Processing...' : 'Render Design'}
            </button>

            <button
              onClick={onAddDetails}
              disabled={isProcessing}
              className="w-full py-2 bg-fashion-gray text-fashion-light hover:bg-gray-700 border border-gray-600 font-medium rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
            >
              <Layers className="w-3 h-3 mr-2" />
              {isProcessing ? 'Refining...' : 'Add Tiny Details'}
            </button>

            <button
              onClick={onVisualize}
              disabled={isProcessing}
              className="w-full py-3 border border-fashion-accent text-fashion-accent hover:bg-fashion-accent hover:text-black font-semibold rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shirt className="w-4 h-4 mr-2" />
              {isProcessing ? 'Draping...' : 'Visualize on Model'}
            </button>
          </div>
        </section>
      </div>
      
      <div className="p-6 border-t border-fashion-gray">
        <button onClick={onDownload} className="flex items-center justify-center w-full text-xs text-gray-400 hover:text-white transition-colors">
          <Download className="w-4 h-4 mr-2" /> Download Result
        </button>
      </div>
    </aside>
  );
};
