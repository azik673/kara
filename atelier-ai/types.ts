
export interface Node {
  id: string;
  type: string;
  position: { x: number; y: number };
  hidden?: boolean;
  data: {
    label?: string;
    params: Record<string, any>;
    result?: any;
    error?: string;
    status?: NodeStatus;
    width?: number;
    height?: number;
    dynamicInputs?: Port[];
    dynamicOutputs?: Port[];
    isHistory?: boolean;
  };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface Port {
  id: string;
  label: string;
  type: 'image' | 'text' | 'data' | 'any';
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: 'input' | 'generator' | 'modifier' | 'output' | 'logic';
  inputs: Port[];
  outputs: Port[];
  defaultParams: Record<string, any>;
  description?: string;
}

export type NodeStatus = 'idle' | 'processing' | 'completed' | 'error' | 'dirty';

export type ViewMode = 'EDITOR' | 'HISTORY';

export interface HistoryState {
  id: string;
  label: string;
  timestamp: number;
  thumbnail: string | null;
  thumbnailLowRes?: string | null;
  position: { x: number, y: number };
  parentId: string | null;
  graph: { nodes: Node[], edges: Edge[] };
  is_archived?: boolean;
  isPinned?: boolean;  // Pin/star flag for active path filtering
}

// --- VISUAL CONTROL TYPES ---
export interface LightAngleData {
  azimuth?: number;    // Legacy single light
  elevation?: number;  // Legacy single light
  lights?: Array<{     // New multi-light support
    azimuth: number;
    elevation: number;
    preset?: string;
  }>;
}

export interface CameraAngleData {
  distance: 'close' | 'medium' | 'far' | 'wide';
  heightRatio: number;  // -1 (low) to +1 (high)
  framing: 'portrait' | 'full-body' | 'detail';
}

// --- DRAWING TOOL TYPES ---
export enum ToolType {
  MOVE = 'MOVE',
  BRUSH = 'BRUSH',
  MARKER = 'MARKER',
  ERASER = 'ERASER'
}

export interface BrushSettings {
  size: number;
  color: string;
  opacity: number;
}

export interface ControlMaps {
  shadowMap: string; // base64 data URL
  normalMap: string; // base64 data URL
  depthMap: string;  // base64 data URL
}

