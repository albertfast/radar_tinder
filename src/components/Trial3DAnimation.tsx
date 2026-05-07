import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TorusKnot, Sphere, Box } from '@react-three/drei';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';

const Premium3DScene = () => {
  const torusRef = useRef<any>();
  const sphereRef = useRef<any>();
  const boxRef = useRef<any>();

  useFrame((state, delta) => {
    if (torusRef.current) {
      torusRef.current.rotation.x += delta * 0.5;
      torusRef.current.rotation.y += delta * 0.3;
    }
    if (sphereRef.current) {
      sphereRef.current.rotation.x += delta * 0.2;
      sphereRef.current.rotation.y += delta * 0.4;
    }
    if (boxRef.current) {
      boxRef.current.rotation.x += delta * 0.1;
      boxRef.current.rotation.z += delta * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />

      <TorusKnot ref={torusRef} args={[1.5, 0.4, 100, 16]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#2DD4BF" wireframe />
      </TorusKnot>

      <Sphere ref={sphereRef} args={[0.5, 32, 32]} position={[2, 1, 0]}>
        <meshStandardMaterial color="#FFD700" />
      </Sphere>

      <Box ref={boxRef} args={[0.8, 0.8, 0.8]} position={[-2, -1, 0]}>
        <meshStandardMaterial color="#FF5252" />
      </Box>
    </>
  );
};

const Trial3DAnimation = () => {
  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={(gl) => {
          // GL context created
        }}
      >
        <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
          <Premium3DScene />
          <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
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

export default Trial3DAnimation;