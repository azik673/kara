import { NodeDefinition, Node, Edge, ControlMaps, LightAngleData, CameraAngleData } from '../types';
import { enhanceSketch, visualizeOnModel, extractCoherenceAttributes, analyzeFabricPhysics, analyzeEnvironmentLighting, inferAutoPhysics, getDefaultStudioLighting } from './gemini';

export const NODE_REGISTRY: Record<string, NodeDefinition> = {
  'image_source': {
    type: 'image_source',
    label: 'Image Source',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    defaultParams: { image: null, role: 'MAIN', maskData: null }, // Added maskData
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
    description: 'Visually group nodes together.'
  },
  'macro': {
    type: 'macro',
    label: 'Macro',
    category: 'modifier',
    inputs: [], // Dynamic
    outputs: [], // Dynamic
    defaultParams: { internalNodes: [], internalEdges: [], mapping: {} },
    description: 'A synthesized block of logic.'
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
      visualCameraData: null
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
      visualCameraData: null
    },
    description: 'View result and assign role for recursive design. Automatically processes AI generation when inputs are connected.'
  }
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
  resultsCache?: Record<string, any> // recursive cache passing
) => {

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

        // Calculate Light Position
        // Azimuth: 0 = Front, 90 = Right, 180 = Back, 270 = Left
        // Elevation: 90 = Top, 0 = Horizon
        const r = width * 0.4;
        const radAz = (lightData.azimuth - 90) * (Math.PI / 180); // Adjust so 0 is Top/North visually if needed, but standard is 0=Front? 
        // Let's assume standard: 0=North(Top), 90=East(Right).
        // Actually, usually 0 is Front (South) in 3D. Let's stick to visual clock: 0=12oclock.

        const cx = width / 2 + Math.cos((lightData.azimuth - 90) * Math.PI / 180) * (r * (1 - Math.abs(lightData.elevation) / 90));
        const cy = height / 2 + Math.sin((lightData.azimuth - 90) * Math.PI / 180) * (r * (1 - Math.abs(lightData.elevation) / 90));

        // Draw Light Source (Gradient)
        const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, width * 0.8);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

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
    if (n.data.result) {
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
    if (!def && node.type !== 'macro') continue;

    // Skip completed nodes (Caching)
    if (node.data.status === 'completed') {
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


      // --- MACRO EXECUTION ---
      if (node.type === 'macro') {
        updateNodeStatus(node.id, 'processing');
        const internalNodes = JSON.parse(JSON.stringify(node.data.params.internalNodes));
        const internalEdges = JSON.parse(JSON.stringify(node.data.params.internalEdges));

        const macroInputs = node.data.dynamicInputs || [];
        macroInputs.forEach((inp: any) => {
          const externalVal = getInputData(inp.id);
          if (externalVal !== undefined) {
            const [targetNodeId, targetHandle] = inp.id.split('__');
            const targetNode = internalNodes.find((n: any) => n.id === targetNodeId);
            if (targetNode) {
              if (targetHandle === 'image') targetNode.data.params.image = externalVal;
              if (targetHandle === 'text') targetNode.data.params.text = externalVal;
            }
          }
        });

        const dummyUpdate = () => { };
        const internalCache: Record<string, any> = {};
        await executeGraph(internalNodes, internalEdges, dummyUpdate, internalCache);

        const macroOutputs = node.data.dynamicOutputs || [];
        let mainResult = null;
        macroOutputs.forEach((out: any) => {
          const [sourceNodeId, sourceHandle] = out.id.split('__');
          const internalKey = `${sourceNodeId}-${sourceHandle}`;
          const val = internalCache[internalKey] || internalNodes.find((n: any) => n.id === sourceNodeId)?.data.result;
          if (val) {
            results[`${node.id}-${out.id}`] = val;
            mainResult = val;
          }
        });
        updateNodeStatus(node.id, 'completed', mainResult);
        continue;
      }


      // --- AI DESIGN GENERATOR ---
      else if (node.type === 'ai_generator') {
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

        let refImage = getInputData('ref_style');
        const maskImage = getInputData('mask_in');
        const inputPrompt = getInputData('prompt_in');

        // Auto-detect Reference Node if not connected
        if (!refImage) {
          const refNode = nodes.find(n => n.type === 'image_source' && n.data.params.role === 'REF' && n.data.params.image);
          if (refNode) {
            console.log(`[NodeEngine] Auto-detected disconnected Reference Node: ${refNode.id}`);
            refImage = refNode.data.params.image;
          }
        }

        // Note: Physics and Lighting are now handled automatically inside enhanceSketch (Background Automation)
        // We pass visual control data from params if available

        if (!inputImage && !refImage && !inputPrompt) {
          updateNodeStatus(node.id, 'idle');
          continue;
        }

        let defaultPrompt = "Enhance the design.";
        if (!inputImage && refImage) {
          defaultPrompt = "Generate a high-fashion design based on the reference object.";
        } else if (inputImage && !refImage) {
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
          refImage,
          effectivePrompt,
          {
            ...node.data.params,
            visualLightData: inheritedLight,
            visualCameraData: inheritedCamera
          },
          maskImage,
          undefined, // coherenceData
          structuralMaps // Pass generated maps
        );

        results[`${node.id}-image_out`] = result;
        updateNodeStatus(node.id, 'completed', result);
      }

      // --- OUTPUT / RESULT NODES ---
      else if (node.type === 'output_result') {
        // INVISIBLE AI EXECUTION LAYER
        // Check if we have AI generation inputs (main_subject, ref_style, prompt_in)
        const mainSubject = getInputData('main_subject');
        let refStyle = getInputData('ref_style');
        const promptIn = getInputData('prompt_in');
        const maskIn = getInputData('mask_in');
        const directImage = getInputData('image_in');

        // Auto-detect Reference Node if not connected
        if (!refStyle) {
          const refNode = nodes.find(n => n.type === 'image_source' && n.data.params.role === 'REF' && n.data.params.image);
          if (refNode) {
            console.log(`[NodeEngine] Auto-detected disconnected Reference Node: ${refNode.id}`);
            refStyle = refNode.data.params.image;
          }
        }

        // If we have AI generation inputs, automatically process them
        if (mainSubject || refStyle || promptIn) {
          updateNodeStatus(node.id, 'processing');

          // Get upstream source node for parameter inheritance
          const mainSubjectEdge = edges.find((e: any) => e.target === node.id && e.targetHandle === 'main_subject');
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

          // Perform AI generation (invisible layer)
          const result = await enhanceSketch(
            mainSubject || null,
            refStyle,
            effectivePrompt,
            {
              ...node.data.params,
              visualLightData: inheritedLight,
              visualCameraData: inheritedCamera
            },
            maskIn,
            undefined, // coherenceData
            structuralMaps // Pass generated maps
          );

          results[`${node.id}-image`] = result;
          updateNodeStatus(node.id, 'completed', result);
        }
        // Fallback: Direct image passthrough (backward compatibility)
        else if (directImage) {
          updateNodeStatus(node.id, 'completed', directImage);
          results[`${node.id}-image`] = directImage;
        }
        // No inputs, check if we have cached result
        else {
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
