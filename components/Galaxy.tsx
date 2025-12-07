import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GalaxyConfig } from '../types';

interface GalaxyProps {
  config: GalaxyConfig;
}

const Galaxy: React.FC<GalaxyProps> = ({ config }) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate galaxy geometry data
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(config.count * 3);
    const colors = new Float32Array(config.count * 3);

    const colorInside = new THREE.Color(config.insideColor);
    const colorOutside = new THREE.Color(config.outsideColor);

    for (let i = 0; i < config.count; i++) {
      const i3 = i * 3;

      const radius = Math.random() * config.radius;
      const spinAngle = radius * config.spin;
      const branchAngleOffset = (Math.random() - 0.5) * 0.3; 
      const branchAngle = ((i % config.branches) / config.branches) * Math.PI * 2 + branchAngleOffset;

      const randomX = Math.pow(Math.random(), config.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * config.randomness * radius;
      const randomZ = Math.pow(Math.random(), config.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * config.randomness * radius;
      
      const randomY = Math.pow(Math.random(), config.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * config.randomness * (radius * 0.5 + 1.5);

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
      positions[i3 + 1] = randomY * 0.4; 
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

      const mixRatio = radius / config.radius;
      const colorRandomness = (Math.random() - 0.5) * 0.3; 
      const safeMixRatio = Math.max(0, Math.min(1, mixRatio + colorRandomness));

      const mixedColor = colorInside.clone();
      mixedColor.lerp(colorOutside, safeMixRatio);

      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;
    }

    return { positions, colors };
  }, [config]);

  // Interactive rotation animation
  useFrame((state, delta) => {
    if (pointsRef.current) {
      // 1. Natural slow rotation
      pointsRef.current.rotation.y += delta * 0.05;

      // 2. Mouse interaction
      // state.pointer.x and .y are normalized coordinates (-1 to 1)
      const mouseX = state.pointer.x * 0.5; // Scale down for subtle effect
      const mouseY = state.pointer.y * 0.5;

      // Lerp (Linear Interpolate) towards mouse position for smooth movement
      // We modify rotation x and z to create a "tilt" effect towards the mouse
      pointsRef.current.rotation.x = THREE.MathUtils.lerp(pointsRef.current.rotation.x, -mouseY * 0.5, 0.05);
      pointsRef.current.rotation.z = THREE.MathUtils.lerp(pointsRef.current.rotation.z, mouseX * 0.2, 0.05);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={config.size}
        sizeAttenuation={true}
        depthWrite={false}
        vertexColors={true}
        blending={THREE.AdditiveBlending}
        transparent={true}
        opacity={0.6} 
      />
    </points>
  );
};

export default Galaxy;