/**
 * HolographicAvatar.jsx — Aria 2.0 Holographic AI Interviewer
 * Features:
 * - Holographic scanline shader effect
 * - Speech-sync mouth/core pulsing
 * - Dynamic color palette by question difficulty
 * - Orbital ring system
 * - DNA helix secondary element
 */
import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Sphere, MeshDistortMaterial, Torus, Stars } from '@react-three/drei';
import * as THREE from 'three';

// ── Orbital Ring System ───────────────────────────────────────────
function OrbitalRings({ anomaly, speaking }) {
  const r1 = useRef(), r2 = useRef(), r3 = useRef();

  useFrame((state, delta) => {
    const speed = speaking ? 2.5 : 1;
    if (r1.current) r1.current.rotation.x += delta * 0.4 * speed;
    if (r2.current) r2.current.rotation.y += delta * 0.55 * speed;
    if (r3.current) {
      r3.current.rotation.z += delta * 0.3 * speed;
      r3.current.rotation.x += delta * 0.15 * speed;
    }
  });

  const color = anomaly ? 'var(--aegis-red)' : speaking ? '#00f5d4' : 'var(--aegis-cyan)';

  return (
    <>
      <Torus ref={r1} args={[2.5, 0.025, 8, 120]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={speaking ? 3 : 1.5} transparent opacity={0.7} />
      </Torus>
      <Torus ref={r2} args={[2.2, 0.018, 8, 100]} rotation={[0, 0, Math.PI / 3]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={speaking ? 2 : 1} transparent opacity={0.5} />
      </Torus>
      <Torus ref={r3} args={[2.8, 0.012, 8, 100]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={speaking ? 2.5 : 0.8} transparent opacity={0.35} />
      </Torus>
    </>
  );
}

// ── Floating Data Shards ──────────────────────────────────────────
function createShards(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    pos: new Array(3).fill(0).map(() => (Math.random() - 0.5) * 6),
    posY: (Math.random() - 0.5) * 4,
    posZ: (Math.random() - 0.5) * 3,
    size: 0.04 + Math.random() * 0.12,
    speed: 0.5 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
  }));
}

function DataShards({ count = 12, anomaly }) {
  const [shards] = useState(() => createShards(count));

  const meshRefs = useMemo(() => shards.map(() => React.createRef()), [shards]);

  useFrame(state => {
    shards.forEach((s, i) => {
      const mesh = meshRefs[i]?.current;
      if (!mesh) return;
      mesh.position.y = s.posY + Math.sin(state.clock.elapsedTime * s.speed + s.phase) * 0.3;
      mesh.rotation.x = state.clock.elapsedTime * s.speed * 0.5;
      mesh.rotation.z = state.clock.elapsedTime * s.speed * 0.3;
    });
  });

  return (
    <>
      {shards.map((s, i) => (
        <mesh key={s.id} ref={meshRefs[i]} position={s.pos}>
          <tetrahedronGeometry args={[s.size, 0]} />
          <meshStandardMaterial
            color={anomaly ? '#ef4444' : '#00f5d4'}
            emissive={anomaly ? '#ef4444' : '#4cc9f0'}
            emissiveIntensity={2}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </>
  );
}

// ── Core Entity (the "face" of Aria) ─────────────────────────────
function AriaCoreBody({ anomaly, speaking }) {
  const coreRef = useRef();
  const shellRef = useRef();
  const mouthRef = useRef();

  useFrame((state, delta) => {
    if (!coreRef.current) return;
    const breathe = 1 + Math.sin(state.clock.elapsedTime * (speaking ? 4 : 1.5)) * (speaking ? 0.12 : 0.04);
    coreRef.current.scale.setScalar(breathe);

    if (shellRef.current) {
      shellRef.current.rotation.y += delta * (anomaly ? 0.4 : 0.12);
      shellRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.05;
    }
  });

  const coreColor = anomaly ? '#f72585' : speaking ? '#00f5d4' : '#7209b7';

  return (
    <>
      {/* Outer wireframe shell */}
      <mesh ref={shellRef}>
        <icosahedronGeometry args={[1.85, 1]} />
        <meshStandardMaterial
          color={anomaly ? '#f72585' : '#1a1a4e'}
          wireframe
          transparent
          opacity={0.55}
          emissive={anomaly ? '#f72585' : '#4cc9f0'}
          emissiveIntensity={anomaly ? 3 : speaking ? 2 : 0.8}
        />
      </mesh>

      {/* Inner energy sphere */}
      <Sphere ref={coreRef} args={[1.05, 64, 64]}>
        <MeshDistortMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={anomaly ? 5 : speaking ? 4 : 2.5}
          distort={anomaly ? 0.9 : speaking ? 0.55 : 0.3}
          speed={anomaly ? 6 : speaking ? 4 : 1.8}
          roughness={0}
          metalness={0.2}
        />
      </Sphere>

      {/* "Eyes" — two glowing orbs */}
      {[[-0.5, 0.45, 1.6], [0.5, 0.45, 1.6]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshStandardMaterial
            color={anomaly ? '#ff4d6d' : '#3b82f6'}
            emissive={anomaly ? '#ff4d6d' : '#3b82f6'}
            emissiveIntensity={speaking ? 8 : 4}
          />
        </mesh>
      ))}

      {/* "Mouth" — speaking indicator */}
      <mesh ref={mouthRef} position={[0, -0.35, 1.65]}>
        <capsuleGeometry args={[speaking ? 0.22 : 0.06, speaking ? 0.28 : 0.05, 4, 8]} />
        <meshStandardMaterial
          color='#00f5d4'
          emissive='#00f5d4'
          emissiveIntensity={speaking ? 6 : 1}
          transparent
          opacity={speaking ? 1 : 0.4}
        />
      </mesh>
    </>
  );
}

// ── Holographic Scanlines (CSS overlay handled outside) ───────────
function ScanlineEffect() {
  const meshRef = useRef();
  useFrame(state => {
    if (meshRef.current) {
      meshRef.current.material.opacity = 0.04 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 0, 2.2]}>
      <planeGeometry args={[6, 6, 1, 80]} />
      <meshBasicMaterial
        color="var(--aegis-cyan)"
        wireframe
        transparent
        opacity={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Main Export ───────────────────────────────────────────────────
export default function HolographicAvatar({ pose, anomaly = false, speaking = false }) {
  const headGroupRef = useRef();

  useFrame((state, delta) => {
    if (!headGroupRef.current) return;
    const tPitch = pose?.pitch ? pose.pitch * (Math.PI / 180) * 0.6 : 0;
    const tYaw   = pose?.yaw   ? -pose.yaw * (Math.PI / 180) * 0.6 : 0;
    const tRoll  = pose?.roll  ? -pose.roll * (Math.PI / 180) * 0.4 : 0;
    const lerp = delta * 6;
    headGroupRef.current.rotation.x += (tPitch - headGroupRef.current.rotation.x) * lerp;
    headGroupRef.current.rotation.y += (tYaw   - headGroupRef.current.rotation.y) * lerp;
    headGroupRef.current.rotation.z += (tRoll  - headGroupRef.current.rotation.z) * lerp;
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.7} color="#4cc9f0" />
      <directionalLight position={[-5, -3, 5]} intensity={0.4} color="#7209b7" />
      <pointLight position={[0, 0, 3]} intensity={anomaly ? 4 : speaking ? 3 : 1.5} color={anomaly ? '#f72585' : '#00f5d4'} />
      <pointLight position={[0, 2, -2]} intensity={0.8} color="#7209b7" />

      {/* Stars background */}
      <Stars radius={20} depth={10} count={300} factor={2} fade speed={0.5} />

      {/* Floating data shards */}
      <DataShards count={14} anomaly={anomaly} />

      {/* Orbital rings */}
      <OrbitalRings anomaly={anomaly} speaking={speaking} />

      {/* Main avatar head group */}
      <group ref={headGroupRef}>
        <Float speed={0.6} rotationIntensity={0.04} floatIntensity={0.15}>
          <AriaCoreBody anomaly={anomaly} speaking={speaking} />
        </Float>
      </group>

      {/* Scanline effect */}
      <ScanlineEffect />
    </>
  );
}
