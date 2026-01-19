// @ts-nocheck
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import * as THREE from 'three';

// Register Line2 for use with JSX
extend({ Line2, LineMaterial, LineGeometry });

// Radar hedefi bileşeni
const RadarBlip = ({ position, size = 0.05 }: { position: [number, number, number]; size?: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 2;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.02;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial color="#ff5252" emissive="#ff5252" emissiveIntensity={0.5} />
    </mesh>
  );
};

// Radar halkası bileşeni
const RadarRing = ({ radius, y = 0 }: { radius: number; y?: number }) => {
  const meshRef = useRef<THREE.Line2>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.5;
    }
  });

  const points = useMemo(() => {
    const pts = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
    return pts;
  }, [radius, y]);

  const geometry = useMemo(() => {
    return new LineGeometry();
  }, []);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.geometry.setPositions(points.flat());
    }
  }, [points, geometry]);

  return (
    <line2 ref={meshRef} geometry={geometry}>
      <lineMaterial color="#4ecdc4" linewidth={2} transparent opacity={0.8} />
    </line2>
  );
};

// Radar tabanı bileşeni
const RadarBase = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <cylinderGeometry args={[0.5, 0.5, 0.02, 64]} />
      <meshStandardMaterial 
        color="#0c1424" 
        emissive="#0c1424" 
        emissiveIntensity={0.2}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
};

// Ana 3B radar sahnesi
const Radar3DScene = ({ rotationSpeed = 1, pulseEnabled = true }: { rotationSpeed?: number; pulseEnabled?: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Rastgele radar hedefleri
  const blips = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i * 45) * (Math.PI / 180);
      const distance = 0.2 + Math.random() * 0.25;
      return {
        id: i,
        position: [
          Math.cos(angle) * distance,
          Math.random() * 0.1 - 0.05,
          Math.sin(angle) * distance
        ] as [number, number, number],
        size: 0.03 + Math.random() * 0.03
      };
    });
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.5 * rotationSpeed;
      
      if (pulseEnabled) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
        groupRef.current.scale.set(scale, 1, scale);
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Radar tabanı */}
      <RadarBase />
      
      {/* Radar halkaları */}
      <RadarRing radius={0.125} />
      <RadarRing radius={0.25} />
      <RadarRing radius={0.375} />
      <RadarRing radius={0.5} />
      
      {/* Radar hedefleri */}
      {blips.map((blip) => (
        <RadarBlip key={blip.id} position={blip.position} size={blip.size} />
      ))}
      
      {/* Merkez nokta */}
      <mesh position={[0, 0.02, 0]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshStandardMaterial color="#2196f3" emissive="#2196f3" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
};

// Ana Canvas bileşeni
const Radar3DSceneCanvas = ({ rotationSpeed = 1, pulseEnabled = true }: { rotationSpeed?: number; pulseEnabled?: boolean }) => {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 0.8], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, 10, -10]} intensity={0.5} color="#4ecdc4" />
      
      <Radar3DScene rotationSpeed={rotationSpeed} pulseEnabled={pulseEnabled} />
      
      <OrbitControls 
        enablePan={false} 
        enableZoom={false} 
        enableRotate={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.5}
      />
    </Canvas>
  );
};

export default Radar3DSceneCanvas;
// @ts-nocheck
