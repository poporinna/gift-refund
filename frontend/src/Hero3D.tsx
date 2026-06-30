import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial, Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

// Abstract drifting wireframe core - NOT a literal object, just light geometry + a particle field.
function Core({ hue }: { hue: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.08;
      ref.current.rotation.y += delta * 0.12;
    }
  });
  const color = useMemo(() => new THREE.Color().setHSL(hue, 0.6, 0.55), [hue]);
  return (
    <Float speed={1.1} rotationIntensity={0.5} floatIntensity={1.2}>
      <Icosahedron ref={ref} args={[1.7, 4]}>
        <MeshDistortMaterial
          color={color}
          wireframe
          distort={0.42}
          speed={1.4}
          transparent
          opacity={0.55}
        />
      </Icosahedron>
    </Float>
  );
}

function Halo({ hue }: { hue: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.05;
  });
  const color = useMemo(() => new THREE.Color().setHSL((hue + 0.12) % 1, 0.7, 0.6), [hue]);
  return (
    <mesh ref={ref} rotation={[Math.PI / 2.4, 0, 0]}>
      <torusGeometry args={[3.0, 0.012, 16, 220]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  );
}

function Dust() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const n = 900;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 4 + Math.random() * 6;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(p) * Math.cos(t);
      arr[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      arr[i * 3 + 2] = r * Math.cos(p);
    }
    return arr;
  }, []);
  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.02;
  });
  return (
    <Points ref={ref} positions={positions} frustumCulled={false}>
      <PointMaterial transparent color="#8a8a96" size={0.018} sizeAttenuation depthWrite={false} opacity={0.7} />
    </Points>
  );
}

export function Hero3D({ hue = 0.58 }: { hue?: number }) {
  return (
    <div className="scene">
      <Canvas camera={{ position: [0, 0, 6.2], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[6, 6, 6]} intensity={1.1} />
        <pointLight position={[-6, -4, -2]} intensity={0.6} color="#2997ff" />
        <Core hue={hue} />
        <Halo hue={hue} />
        <Dust />
      </Canvas>
    </div>
  );
}
