import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Ring, Sphere } from '@react-three/drei';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';

const Radar3DScene = () => {
  const ringRef = useRef<any>();
  const sphereRef = useRef<any>();

  useFrame((state, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.5; // Sweep rotation
    }
    if (sphereRef.current) {
      sphereRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 10]} intensity={0.8} />

      {/* Radar Rings */}
      <Ring ref={ringRef} args={[1, 1.1, 64]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#4ECDC4" transparent opacity={0.6} />
      </Ring>
      <Ring args={[1.5, 1.6, 64]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#FFD700" transparent opacity={0.4} />
      </Ring>
      <Ring args={[2, 2.1, 64]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#FF5252" transparent opacity={0.3} />
      </Ring>

      {/* Center Sphere */}
      <Sphere ref={sphereRef} args={[0.3, 32, 32]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#2DD4BF" emissive="#2DD4BF" emissiveIntensity={0.2} />
      </Sphere>
    </>
  );
};

const Home3DAnimation = () => {
  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={(gl) => {
          // GL context created
        }}
      >
        <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
          <Radar3DScene />
          <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
      </GLView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  glView: {
    flex: 1,
  },
});

export default Home3DAnimation;