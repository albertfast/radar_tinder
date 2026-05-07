import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box } from '@react-three/drei';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';

const Chart3DScene = () => {
  const bars = useRef<any[]>([]);

  useFrame((state, delta) => {
    bars.current.forEach((bar, index) => {
      if (bar) {
        bar.position.y = Math.sin(state.clock.elapsedTime + index * 0.5) * 0.5 + 1;
      }
    });
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />

      {/* 3D Bars */}
      {Array.from({ length: 5 }, (_, i) => (
        <Box
          key={i}
          ref={(ref) => (bars.current[i] = ref)}
          args={[0.3, 2, 0.3]}
          position={[i * 0.5 - 1, 1, 0]}
        >
          <meshStandardMaterial color={`hsl(${i * 60}, 70%, 50%)`} />
        </Box>
      ))}
    </>
  );
};

const Graph3DAnimation = () => {
  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={(gl) => {
          // GL context created
        }}
      >
        <Canvas camera={{ position: [0, 2, 5], fov: 75 }}>
          <Chart3DScene />
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

export default Graph3DAnimation;