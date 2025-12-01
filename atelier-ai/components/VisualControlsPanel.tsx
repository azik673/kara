import React, { useState, useEffect } from 'react';
import { Sparkles, Sun, Camera } from 'lucide-react';
import { ControlMaps, LightAngleData } from '../types';
import { LIGHT_PRESETS, CAMERA_PRESETS, LightPreset, CameraPreset } from '../presets';
import { PresetSelector } from './PresetSelector';

interface VisualControlsPanelProps {
    lightData: LightAngleData;
    cameraData: { distance: string, heightRatio: number, framing: string };
    onLightChange: (val: any) => void;
    onCameraChange: (val: any) => void;
    onMapsGenerated?: (maps: ControlMaps) => void;
}

export const VisualControlsPanel: React.FC<VisualControlsPanelProps> = ({
    lightData,
    cameraData,
    onLightChange,
    onCameraChange,
    onMapsGenerated
}) => {
    // Find current presets based on data
    const getCurrentLightPreset = (): string[] => {
        if (lightData?.lights && Array.isArray(lightData.lights)) {
            return lightData.lights.map(l => {
                const preset = LIGHT_PRESETS.find(p =>
                    p.azimuth === l.azimuth && p.elevation === l.elevation
                );
                return preset?.id;
            }).filter(Boolean) as string[];
        }

        const current = LIGHT_PRESETS.find(p =>
            p.azimuth === lightData?.azimuth && p.elevation === lightData?.elevation
        );
        return current ? [current.id] : ['frontal'];
    };

    const getCurrentCameraPreset = (): CameraPreset => {
        const current = CAMERA_PRESETS.find(p =>
            p.heightRatio === cameraData?.heightRatio && p.distance === cameraData?.distance
        );
        return current?.id || 'eye-level';
    };

    const [selectedLight, setSelectedLight] = useState<string[]>(getCurrentLightPreset());
    const [selectedCamera, setSelectedCamera] = useState<CameraPreset>(getCurrentCameraPreset());
    const [lightEnabled, setLightEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);

    const handleLightSelect = (id: string | string[]) => {
        if (Array.isArray(id)) {
            // Multi-select mode
            setSelectedLight(id as LightPreset[]);

            // Convert multiple presets to light data array
            const lights = id.map(lightId => {
                const preset = LIGHT_PRESETS.find(p => p.id === lightId);
                return preset ? { azimuth: preset.azimuth, elevation: preset.elevation, preset: preset.prompt } : null;
            }).filter(Boolean);

            onLightChange({ lights }); // Send array of lights
        }
    };

    const handleCameraSelect = (id: string | string[]) => {
        if (typeof id === 'string') {
            const preset = CAMERA_PRESETS.find(p => p.id === id);
            if (preset) {
                setSelectedCamera(preset.id as CameraPreset);
                onCameraChange({
                    distance: preset.distance,
                    heightRatio: preset.heightRatio,
                    framing: cameraData?.framing || 'portrait'
                });
            }
        }
    };

    const handleLightToggle = () => {
        const newState = !lightEnabled;
        setLightEnabled(newState);
        if (!newState) {
            onLightChange(null);
        } else {
            const lights = selectedLight.map(lightId => {
                const preset = LIGHT_PRESETS.find(p => p.id === lightId);
                return preset ? { azimuth: preset.azimuth, elevation: preset.elevation, preset: preset.prompt } : null;
            }).filter(Boolean);
            onLightChange({ lights });
        }
    };

    const handleCameraToggle = () => {
        const newState = !cameraEnabled;
        setCameraEnabled(newState);
        if (!newState) {
            onCameraChange(null);
        } else {
            const preset = CAMERA_PRESETS.find(p => p.id === selectedCamera);
            if (preset) {
                onCameraChange({
                    distance: preset.distance,
                    heightRatio: preset.heightRatio,
                    framing: cameraData?.framing || 'portrait'
                });
            }
        }
    };

    return (
        <div className="space-y-4 bg-[#151515] p-3 rounded border border-[#222]">
            <div className="flex items-center gap-2 text-fashion-accent border-b border-[#333] pb-2">
                <Sparkles className="w-4 h-4" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Studio Control</h4>
            </div>

            {/* Light Angle Control */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sun className="w-3 h-3 text-yellow-500" />
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                            Light Angles
                        </label>
                    </div>
                    <button
                        onClick={handleLightToggle}
                        className={`w-10 h-5 rounded-full transition-colors relative ${lightEnabled ? 'bg-yellow-600' : 'bg-gray-700'}`}
                        title={lightEnabled ? 'Disable Light Control' : 'Enable Light Control'}
                    >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${lightEnabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                </div>
                {lightEnabled && (
                    <PresetSelector
                        presets={LIGHT_PRESETS}
                        selected={selectedLight}
                        onSelect={handleLightSelect}
                        title=""
                        multiSelect={true}
                        maxSelect={3}
                    />
                )}
                {!lightEnabled && (
                    <div className="text-[10px] text-gray-600 italic py-2 text-center">
                        Light control disabled
                    </div>
                )}
            </div>

            {/* Camera Angle Control */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Camera className="w-3 h-3 text-blue-500" />
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                            Camera Angle
                        </label>
                    </div>
                    <button
                        onClick={handleCameraToggle}
                        className={`w-10 h-5 rounded-full transition-colors relative ${cameraEnabled ? 'bg-blue-600' : 'bg-gray-700'}`}
                        title={cameraEnabled ? 'Disable Camera Control' : 'Enable Camera Control'}
                    >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${cameraEnabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                </div>
                {cameraEnabled && (
                    <PresetSelector
                        presets={CAMERA_PRESETS}
                        selected={selectedCamera}
                        onSelect={handleCameraSelect}
                        title=""
                    />
                )}
                {!cameraEnabled && (
                    <div className="text-[10px] text-gray-600 italic py-2 text-center">
                        Camera control disabled
                    </div>
                )}
            </div>
        </div>
    );
};
