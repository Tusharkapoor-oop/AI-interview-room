/**
 * CyberAvatar.jsx — Top-Tier Edition
 * A premium dual-avatar: Cybernetic Geometric Head + Abstract Energy Core
 * with particle field, real-time head-pose mirroring, and idle animations.
 */
import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';

// Floating particle field surrounding the avatar
function ParticleField({ count = 120 }) {
  const [particles] = useState(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  });

  const meshRef = useRef();
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.03;
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.015;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particles.length / 3} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#4cc9f0" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// Outer wireframe geometric shell
function CyberShell({ anomaly }) {
  const meshRef = useRef();
  const currentColor = useRef(new THREE.Color('#1d3557'));

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = anomaly ? new THREE.Color('#f72585') : new THREE.Color('#1d3557');
    currentColor.current.lerp(target, delta * 3);
    meshRef.current.material.color.copy(currentColor.current);
    meshRef.current.rotation.y += delta * 0.1;
    meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[2.1, 1]} />
      <meshStandardMaterial
        color="#1d3557"
        wireframe
        transparent
        opacity={0.7}
        emissive="#4cc9f0"
        emissiveIntensity={anomaly ? 2 : 0.3}
      />
    </mesh>
  );
}

// Inner energy core with distortion + emissive glow
function EnergyCore({ anomaly }) {
  const coreRef = useRef();

  useFrame((state) => {
    if (!coreRef.current) return;
    coreRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.07);
  });

  return (
    <Sphere ref={coreRef} args={[1.1, 64, 64]}>
      <MeshDistortMaterial
        color={anomaly ? '#f72585' : '#00f5d4'}
        emissive={anomaly ? '#f72585' : '#00f5d4'}
        emissiveIntensity={anomaly ? 4 : 2.5}
        distort={anomaly ? 0.8 : 0.35}
        speed={anomaly ? 5 : 2}
        roughness={0}
        metalness={0.1}
      />
    </Sphere>
  );
}

// Eye indicators that glow red when anomaly
function AvatarEyes({ anomaly }) {
  const color = anomaly ? '#ff4d6d' : '#4cc9f0';
  const intensity = anomaly ? 6 : 2;

  return (
    <>
      <mesh position={[-0.55, 0.48, 1.85]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
      </mesh>
      <mesh position={[0.55, 0.48, 1.85]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
      </mesh>
    </>
  );
}

export default function CyberAvatar({ pose, anomaly }) {
  const headGroupRef = useRef();

  useFrame((state, delta) => {
    if (!headGroupRef.current) return;

    const tPitch = pose?.pitch ? pose.pitch * (Math.PI / 180) * 0.8 : 0;
    const tYaw   = pose?.yaw   ? -pose.yaw * (Math.PI / 180) * 0.8 : 0;
    const tRoll  = pose?.roll  ? -pose.roll * (Math.PI / 180) * 0.5 : 0;

    const lerpSpeed = delta * 8;
    headGroupRef.current.rotation.x += (tPitch - headGroupRef.current.rotation.x) * lerpSpeed;
    headGroupRef.current.rotation.y += (tYaw   - headGroupRef.current.rotation.y) * lerpSpeed;
    headGroupRef.current.rotation.z += (tRoll  - headGroupRef.current.rotation.z) * lerpSpeed;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#4cc9f0" />
      <directionalLight position={[-5, -5, 5]} intensity={0.3} color="#7209b7" />
      <pointLight position={[0, 0, 3]} intensity={anomaly ? 3 : 1} color={anomaly ? '#f72585' : '#00f5d4'} />

      <ParticleField count={150} />

      <group ref={headGroupRef}>
        <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.2}>
          <CyberShell anomaly={anomaly} />
          <EnergyCore anomaly={anomaly} />
          <AvatarEyes anomaly={anomaly} />
        </Float>
      </group>
    </>
  );
}