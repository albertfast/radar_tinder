// @ts-nocheck
import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, Group, Skia, useClock, RoundedRect, Circle, Line } from '@shopify/react-native-skia';
import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const SIZE = width * 0.8;

interface RadarBlipProps {
  x: number;
  y: number;
  size: number;
  color: string;
}

// 3B benzeri radar hedefi
const RadarBlip3D = ({ x, y, size, color }: RadarBlipProps) => {
  const clock = useClock();
  
  return (
    <Group transform={[{ translateX: x, translateY: y }]}>
      <Circle
        r={size}
        color={color}
        opacity={0.8 + Math.sin(clock * 3) * 0.2}
      />
      {/* 3B efekti için gölge */}
      <Circle
        r={size * 1.5}
        color={color}
        opacity={0.2}
        transform={[{ translateY: size * 0.5 }]}
      />
    </Group>
  );
};

// 3B benzeri radar halkası
const RadarRing3D = ({ radius, color }: { radius: number; color: string }) => {
  const clock = useClock();
  
  return (
    <Group>
      {/* Ü halka - daha parlak */}
      <Circle
        r={radius}
        color={color}
        opacity={0.6 + Math.sin(clock * 2) * 0.2}
        style="stroke"
        strokeWidth={2}
      />
      {/* Alt halka - gölge efekti */}
      <Circle
        r={radius}
        color={color}
        opacity={0.3}
        style="stroke"
        strokeWidth={1}
        transform={[{ translateY: 4 }]}
      />
      {/* Dikey çizgiler için 3B derinlik efekti */}
      <Line
        p1={[{ x: 0, y: 0 }]}
        p2={[{ x: 0, y: 8 }]}
        color={color}
        opacity={0.4}
        strokeWidth={1}
        transform={[{ translateX: radius }]}
      />
      <Line
        p1={[{ x: 0, y: 0 }]}
        p2={[{ x: 0, y: 8 }]}
        color={color}
        opacity={0.4}
        strokeWidth={1}
        transform={[{ translateX: -radius }]}
      />
    </Group>
  );
};

// Ana 3B radar sahnesi
const Radar3DSkia = ({ rotationSpeed = 1, pulseEnabled = true }: { rotationSpeed?: number; pulseEnabled?: boolean }) => {
  const clock = useClock();
  
  // Rastgele radar hedefleri
  const radarBlips = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i * 45) * (Math.PI / 180);
      const distance = 0.2 + Math.random() * 0.25;
      return {
        id: i,
        x: Math.cos(angle) * distance * SIZE / 2,
        y: Math.sin(angle) * distance * SIZE / 2,
        size: 4 + Math.random() * 4,
        color: i % 3 === 0 ? '#FF5252' : '#4ECDC4' // Farkı renkler
      };
    });
  }, []);

  // Perspektif dönüşüm için 3B efekt
  const perspectiveTransform = useMemo(() => {
    const perspective = 0.8;
    const scale = 1 + Math.sin(clock * rotationSpeed) * 0.05;
    return [
      { scale },
      { translateX: Math.sin(clock * 0.5) * 10 * perspective },
      { translateY: Math.cos(clock * 0.3) * 5 * perspective }
    ];
  }, [clock, rotationSpeed]);

  const pulseScale = pulseEnabled ? (1 + Math.sin(clock * 2) * 0.1) : 1;

  return (
    <Canvas style={{ width: SIZE, height: SIZE }}>
      <Skia>
        <Group
          transform={[
            { translateX: SIZE / 2 },
            { translateY: SIZE / 2 },
            { scale: pulseScale },
            ...perspectiveTransform
          ]}
        >
          {/* Radar tabanı - 3B efektli */}
          <RoundedRect
            x={-SIZE * 0.45}
            y={-SIZE * 0.45}
            width={SIZE * 0.9}
            height={SIZE * 0.9}
            r={SIZE * 0.45}
            color="#0C1424"
            opacity={0.9}
          />
          
          {/* Derinlik katmanları */}
          <RoundedRect
            x={-SIZE * 0.43}
            y={-SIZE * 0.43}
            width={SIZE * 0.86}
            height={SIZE * 0.86}
            r={SIZE * 0.43}
            color="#1A2F4A"
            opacity={0.5}
          />
          <RoundedRect
            x={-SIZE * 0.41}
            y={-SIZE * 0.41}
            width={SIZE * 0.82}
            height={SIZE * 0.82}
            r={SIZE * 0.41}
            color="#2A3F5A"
            opacity={0.3}
          />
          
          {/* Radar halkaları - 3B efektli */}
          <RadarRing3D radius={SIZE * 0.125} color="#4ECDC4" />
          <RadarRing3D radius={SIZE * 0.25} color="#4ECDC4" />
          <RadarRing3D radius={SIZE * 0.375} color="#4ECDC4" />
          <RadarRing3D radius={SIZE * 0.45} color="#4ECDC4" />
          
          {/* Tarama çizgisi - 3B efektli */}
          <Group transform={[{ rotate: clock * rotationSpeed * 60 }]}>
            <Line
              p1={[{ x: 0, y: 0 }]}
              p2={[{ x: SIZE * 0.4, y: 0 }]}
              color="#4ECDC4"
              strokeWidth={3}
              opacity={0.8}
            />
            <Line
              p1={[{ x: SIZE * 0.4, y: 0 }]}
              p2={[{ x: SIZE * 0.4, y: SIZE * 0.4 }]}
              color="#4ECDC4"
              strokeWidth={3}
              opacity={0.6}
            />
            <Line
              p1={[{ x: SIZE * 0.4, y: SIZE * 0.4 }]}
              p2={[{ x: 0, y: SIZE * 0.4 }]}
              color="#4ECDC4"
              strokeWidth={3}
              opacity={0.4}
            />
            <Line
              p1={[{ x: 0, y: SIZE * 0.4 }]}
              p2={[{ x: 0, y: 0 }]}
              color="#4ECDC4"
              strokeWidth={3}
              opacity={0.2}
            />
          </Group>
          
          {/* Radar hedefleri */}
          {radarBlips.map((blip) => (
            <RadarBlip3D
              key={blip.id}
              x={blip.x}
              y={blip.y}
              size={blip.size}
              color={blip.color}
            />
          ))}
          
          {/* Merkez nokta - 3B efektli */}
          <Group>
            <Circle
              r={6}
              color="#2196F3"
              opacity={0.9}
            />
            <Circle
              r={10}
              color="#2196F3"
              opacity={0.4}
            />
            <Circle
              r={14}
              color="#2196F3"
              opacity={0.2}
            />
          </Group>
        </Group>
      </Skia>
    </Canvas>
  );
};

export default Radar3DSkia;
// @ts-nocheck
