import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TorusKnot } from '@react-three/drei';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';

const RotatingTorus = () => {
  const meshRef = useRef<any>();

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta;
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <TorusKnot ref={meshRef} args={[1, 0.4, 100, 16]}>
      <meshStandardMaterial color="#2DD4BF" wireframe />
    </TorusKnot>
  );
};

const ThreeDAnimation = () => {
  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={(gl) => {
          // GL context is created
        }}
      >
        <Canvas>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <RotatingTorus />
          <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
      </GLView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  glView: {
    flex: 1,
  },
});

export default ThreeDAnimation;