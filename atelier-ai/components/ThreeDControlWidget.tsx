import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, PerspectiveCamera, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { ControlMaps, LightAngleData, CameraAngleData } from '../types';
import { Camera, Sun } from 'lucide-react';

interface ThreeDControlWidgetProps {
    lightData: LightAngleData;
    cameraData: CameraAngleData;
    onLightChange: (data: LightAngleData) => void;
    onCameraChange: (data: CameraAngleData) => void;
    onMapsGenerated?: (maps: ControlMaps) => void;
}

type ControlMode = 'camera' | 'light';

// --- SCENE CONTENT ---
const SceneContent = ({
    lightData,
    cameraData,
    onLightChange,
    onCameraChange,
    onMapsGenerated,
    controlMode
}: ThreeDControlWidgetProps & { controlMode: ControlMode }) => {
    const { camera, gl, scene } = useThree();
    const meshRef = useRef<THREE.Group>(null);
    const lightRef = useRef<THREE.DirectionalLight>(null);
    const lightSphereRef = useRef<THREE.Mesh>(null);
    const orbitControlsRef = useRef<any>(null);

    // Convert Azimuth/Elevation to Vector3
    const lightPos = useMemo(() => {
        const r = 5;
        const phi = (90 - lightData.elevation) * (Math.PI / 180);
        const theta = (lightData.azimuth - 90) * (Math.PI / 180);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z);
    }, [lightData]);

    // Update Camera data from OrbitControls
    useEffect(() => {
        if (controlMode === 'camera' && orbitControlsRef.current) {
            const controls = orbitControlsRef.current;
            // Extract camera position and calculate distance/height
            const distance = controls.getDistance();
            const polarAngle = controls.getPolarAngle();

            // Map distance to categories
            let distCategory: 'close' | 'medium' | 'far' | 'wide' = 'medium';
            if (distance < 3) distCategory = 'close';
            else if (distance < 5) distCategory = 'medium';
            else if (distance < 8) distCategory = 'far';
            else distCategory = 'wide';

            // Map polar angle to height ratio
            const heightRatio = (Math.PI / 2 - polarAngle) / (Math.PI / 2);

            onCameraChange({
                distance: distCategory,
                heightRatio: Math.max(-1, Math.min(1, heightRatio)),
                framing: cameraData.framing
            });
        }
    }, [controlMode]);

    // --- MAP GENERATION LOGIC ---
    useEffect(() => {
        const timer = setTimeout(() => {
            captureMaps();
        }, 500);
        return () => clearTimeout(timer);
    }, [lightData, cameraData]);

    const captureMaps = () => {
        if (!onMapsGenerated) return;

        const originalBg = scene.background;
        const originalOverride = scene.overrideMaterial;

        // -- NORMAL MAP --
        scene.background = new THREE.Color('#8080FF');
        scene.overrideMaterial = new THREE.MeshNormalMaterial();
        gl.render(scene, camera);
        const normalMap = gl.domElement.toDataURL('image/png');

        // -- DEPTH MAP --
        scene.background = new THREE.Color('#000000');
        scene.overrideMaterial = new THREE.MeshDepthMaterial();
        gl.render(scene, camera);
        const depthMap = gl.domElement.toDataURL('image/png');

        // -- SHADOW MAP --
        scene.background = new THREE.Color('#000000');
        const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        scene.overrideMaterial = whiteMat;
        gl.render(scene, camera);
        const shadowMap = gl.domElement.toDataURL('image/png');

        // Restore
        scene.background = originalBg;
        scene.overrideMaterial = originalOverride;
        gl.render(scene, camera);

        onMapsGenerated({ shadowMap, normalMap, depthMap });
    };

    return (
        <>
            <ambientLight intensity={0.2} />
            <directionalLight
                ref={lightRef}
                position={lightPos}
                intensity={1.5}
                castShadow
                shadow-mapSize={[1024, 1024]}
            />

            {/* Main Sphere (Subject) */}
            <group ref={meshRef} position={[0, 1, 0]}>
                <mesh castShadow receiveShadow>
                    <sphereGeometry args={[0.8, 64, 64]} />
                    <meshStandardMaterial
                        color="#e0e0e0"
                        roughness={0.3}
                        metalness={0.1}
                    />
                </mesh>
            </group>

            {/* Light Position Indicator (Yellow Sphere) */}
            {controlMode === 'light' && (
                <mesh ref={lightSphereRef} position={lightPos}>
                    <sphereGeometry args={[0.15, 16, 16]} />
                    <meshBasicMaterial color="#ffd700" />
                </mesh>
            )}

            <ContactShadows opacity={0.6} scale={10} blur={2} far={4} />

            <OrbitControls
                ref={orbitControlsRef}
                enableRotate={controlMode === 'camera'}
                enableZoom={controlMode === 'camera'}
                enablePan={false}
                minPolarAngle={0}
                maxPolarAngle={Math.PI / 1.8}
                minDistance={2}
                maxDistance={10}
            />

            <gridHelper args={[10, 10, '#444', '#222']} />
        </>
    );
};

export const ThreeDControlWidget: React.FC<ThreeDControlWidgetProps> = (props) => {
    const [controlMode, setControlMode] = useState<ControlMode>('light');

    return (
        <div className="w-full h-[240px] bg-[#050505] rounded-lg overflow-hidden relative border border-[#333]">
            {/* Control Mode Toggle */}
            <div className="absolute top-2 left-2 z-10 flex gap-1 bg-black/60 rounded p-1">
                <button
                    onClick={() => setControlMode('camera')}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${controlMode === 'camera'
                            ? 'bg-blue-600 text-white'
                            : 'bg-transparent text-gray-400 hover:text-white'
                        }`}
                    title="Camera Control Mode"
                >
                    <Camera className="w-3 h-3" />
                    Cam
                </button>
                <button
                    onClick={() => setControlMode('light')}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${controlMode === 'light'
                            ? 'bg-yellow-600 text-white'
                            : 'bg-transparent text-gray-400 hover:text-white'
                        }`}
                    title="Light Control Mode"
                >
                    <Sun className="w-3 h-3" />
                    Light
                </button>
            </div>

            {/* Mode Indicator */}
            <div className="absolute top-2 right-2 z-10 pointer-events-none">
                <span className={`text-[10px] font-mono uppercase px-2 py-1 rounded ${controlMode === 'camera'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-600/40'
                        : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40'
                    }`}>
                    {controlMode === 'camera' ? '📷 Camera Mode' : '💡 Light Mode'}
                </span>
            </div>

            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.5, 4], fov: 45 }}>
                <Suspense fallback={null}>
                    <SceneContent {...props} controlMode={controlMode} />
                </Suspense>
            </Canvas>
        </div>
    );
};
