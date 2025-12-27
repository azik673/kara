import React, { useState, useEffect } from 'react';
import { X, Share2, ChevronDown, Lock, Globe, Trash2, Download, Upload } from 'lucide-react';
import { UserRole } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ProjectSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    projectName: string;
    onProjectNameChange: (name: string) => void;
    selectedModel: string;
    onModelChange: (model: string) => void;
    shareRole: UserRole;
    onShareRoleChange: (role: UserRole) => void;
}

const MODELS = [
    'Stable Diffusion XL',
    'Flux.1 Dev',
    'Flux.1 Schnell',
    'Midjourney V6',
    'DALL-E 3'
];

const ROLES: UserRole[] = [
    'CONSTRUCTOR',
    'USER_ADMIN',
    'USER_EDITOR',
    'USER_VIEWER'
];

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
    isOpen,
    onClose,
    projectName,
    onProjectNameChange,
    selectedModel,
    onModelChange,
    shareRole,
    onShareRoleChange
}) => {
    const [isModelOpen, setIsModelOpen] = useState(false);
    const [isRoleOpen, setIsRoleOpen] = useState(false);
    const [testStatus, setTestStatus] = useState<string | null>(null);

    const handleTestAPI = async () => {
        setTestStatus('Testing...');
        try {
            const rawApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI || process.env.gemini;
            const apiKey = rawApiKey?.trim();
            if (!apiKey) throw new Error("No API key found in process.env");
            
            console.log(`[TestAPI] API Key found (length: ${apiKey.length}, prefix: ${apiKey.substring(0, 4)}, suffix: ${apiKey.substring(apiKey.length - 4)})`);
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
            
            const result = await model.generateContent('Say "API Working"');
            const response = await result.response;
            const text = response.text();
            
            setTestStatus(text ? `Success: ${text}` : 'Failed: No text in response');
            console.log("[TestAPI] Response:", text);
        } catch (error: any) {
            console.error("[TestAPI] Error:", error);
            let errorMessage = error.message || "Unknown error";
            if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota")) {
                errorMessage = "Quota Exceeded: The API key has reached its usage limit.";
            }
            setTestStatus(`Error: ${errorMessage}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] pointer-events-none animate-in fade-in duration-300">
            <div
                className="absolute top-20 left-6 w-[300px] bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-[32px] p-5 shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden animate-in slide-in-from-top-2 duration-300 pointer-events-auto"
            >
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-medium text-white tracking-tight">Project settings</h2>
                </div>

                <div className="space-y-3">
                    {/* Project Name */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-white/40 ml-1 uppercase tracking-wider">Name</label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={(e) => onProjectNameChange(e.target.value)}
                            placeholder="Fill..."
                            className="w-full bg-white/5 border border-white/10 rounded-full py-2 px-4 text-sm text-white placeholder-white/20 focus:border-white/50 focus:outline-none transition-all"
                        />
                    </div>

                    {/* AI Model Selection */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-white/40 ml-1 uppercase tracking-wider">AI model</label>
                        <div className="relative">
                            <button
                                onClick={() => setIsModelOpen(!isModelOpen)}
                                className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-full py-2 px-4 text-white hover:bg-white/10 transition-all"
                            >
                                <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform duration-300 ${isModelOpen ? 'rotate-180' : ''}`} />
                                <span className={selectedModel ? 'text-white text-xs' : 'text-white/20 text-xs'}>
                                    {selectedModel || 'Select the model'}
                                </span>
                            </button>

                            {isModelOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                                    {MODELS.map(model => (
                                        <button
                                            key={model}
                                            onClick={() => {
                                                onModelChange(model);
                                                setIsModelOpen(false);
                                            }}
                                            className="w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            {model}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sharing Link */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-white/40 ml-1 uppercase tracking-wider">Link</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <button
                                    onClick={() => setIsRoleOpen(!isRoleOpen)}
                                    className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-full py-2 px-4 text-white hover:bg-white/10 transition-all"
                                >
                                    <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform duration-300 ${isRoleOpen ? 'rotate-180' : ''}`} />
                                    <span className={shareRole ? 'text-white text-xs' : 'text-white/20 text-xs'}>
                                        {shareRole || 'Select the role'}
                                    </span>
                                </button>

                                {isRoleOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                                        {ROLES.map(role => (
                                            <button
                                                key={role}
                                                onClick={() => {
                                                    onShareRoleChange(role);
                                                    setIsRoleOpen(false);
                                                }}
                                                className="w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                                            >
                                                {role}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                className="p-2.5 bg-white/5 border border-white/10 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all group"
                                title="Share Project"
                            >
                                <Share2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            </button>
                        </div>
                    </div>

                    {/* Test API Button */}
                    <div className="pt-2 border-t border-white/10">
                        <button
                            onClick={handleTestAPI}
                            className="w-full py-2 px-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-full text-[11px] font-medium text-blue-400 transition-all"
                        >
                            {testStatus || 'Test Gemini API'}
                        </button>
                    </div>

                    {/* Export / Import */}
                    <div className="pt-4 mt-4 border-t border-white/10 space-y-2">
                        <button
                            onClick={async () => {
                                const { storageService } = await import('../services/storage');
                                await storageService.exportProjectToFile(projectName);
                            }}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export Project to File
                        </button>

                        <div className="relative">
                            <input
                                type="file"
                                accept=".atelier,.json"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={async (e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        if (window.confirm('Importing a project will overwrite your current work. Continue?')) {
                                            const { storageService } = await import('../services/storage');
                                            const success = await storageService.importProjectFromFile(e.target.files[0]);
                                            if (success) {
                                                window.location.reload();
                                            }
                                        }
                                        // Reset input
                                        e.target.value = '';
                                    }
                                }}
                            />
                            <button
                                className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 pointer-events-none"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                Import Project from File
                            </button>
                        </div>
                    </div>

                    {/* Reset Project */}
                    <div className="pt-4 mt-4 border-t border-white/10">
                        <button
                            onClick={async () => {
                                if (window.confirm('Are you sure you want to reset the project? This will clear all saved data and cannot be undone.')) {
                                    const { storageService } = await import('../services/storage');
                                    await storageService.clearProject();
                                    window.location.reload();
                                }
                            }}
                            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Reset Project Data
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
