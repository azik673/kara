import { get, set, del, clear } from 'idb-keyval';
import { Node, Edge } from 'reactflow';
import { Layer } from '../types';

export interface ProjectState {
    id: string;
    lastModified: number;
    nodes: Node[];
    edges: Edge[];
    layerState: Layer[];
    images: Record<string, string>; // Map of imageId -> Base64 Data URL
    canvasSize?: { width: number; height: number };
}

const PROJECT_KEY = 'atelier_current_project';

export const storageService = {
    // Save the entire project state
    saveProject: async (state: ProjectState): Promise<void> => {
        try {
            await set(PROJECT_KEY, state);
            console.log('[Storage] Project saved successfully', new Date().toISOString());
        } catch (error) {
            console.error('[Storage] Failed to save project:', error);
        }
    },

    // Load the project state
    loadProject: async (): Promise<ProjectState | undefined> => {
        try {
            const state = await get<ProjectState>(PROJECT_KEY);
            if (state) {
                console.log('[Storage] Project loaded successfully');
                return state;
            }
            return undefined;
        } catch (error) {
            console.error('[Storage] Failed to load project:', error);
            return undefined;
        }
    },

    // Get all images (placeholder for now, as images are inside nodes)
    getImages: async (): Promise<any[]> => {
        return [];
    },

    // Clear the current project
    clearProject: async (): Promise<void> => {
        try {
            await del(PROJECT_KEY);
            console.log('[Storage] Project cleared');
        } catch (error) {
            console.error('[Storage] Failed to clear project:', error);
        }
    },

    // Helper to estimate storage usage (optional)
    estimateUsage: async (): Promise<{ usage: number; quota: number } | undefined> => {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0
            };
        }
        return undefined;
    },

    // Export Project to File
    exportProjectToFile: async (projectName: string = 'project'): Promise<void> => {
        try {
            const state = await get<ProjectState>(PROJECT_KEY);
            if (!state) {
                alert('No project data to export.');
                return;
            }

            const dataStr = JSON.stringify(state, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.atelier`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('[Storage] Project exported successfully');
        } catch (error) {
            console.error('[Storage] Failed to export project:', error);
            alert('Failed to export project.');
        }
    },

    // Import Project from File
    importProjectFromFile: async (file: File): Promise<boolean> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const text = e.target?.result as string;
                    const state = JSON.parse(text) as ProjectState;

                    // Basic validation
                    if (!state.nodes || !state.edges) {
                        throw new Error('Invalid project file format: missing nodes or edges.');
                    }

                    await set(PROJECT_KEY, state);
                    console.log('[Storage] Project imported successfully');
                    resolve(true);
                } catch (error) {
                    console.error('[Storage] Failed to import project:', error);
                    alert('Failed to import project. Invalid file format.');
                    resolve(false);
                }
            };
            reader.readAsText(file);
        });
    }
};
