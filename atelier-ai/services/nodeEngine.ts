import { NodeDefinition, Node, Edge, ControlMaps, LightAngleData, CameraAngleData } from '../types';
import { enhanceSketch, visualizeOnModel, extractCoherenceAttributes, analyzeFabricPhysics, analyzeEnvironmentLighting, inferAutoPhysics, getDefaultStudioLighting } from './gemini';
import { extractPoseSkeleton } from './pose';


export const NODE_REGISTRY: Record<string, NodeDefinition> = {
  'image_source': {
    type: 'image_source',
    label: 'Image Source',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    defaultParams: { image: null, role: 'MAIN', maskData: null, isPoseLocked: true }, // Added maskData & PoseLock
    description: 'Upload an image and assign its role (Main Subject or Style Reference).'
  },
  'input_prompt': {
    type: 'input_prompt',
    label: 'Text Prompt',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'text', label: 'Prompt', type: 'text' }],
    defaultParams: { text: 'A high fashion avant-garde dress' },
    description: 'Define your design vision.'
  },
  'group': {
    type: 'group',
    label: 'Group Frame',
    category: 'modifier',
    inputs: [],
    outputs: [],
    defaultParams: { color: '#ffffff' },
    description: 'Extracts a pose skeleton from an image.'
  },

  'ai_generator': {
    type: 'ai_generator',
    label: 'AI Design Gen',
    category: 'generator',
    inputs: [
      { id: 'main_subject', label: 'Main Subject (Red)', type: 'image' },
      { id: 'ref_style', label: 'Ref Style (Blue)', type: 'image' },
      { id: 'mask_in', label: 'Mask', type: 'image' },
      { id: 'prompt_in', label: 'Text Prompt', type: 'text' }
      // Removed data_coherence input - now automated
    ],
    outputs: [{ id: 'image_out', label: 'Result', type: 'image' }],
    defaultParams: {
      objectAdherence: 0.9,
      targetPlacement: 'head',
      realismWeight: 1.0,
      is_committed: false,

      visualLightData: null, // Added for Light Widget
      visualCameraData: null,
      isPoseLocked: true
    },
    description: 'Generates a design based on input sketch and prompt. Auto-locks pose.'
  },

  'output_result': {
    type: 'output_result',
    label: 'Preview / Result',
    category: 'output',
    inputs: [
      { id: 'main_subject', label: 'Main Subject', type: 'image' },
      { id: 'ref_style', label: 'Ref Style', type: 'image' },
      { id: 'mask_in', label: 'Mask', type: 'image' },
      { id: 'prompt_in', label: 'Text Prompt', type: 'text' },
      { id: 'image_in', label: 'Image (Direct)', type: 'image' }
    ],
    outputs: [{ id: 'image', label: 'Result', type: 'image' }],
    defaultParams: {
      role: 'MAIN',
      maskData: null,
      lightData: null,
      // AI generation params (inherited from ai_generator)
      objectAdherence: 0.9,
      targetPlacement: 'head',
      realismWeight: 1.0,
      visualLightData: null,
      visualCameraData: null,
      isPoseLocked: true
    },
    description: 'View result and assign role for recursive design. Automatically processes AI generation when inputs are connected.'
  },

};

// Helper: Compute hash of node inputs for change detection
const computeInputHash = (
  node: any,
  edges: any[],
  results: Record<string, any>,
  nodes: any[]
): string => {
  const inputs: any = {};

  // Get all connected inputs
  const nodeEdges = edges.filter((e: any) => e.target === node.id);
  nodeEdges.forEach((edge: any) => {
    const key = `${edge.source}-${edge.sourceHandle}`;
    inputs[edge.targetHandle] = results[key];
  });

  // Include node params (visual controls, etc.)
  inputs.params = {
    visualLightData: node.data.params.visualLightData,
    visualCameraData: node.data.params.visualCameraData,
    controlMaps: node.data.params.controlMaps,
    objectAdherence: node.data.params.objectAdherence,
    targetPlacement: node.data.params.targetPlacement,
    realismWeight: node.data.params.realismWeight,
    isPoseLocked: node.data.params.isPoseLocked,
    isClothingReplacement: node.data.params.isClothingReplacement
  };

  // Include Upstream Pose Data (Critical for Pose Transfer)
  const refEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'ref_style');
  if (refEdge) {
    const refNode = nodes.find(n => n.id === refEdge.source);
    if (refNode && refNode.data.params.poseData) {
      inputs.upstreamPoseData = refNode.data.params.poseData;
    }
  }

  // Simple hash using JSON stringify
  return JSON.stringify(inputs);
};

// Helper: Topological Sort to determine correct execution order based on dependencies
const getExecutionOrder = (nodes: any[], edges: any[]) => {
  const adjacencyList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  nodes.forEach(node => {
    adjacencyList.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  // Build Graph
  edges.forEach(edge => {
    if (adjacencyList.has(edge.source) && inDegree.has(edge.target)) {
      adjacencyList.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  });

  // Queue for Kahn's Algorithm
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sortedNodes: any[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodes.find(n => n.id === nodeId);
    if (node) sortedNodes.push(node);

    const neighbors = adjacencyList.get(nodeId) || [];
    neighbors.forEach(neighbor => {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  // Fallback for cycles or disconnected nodes not caught
  if (sortedNodes.length !== nodes.length) {
    const visited = new Set(sortedNodes.map(n => n.id));
    nodes.forEach(n => {
      if (!visited.has(n.id)) sortedNodes.push(n);
    });
  }

  return sortedNodes;
};

// Graph Execution Engine
export const executeGraph = async (
  nodes: any[],
  edges: any[],
  updateNodeStatus: (id: string, status: string, result?: any, error?: string) => void,
  resultsCache?: Record<string, any>, // recursive cache passing
  executionContext?: {
    targetNodeIds?: string[];  // If specified, only these nodes can regenerate
    explicitTrigger?: boolean;  // True if user clicked Execute/Regenerate
  }
) => {
  console.log("[NodeEngine] Initialized");

  // --- STRUCTURAL MAP GENERATOR (MICRO-MODEL) ---
  const generateStructuralMaps = async (
    lightData: LightAngleData | null,
    cameraData: CameraAngleData | null
  ): Promise<ControlMaps | undefined> => {
    if (!lightData && !cameraData) return undefined;

    console.log("[Structural Map Gen] Generating maps for:", { light: lightData, camera: cameraData });

    const width = 512;
    const height = 512;

    const createCanvas = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };

    const maps: ControlMaps = {
      shadowMap: '',
      normalMap: '',
      depthMap: ''
    };

    // 1. SHADOW MAP (Based on Light Azimuth/Elevation)
    if (lightData) {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Background: Ambient Shadow (Dark Gray)
        ctx.fillStyle = '#222222';
        ctx.fillRect(0, 0, width, height);

        // Normalize input to array (Support both Legacy and Multi-Light)
        const lights = (lightData.lights && lightData.lights.length > 0)
          ? lightData.lights
          : [{ azimuth: lightData.azimuth ?? 0, elevation: lightData.elevation ?? 45 }];

        // Draw Lights
        ctx.globalCompositeOperation = 'screen';

        lights.forEach(light => {
          const az = light.azimuth ?? 0;
          const el = light.elevation ?? 45;

          // Calculate Light Position
          const r = width * 0.4;
          // Convert to radians
          const radAz = (az - 90) * (Math.PI / 180);
          const radEl = el * (Math.PI / 180); // Elevation in radians

          // Calculate projected position
          // Azimuth -90 rotates so 0 is top (12 o'clock)
          // 1 - (abs(el)/90) pushes light towards center as elevation increases
          const dist = r * (1 - Math.abs(el) / 90);

          const cx = width / 2 + Math.cos(radAz) * dist;
          const cy = height / 2 + Math.sin(radAz) * dist;

          // Safety check for NaN
          if (Number.isFinite(cx) && Number.isFinite(cy)) {
            const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, width * 0.8);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
          }
        });

        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';

        maps.shadowMap = canvas.toDataURL('image/png');
      }
    }

    // 2. NORMAL MAP (Surface Orientation)
    // For now, we generate a generic "sphere" normal map to imply a 3D object in the center
    // This helps the AI understand that the subject is 3D.
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Flat Normal Background (0x8080FF)
        ctx.fillStyle = '#8080FF';
        ctx.fillRect(0, 0, width, height);

        // Draw Sphere Normal
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const cx = width / 2;
        const cy = height / 2;
        const radius = width * 0.35;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < radius) {
              // Calculate Normal Z
              const z = Math.sqrt(radius * radius - dist * dist);

              // Normalize
              const nx = dx / radius;
              const ny = dy / radius;
              const nz = z / radius;

              // Pack to RGB (0..255)
              // R = (x + 1) / 2 * 255
              const r = Math.floor((nx + 1) / 2 * 255);
              const g = Math.floor((ny + 1) / 2 * 255); // Y is usually inverted in normal maps depending on standard. Let's stick to OpenGL (Y up) or DirectX (Y down).
              // Let's use standard RGB mapping.
              const b = Math.floor((nz + 1) / 2 * 255);

              const idx = (y * width + x) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);
        maps.normalMap = canvas.toDataURL('image/png');
      }
    }

    // 3. DEPTH MAP (Camera Angle/Perspective)
    if (cameraData) {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Gradient based on Height Ratio (-1 to 1)
        // Low angle (-1) = Horizon is low, sky is big? Or looking up?
        // Let's interpret Height Ratio: -1 (Low Angle looking up), 1 (High Angle looking down)

        const gradient = ctx.createLinearGradient(0, 0, 0, height);

        if (cameraData.heightRatio > 0.5) {
          // High Angle (Looking Down) -> Near is bottom, Far is top. Ground is dominant.
          gradient.addColorStop(0, '#FFFFFF'); // Far
          gradient.addColorStop(1, '#000000'); // Near
        } else if (cameraData.heightRatio < -0.5) {
          // Low Angle (Looking Up) -> Sky dominant.
          gradient.addColorStop(0, '#000000');
          gradient.addColorStop(1, '#444444');
        } else {
          // Eye Level
          gradient.addColorStop(0, '#CCCCCC');
          gradient.addColorStop(1, '#333333');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        maps.depthMap = canvas.toDataURL('image/png');
      }
    }

    return maps;
  };


  // 1. Mark dirty nodes as processing
  nodes.forEach(n => {
    if (n.data.status === 'dirty') {
      updateNodeStatus(n.id, 'processing');
    }
  });

  // 2. Prepare Results Cache
  const results: Record<string, any> = resultsCache || {};

  // Pre-populate from static params or existing results
  nodes.forEach(n => {
    const def = NODE_REGISTRY[n.type];

    // Register static params
    if (n.data.params.image !== undefined) results[`${n.id}-image`] = n.data.params.image;
    if (n.data.params.text !== undefined) results[`${n.id}-text`] = n.data.params.text;

    // Register Cached Results
    // EXCEPTION: Don't cache output_result nodes to allow regeneration on each execution
    if (n.data.result && n.type !== 'output_result') {
      results[`${n.id}-image_out`] = n.data.result;
      results[`${n.id}-image`] = n.data.result;
      results[`${n.id}-text`] = n.data.result;

      if (def && def.outputs) {
        def.outputs.forEach(out => {
          results[`${n.id}-${out.id}`] = n.data.result;
        });
      }

      if (n.data.dynamicOutputs) {
        n.data.dynamicOutputs.forEach((out: any) => {
          results[`${n.id}-${out.id}`] = n.data.result;
        });
      }

      if (n.type === 'mask_editor' && n.data.params.maskData) {
        results[`${n.id}-mask_out`] = n.data.params.maskData;
      }
    }
  });

  // 3. Determine Order
  const executionOrder = getExecutionOrder(nodes, edges);

  for (const node of executionOrder) {
    const def = NODE_REGISTRY[node.type];
    if (!def) continue;

    // Skip completed nodes (Caching)
    // EXCEPTION: Always regenerate output_result nodes to allow multiple generation attempts
    if (node.data.status === 'completed' && node.type !== 'output_result') {
      if (node.data.result) {
        const outs = node.data.dynamicOutputs || def.outputs;
        outs.forEach((out: any) => {
          results[`${node.id}-${out.id}`] = node.data.result;
        });
      }
      continue;
    }

    try {
      // --- HELPER: Dynamic Input Retrieval ---
      const getInputData = (handleId: string) => {
        const edge = edges.find((e: any) => e.target === node.id && e.targetHandle === handleId);
        if (!edge) return null;
        const key = `${edge.source}-${edge.sourceHandle}`;
        return results[key];
      };

      // Helper to get upstream node for parameter inheritance
      const getUpstreamNode = (nodeId: string, handleId: string) => {
        const edge = edges.find((e: any) => e.target === nodeId && e.targetHandle === handleId);
        if (!edge) return null;
        return nodes.find(n => n.id === edge.source);
      };

      // --- IMAGE SOURCE / PROMPT ---
      if (node.type === 'image_source') {
        updateNodeStatus(node.id, 'completed');
        if (node.data.params.image !== undefined) {
          results[`${node.id}-image`] = node.data.params.image;
        }
        continue;
      }

      if (node.type === 'input_prompt') {
        updateNodeStatus(node.id, 'completed');
        if (node.data.params.text !== undefined) {
          results[`${node.id}-text`] = node.data.params.text;
        }
        continue;
      }

      if (node.type === 'group') continue;

      // --- AI DESIGN GENERATOR ---
      else if (node.type === 'ai_generator') {
        // HISTORY LOCK CHECK
        if (node.data.params.is_committed && node.data.result) {
          console.log(`[NodeEngine] Skipping locked node: ${node.id}`);
          updateNodeStatus(node.id, 'completed', node.data.result);
          results[`${node.id}-image_out`] = node.data.result;
          continue;
        }

        // FLOW ISOLATION CHECK
        const currentInputHash = computeInputHash(node, edges, results, nodes);
        // Use node.data.inputHash directly for persistence across executions
        const previousHash = node.data.inputHash;
        const hasInputChanged = previousHash ? (currentInputHash !== previousHash) : false;

        // Only regenerate if:
        // 1. Inputs have changed AND (no target filter OR this node is targeted), OR
        // 2. No cached result exists (first-time generation), OR
        // 3. Explicit trigger AND this node is targeted
        // This prevents regeneration of already generated photos when generating new ones
        const isTarget = executionContext?.targetNodeIds?.includes(node.id);

        const shouldRegenerate =
          (hasInputChanged && (!executionContext?.targetNodeIds || isTarget)) ||
          !node.data.result ||
          (executionContext?.explicitTrigger && isTarget);

        if (!shouldRegenerate) {
          console.log(`[Flow Isolation] Skipping ${node.id}: shouldRegenerate=${shouldRegenerate}, hasInputChanged=${hasInputChanged}, hasResult=${!!node.data.result}`);
          if (node.data.result) {
            results[`${node.id}-image_out`] = node.data.result;
            updateNodeStatus(node.id, 'completed', node.data.result);
            // Store hash if not already stored (for nodes that were generated before hash tracking)
            if (!node.data.inputHash) {
              node.data.inputHash = currentInputHash;
              results[`${node.id}-inputHash`] = currentInputHash; // Persist
            }
          }
          continue;
        }

        console.log(`[Flow Isolation] Regenerating ${node.id}: inputChanged=${hasInputChanged}, explicit=${executionContext?.explicitTrigger}`);

        let inputImage = getInputData('main_subject');

        const imgInEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'main_subject');
        let upstreamSourceNode = null;
        if (imgInEdge) {
          const src = nodes.find(n => n.id === imgInEdge.source);
          if (src) {
            upstreamSourceNode = src;
            const allowedTypes = ['image_source', 'output_result', 'macro'];
            if (!allowedTypes.includes(src.type)) {
              console.warn(`[AI Gen] Blocked 'main_subject' from '${src.type}'.`);
              inputImage = null;
            }
          }
        }

        const rawRefImage = getInputData('ref_style');
        const rawMaskImage = getInputData('mask_in');
        const inputPrompt = getInputData('prompt_in');

        // Validate Mask Input
        const isImageString = (s: any) => typeof s === 'string' && (s.startsWith('data:image') || s.startsWith('blob:') || s.startsWith('http'));
        let maskImage = isImageString(rawMaskImage) ? rawMaskImage : null;
        const refImage = isImageString(rawRefImage) ? rawRefImage : null;

        // POSE EXTRACTION INTEGRATION
        // Check if the Reference Node has pre-calculated Pose Data
        let poseControlImage = null;
        const refEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'ref_style');
        if (refEdge) {
          const refNode = nodes.find(n => n.id === refEdge.source);
          if (refNode && refNode.data.params.poseData) {
            console.log(`[NodeEngine] Found Pose Data in Reference Node: ${refNode.id}`);
            poseControlImage = refNode.data.params.poseData;
          }
        }

        // Fallback: Check upstream source node for mask data if not explicitly connected
        if (!maskImage && upstreamSourceNode && upstreamSourceNode.data.params.maskData) {
          if (isImageString(upstreamSourceNode.data.params.maskData)) {
            console.log(`[NodeEngine] Auto-detected Mask from Upstream Node: ${upstreamSourceNode.id}`);
            maskImage = upstreamSourceNode.data.params.maskData;
          }
        } else if (maskImage) {
          console.log(`[NodeEngine] Using explicitly connected Mask.`);
        } else {
          console.log(`[NodeEngine] No Mask detected.`);
        }

        // Auto-detect Reference Node if not connected
        let finalRefImage = refImage;
        if (!finalRefImage) {
          // 1. Try strict role check
          let refNode = nodes.find(n => n.type === 'image_source' && n.data.params.role === 'REF' && n.data.params.image);

          // 2. Fallback: Try label check (if user renamed node but forgot to set role)
          if (!refNode) {
            refNode = nodes.find(n => n.type === 'image_source' &&
              (n.data.label?.toLowerCase().includes('ref') || n.data.label?.toLowerCase().includes('style')) &&
              n.data.params.image
            );
          }

          if (refNode) {
            console.log(`[NodeEngine] Auto-detected disconnected Reference Node: ${refNode.id} (${refNode.data.label})`);
            finalRefImage = refNode.data.params.image;
          } else {
            console.warn("[NodeEngine] Could not find any Reference node (Role='REF' or Label contains 'Ref')");
          }
        }

        // Note: Physics and Lighting are now handled automatically inside enhanceSketch (Background Automation)
        // We pass visual control data from params if available

        if (!inputImage && !finalRefImage && !inputPrompt) {
          updateNodeStatus(node.id, 'idle');
          continue;
        }

        let defaultPrompt = "Enhance the design.";
        if (!inputImage && finalRefImage) {
          defaultPrompt = "Generate a high-fashion design based on the reference object.";
        } else if (inputImage && !finalRefImage) {
          defaultPrompt = "Enhance the fashion sketch with realistic details.";
        }

        const effectivePrompt = (inputPrompt && inputPrompt.trim().length > 0) ? inputPrompt : defaultPrompt;

        // INHERIT VISUAL CONTROLS FROM UPSTREAM if not set locally
        // Priority: Local Node Params > Upstream Source Node Params > Default
        const localLight = node.data.params.visualLightData;
        const localCamera = node.data.params.visualCameraData;

        let inheritedLight = localLight;
        let inheritedCamera = localCamera;

        if (!inheritedLight && upstreamSourceNode && upstreamSourceNode.data.params.visualLightData) {
          inheritedLight = upstreamSourceNode.data.params.visualLightData;
          // console.log("Inheriting Light Data from Upstream:", inheritedLight);
        }

        if (!inheritedCamera && upstreamSourceNode && upstreamSourceNode.data.params.visualCameraData) {
          inheritedCamera = upstreamSourceNode.data.params.visualCameraData;
        }

        // GENERATE STRUCTURAL MAPS
        // Priority: 1. Pre-generated maps from 3D Widget (params.controlMaps)
        //           2. Internal Micro-Model generation
        let structuralMaps = node.data.params.controlMaps;

        if (!structuralMaps) {
          structuralMaps = await generateStructuralMaps(inheritedLight, inheritedCamera);
        }


        console.log("[NodeEngine] Using Gemini Engine");
        const result = await enhanceSketch(
          inputImage || null,
          finalRefImage,
          effectivePrompt,
          {
            ...node.data.params,
            visualLightData: inheritedLight,
            visualCameraData: inheritedCamera,
            isPoseLocked: true,
            isClothingReplacement: node.data.params.isClothingReplacement
          },
          maskImage,
          undefined, // coherenceData
          structuralMaps, // Pass generated maps
          poseControlImage // Pass pose skeleton
        );

        results[`${node.id}-image_out`] = result;
        updateNodeStatus(node.id, 'completed', result);

        // Store input hash for future comparison
        node.data.inputHash = currentInputHash;
        node.data.lastExecutionContext = {
          timestamp: Date.now(),
          inputHash: currentInputHash,
          explicitTrigger: executionContext?.explicitTrigger
        };
      }

      // --- OUTPUT / RESULT NODES ---
      // --- OUTPUT / RESULT NODES (DEPRECATED BLOCK - SKIPPING) ---
      else if (false) {
        // HISTORY LOCK CHECK - prevents regeneration if committed
        if (node.data.params.is_committed && node.data.result) {
          console.log(`[NodeEngine] Skipping locked node: ${node.id}`);
          updateNodeStatus(node.id, 'completed', node.data.result);
          results[`${node.id}-image`] = node.data.result;
          continue;
        }

        // FLOW ISOLATION CHECK
        const currentInputHash = computeInputHash(node, edges, results, nodes);
        // Use node.data.inputHash directly for persistence across executions
        const previousHash = node.data.inputHash;
        const hasInputChanged = previousHash ? (currentInputHash !== previousHash) : false;

        // Only regenerate if:
        // 1. Inputs have changed AND (no target filter OR this node is targeted), OR
        // 2. No cached result exists (first-time generation), OR
        // 3. Explicit trigger AND this node is targeted
        // This prevents regeneration of already generated photos when generating new ones
        const isTarget = executionContext?.targetNodeIds?.includes(node.id);

        const shouldRegenerate =
          (hasInputChanged && (!executionContext?.targetNodeIds || isTarget)) ||
          !node.data.result ||
          (executionContext?.explicitTrigger && isTarget);

        if (!shouldRegenerate) {
          console.log(`[Flow Isolation] Skipping ${node.id}: shouldRegenerate=${shouldRegenerate}, hasInputChanged=${hasInputChanged}, hasResult=${!!node.data.result}`);
          if (node.data.result) {
            results[`${node.id}-image_out`] = node.data.result;
            updateNodeStatus(node.id, 'completed', node.data.result);
            // Store hash if not already stored (for nodes that were generated before hash tracking)
            if (!node.data.inputHash) {
              node.data.inputHash = currentInputHash;
              results[`${node.id}-inputHash`] = currentInputHash; // Persist
            }
          }
          continue;
        }

        console.log(`[Flow Isolation] Regenerating ${node.id}: inputChanged=${hasInputChanged}, explicit=${executionContext?.explicitTrigger}`);

        let inputImage = getInputData('main_subject');

        const imgInEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'main_subject');
        let upstreamSourceNode = null;
        if (imgInEdge) {
          const src = nodes.find(n => n.id === imgInEdge.source);
          if (src) {
            upstreamSourceNode = src;
            const allowedTypes = ['image_source', 'output_result', 'macro'];
            if (!allowedTypes.includes(src.type)) {
              console.warn(`[AI Gen] Blocked 'main_subject' from '${src.type}'.`);
              inputImage = null;
            }
          }
        }

        const rawRefImage = getInputData('ref_style');
        const rawMaskImage = getInputData('mask_in');
        const inputPrompt = getInputData('prompt_in');

        // Validate Mask Input
        const isImageString = (s: any) => typeof s === 'string' && (s.startsWith('data:image') || s.startsWith('blob:') || s.startsWith('http'));
        let maskImage = isImageString(rawMaskImage) ? rawMaskImage : null;
        const refImage = isImageString(rawRefImage) ? rawRefImage : null;

        // POSE EXTRACTION INTEGRATION
        // Check if the Reference Node has pre-calculated Pose Data
        let poseControlImage = null;
        const refEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'ref_style');
        if (refEdge) {
          const refNode = nodes.find(n => n.id === refEdge.source);
          if (refNode && refNode.data.params.poseData) {
            console.log(`[NodeEngine] Found Pose Data in Reference Node: ${refNode.id}`);
            poseControlImage = refNode.data.params.poseData;
          }
        }

        // Fallback: Check upstream source node for mask data if not explicitly connected
        if (!maskImage && upstreamSourceNode && upstreamSourceNode.data.params.maskData) {
          if (isImageString(upstreamSourceNode.data.params.maskData)) {
            console.log(`[NodeEngine] Auto-detected Mask from Upstream Node: ${upstreamSourceNode.id}`);
            maskImage = upstreamSourceNode.data.params.maskData;
          }
        } else if (maskImage) {
          console.log(`[NodeEngine] Using explicitly connected Mask.`);
        } else {
          console.log(`[NodeEngine] No Mask detected.`);
        }

        // Auto-detect Reference Node if not connected
        let finalRefImage = refImage;
        if (!finalRefImage) {
          // 1. Try strict role check
          let refNode = nodes.find(n => n.type === 'image_source' && n.data.params.role === 'REF' && n.data.params.image);

          // 2. Fallback: Try label check (if user renamed node but forgot to set role)
          if (!refNode) {
            refNode = nodes.find(n => n.type === 'image_source' &&
              (n.data.label?.toLowerCase().includes('ref') || n.data.label?.toLowerCase().includes('style')) &&
              n.data.params.image
            );
          }

          if (refNode) {
            console.log(`[NodeEngine] Auto-detected disconnected Reference Node: ${refNode.id} (${refNode.data.label})`);
            finalRefImage = refNode.data.params.image;
          } else {
            console.warn("[NodeEngine] Could not find any Reference node (Role='REF' or Label contains 'Ref')");
          }
        }

        // Note: Physics and Lighting are now handled automatically inside enhanceSketch (Background Automation)
        // We pass visual control data from params if available

        if (!inputImage && !finalRefImage && !inputPrompt) {
          updateNodeStatus(node.id, 'idle');
          continue;
        }

        let defaultPrompt = "Enhance the design.";
        if (!inputImage && finalRefImage) {
          defaultPrompt = "Generate a high-fashion design based on the reference object.";
        } else if (inputImage && !finalRefImage) {
          defaultPrompt = "Enhance the fashion sketch with realistic details.";
        }

        const effectivePrompt = (inputPrompt && inputPrompt.trim().length > 0) ? inputPrompt : defaultPrompt;

        // INHERIT VISUAL CONTROLS FROM UPSTREAM if not set locally
        // Priority: Local Node Params > Upstream Source Node Params > Default
        const localLight = node.data.params.visualLightData;
        const localCamera = node.data.params.visualCameraData;

        let inheritedLight = localLight;
        let inheritedCamera = localCamera;

        if (!inheritedLight && upstreamSourceNode && upstreamSourceNode.data.params.visualLightData) {
          inheritedLight = upstreamSourceNode.data.params.visualLightData;
          // console.log("Inheriting Light Data from Upstream:", inheritedLight);
        }

        if (!inheritedCamera && upstreamSourceNode && upstreamSourceNode.data.params.visualCameraData) {
          inheritedCamera = upstreamSourceNode.data.params.visualCameraData;
        }

        // GENERATE STRUCTURAL MAPS
        // Priority: 1. Pre-generated maps from 3D Widget (params.controlMaps)
        //           2. Internal Micro-Model generation
        let structuralMaps = node.data.params.controlMaps;

        if (!structuralMaps) {
          structuralMaps = await generateStructuralMaps(inheritedLight, inheritedCamera);
        }


        const result = await enhanceSketch(
          inputImage || null,
          finalRefImage,
          effectivePrompt,
          {
            ...node.data.params,
            visualLightData: inheritedLight,
            visualCameraData: inheritedCamera,
            isPoseLocked: true,
            isClothingReplacement: false
          },
          maskImage,
          undefined, // coherenceData
          structuralMaps, // Pass generated maps
          poseControlImage // Pass pose skeleton
        );

        results[`${node.id}-image_out`] = result;
        updateNodeStatus(node.id, 'completed', result);

        // Store input hash for future comparison
        node.data.inputHash = currentInputHash;
        node.data.lastExecutionContext = {
          timestamp: Date.now(),
          inputHash: currentInputHash,
          explicitTrigger: executionContext?.explicitTrigger
        };
      }

      // --- OUTPUT / RESULT NODES ---
      else if (node.type === 'output_result') {
        // HISTORY LOCK CHECK - prevents regeneration if committed
        if (node.data.params.is_committed && node.data.result) {
          console.log(`[NodeEngine] Skipping locked node: ${node.id}`);
          updateNodeStatus(node.id, 'completed', node.data.result);
          results[`${node.id}-image`] = node.data.result;
          continue;
        }

        // FLOW ISOLATION CHECK
        const currentInputHash = computeInputHash(node, edges, results, nodes);
        // Use node.data.inputHash directly for persistence across executions
        const previousHash = node.data.inputHash;
        const hasInputChanged = previousHash ? (currentInputHash !== previousHash) : false;

        // Only regenerate if:
        // 1. Inputs have changed AND (no target filter OR this node is targeted), OR
        // 2. No cached result exists (first-time generation), OR
        // 3. Explicit trigger AND this node is targeted
        // This prevents regeneration of already generated photos when generating new ones
        const isTarget = executionContext?.targetNodeIds?.includes(node.id);

        const shouldRegenerate =
          (hasInputChanged && (!executionContext?.targetNodeIds || isTarget)) ||
          !node.data.result ||
          (executionContext?.explicitTrigger && isTarget);

        if (!shouldRegenerate) {
          console.log(`[Flow Isolation] Skipping ${node.id}: shouldRegenerate=${shouldRegenerate}, hasInputChanged=${hasInputChanged}, hasResult=${!!node.data.result}`);
          if (node.data.result) {
            results[`${node.id}-image`] = node.data.result;
            updateNodeStatus(node.id, 'completed', node.data.result);
            // Store hash if not already stored (for nodes that were generated before hash tracking)
            if (!node.data.inputHash) {
              node.data.inputHash = currentInputHash;
            }
          }
          continue;
        }

        console.log(`[Flow Isolation] Regenerating ${node.id}: inputChanged=${hasInputChanged}, explicit=${executionContext?.explicitTrigger}`);

        // INVISIBLE AI EXECUTION LAYER
        // SMART ROUTING (OUTPUT RESULT)
        let mainSubject = null;
        let refStyle = null;
        let promptIn = null;
        const rawMaskIn = getInputData('mask_in');
        const directImage = getInputData('image_in'); // Keep direct image for non-AI pass-through

        const incomingEdges = edges.filter((e: any) => e.target === node.id);
        
        for (const edge of incomingEdges) {
          const srcNode = nodes.find(n => n.id === edge.source);
          if (!srcNode) continue;
          
          const resultKey = `${edge.source}-${edge.sourceHandle}`;
          const val = results[resultKey];

          if (srcNode.type === 'input_prompt') {
            promptIn = val;
          } 
          else if (srcNode.type === 'image_source' || srcNode.type === 'output_result' || srcNode.type === 'macro') {
            const role = srcNode.data.params.role;
            console.log(`[Smart Routing] Edge from ${srcNode.id} (${srcNode.type}): Role=${role}, ValPresent=${!!val}`);
            if (role === 'REF') {
              refStyle = val;
            } else {
              // Default to MAIN
              mainSubject = val;
            }
          }
        }

        // SMART INPUT FIX 1: Treat directImage as mainSubject if explicit trigger
        if (!mainSubject && directImage && executionContext?.explicitTrigger) {
          console.log(`[output_result ${node.id}] Smart Fix: Treating directImage as mainSubject due to explicit trigger`);
          mainSubject = directImage;
        }

        // SMART INPUT FIX 2: Treat text in mask_in as promptIn (User connection error)
        if (!promptIn && typeof rawMaskIn === 'string' && !rawMaskIn.startsWith('data:') && !rawMaskIn.startsWith('http') && !rawMaskIn.startsWith('blob:')) {
          console.log(`[output_result ${node.id}] Smart Fix: Treating text in mask_in as prompt_in`);
          promptIn = rawMaskIn;
        }

        // Validate Mask Input (Must be an image string)
        const isImageString = (s: any) => typeof s === 'string' && (s.startsWith('data:image') || s.startsWith('blob:') || s.startsWith('http'));
        const maskIn = isImageString(rawMaskIn) ? rawMaskIn : null;

        // POSE EXTRACTION INTEGRATION
        // Check if the Reference Node has pre-calculated Pose Data
        let poseControlImage = null;
        const refEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'ref_style');
        if (refEdge) {
          const refNode = nodes.find(n => n.id === refEdge.source);
          if (refNode && refNode.data.params.poseData) {
            console.log(`[NodeEngine] Found Pose Data in Reference Node: ${refNode.id}`);
            poseControlImage = refNode.data.params.poseData;
          }
        }

        // SMART INPUT FIX 3: Treat refStyle as mainSubject if upstream role is MAIN
        if (!mainSubject && refStyle) {
          const refEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'ref_style');
          if (refEdge) {
            const srcNode = nodes.find(n => n.id === refEdge.source);
            if (srcNode && srcNode.data.params.role === 'MAIN') {
              console.log(`[output_result ${node.id}] Smart Fix: Treating refStyle as mainSubject because upstream role is MAIN`);
              mainSubject = refStyle;
              refStyle = null; // Clear ref to avoid ambiguity
            }
          }
        }

        // Reference is now OPTIONAL - only use if explicitly connected
        // No auto-detection to keep it simple

        // DEBUG: Log all edges connected to this node
        const connectedEdges = edges.filter((e: any) => e.target === node.id);
        console.log(`[output_result ${node.id}] Connected Edges:`, connectedEdges.map((e: any) => `${e.sourceHandle} -> ${e.targetHandle}`));

        // Debug logging to diagnose generation issues
        console.log(`[output_result ${node.id}] Inputs detected:`, {
          mainSubject: !!mainSubject,
          promptIn: !!promptIn,
          refStyle: !!refStyle,
          directImage: !!directImage,
          maskIn: !!maskIn,
          smartFixApplied: mainSubject === directImage && !!directImage
        });

        // If we have at least a main subject OR a prompt OR a reference, process it
        if (mainSubject || promptIn || refStyle) {
          console.log(`[output_result ${node.id}] Starting AI generation...`);
          updateNodeStatus(node.id, 'processing');

          // Get upstream source node for parameter inheritance
          let mainSubjectEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'main_subject');

          // Smart Fix for Edge: If we used directImage, find that edge instead
          if (!mainSubjectEdge && mainSubject === directImage) {
            mainSubjectEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'image_in');
          }

          let upstreamSourceNode = null;
          if (mainSubjectEdge) {
            upstreamSourceNode = nodes.find(n => n.id === mainSubjectEdge.source);
          }

          // Determine effective prompt
          let defaultPrompt = "Enhance the design.";
          if (!mainSubject && refStyle) {
            defaultPrompt = "Generate a high-fashion design based on the reference object.";
          } else if (mainSubject && !refStyle) {
            defaultPrompt = "Enhance the fashion sketch with realistic details.";
          }
          const effectivePrompt = (promptIn && promptIn.trim().length > 0) ? promptIn : defaultPrompt;

          // INHERIT VISUAL CONTROLS FROM UPSTREAM if not set locally
          const localLight = node.data.params.visualLightData;
          const localCamera = node.data.params.visualCameraData;

          let inheritedLight = localLight;
          let inheritedCamera = localCamera;

          if (!inheritedLight && upstreamSourceNode && upstreamSourceNode.data.params.visualLightData) {
            inheritedLight = upstreamSourceNode.data.params.visualLightData;
          }

          if (!inheritedCamera && upstreamSourceNode && upstreamSourceNode.data.params.visualCameraData) {
            inheritedCamera = upstreamSourceNode.data.params.visualCameraData;
          }

          // GENERATE STRUCTURAL MAPS
          // Priority: 1. Pre-generated maps from 3D Widget (params.controlMaps)
          //           2. Internal Micro-Model generation
          let structuralMaps = node.data.params.controlMaps;

          if (!structuralMaps) {
            structuralMaps = await generateStructuralMaps(inheritedLight, inheritedCamera);
          }


          // SELECT GENERATION ENGINE
          // Priority: Fal.ai (if Key exists) > Gemini (Default)
          console.log("[NodeEngine] Using Gemini Engine");
          const result = await enhanceSketch(
            mainSubject || null,
            refStyle,
            effectivePrompt,
            {
              ...node.data.params,
              visualLightData: inheritedLight,
              visualCameraData: inheritedCamera,
              isPoseLocked: true,
              isClothingReplacement: node.data.params.isClothingReplacement
            },
            maskIn,
            undefined, // coherenceData
            structuralMaps, // Pass generated maps
            poseControlImage // Pass pose skeleton
          );

          results[`${node.id}-image`] = result;
          updateNodeStatus(node.id, 'completed', result);

          // Store input hash for future comparison
          node.data.inputHash = currentInputHash;
          node.data.lastExecutionContext = {
            timestamp: Date.now(),
            inputHash: currentInputHash,
            explicitTrigger: executionContext?.explicitTrigger
          };
        }
        // Fallback: Direct image passthrough (backward compatibility)
        else if (directImage) {
          console.log(`[output_result ${node.id}] Using directImage passthrough (no mainSubject or promptIn)`);
          updateNodeStatus(node.id, 'completed', directImage);
          results[`${node.id}-image`] = directImage;

          // FIX: Save hash for Passthrough too, to prevent Zombie state
          node.data.inputHash = currentInputHash;
          results[`${node.id}-inputHash`] = currentInputHash; // Persist
          node.data.lastExecutionContext = {
            timestamp: Date.now(),
            inputHash: currentInputHash,
            explicitTrigger: executionContext?.explicitTrigger
          };
        }
        // No inputs, check if we have cached result
        else {
          console.log(`[output_result ${node.id}] No inputs detected, checking cached result`);
          if (node.data.result) {
            results[`${node.id}-image`] = node.data.result;
            updateNodeStatus(node.id, 'completed', node.data.result);
          } else {
            updateNodeStatus(node.id, 'processing');
          }
        }
      }

    } catch (e: any) {
      console.error(`Error executing node ${node.id}:`, e);
      updateNodeStatus(node.id, 'error', undefined, e.message || "Unknown error");
    }
  }
};
