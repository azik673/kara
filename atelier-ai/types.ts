
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
    isLocked?: boolean;
    width?: number;
    height?: number;
    dynamicInputs?: Port[];
    dynamicOutputs?: Port[];
    isHistory?: boolean;

    // Input tracking for flow isolation
    inputHash?: string;  // Hash of all inputs to detect changes
    lastExecutionContext?: {
      timestamp: number;
      inputHash: string;
      explicitTrigger?: boolean;  // True if user clicked regenerate
    };
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

export type NodeStatus = 'idle' | 'processing' | 'completed' | 'error' | 'dirty' | 'pending_changes';

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

export type UserRole = 'CONSTRUCTOR' | 'USER_ADMIN' | 'USER_VIEWER' | 'USER_EDITOR';

export interface Layer {
  id: string;
  sourceId: string; // ID of the input node/port
  image: string; // Data URL
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blendMode: string;
  visible: boolean;
  zIndex: number;
  width?: number;
  height?: number;
  eraserPaths?: any[];
  brushPaths?: any[];
  locked?: boolean;
  name?: string;
  type?: 'layer' | 'group';
  parentId?: string | null;
  collapsed?: boolean;

}

export type ActiveTool = 'move' | 'hand' | 'zoom' | 'brush' | 'eraser' | 'crop' | 'expand' | 'style_transfer';

export interface ExportedImage {
  id: string;
  url: string;
  date: string;
  timestamp: number;
}

