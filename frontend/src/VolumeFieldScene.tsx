import { useEffect, useRef } from "react";

// VOLUME-BAR FIELD - a grid of wireframe box columns whose heights undulate like
// a live trading-volume surface. A handful of columns are flagged as suspicious
// wash spikes (violet) and pulse far above the organic green field. three + gsap
// are imported dynamically so the hero is code-split and only loads on mount.
export default function VolumeFieldScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      const { gsap } = await import("gsap");
      if (disposed) return;

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
      camera.position.set(7.6, 7.0, 12.4);
      camera.lookAt(0, 0.7, 0);

      const group = new THREE.Group();
      scene.add(group);

      const COLS = 15;
      const ROWS = 10;
      const STEP = 0.96;
      const offX = ((COLS - 1) * STEP) / 2;
      const offZ = ((ROWS - 1) * STEP) / 2;

      const box = new THREE.BoxGeometry(0.6, 1, 0.6);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      const green = new THREE.LineBasicMaterial({ color: 0x36f1a3, transparent: true, opacity: 0.72 });
      const violet = new THREE.LineBasicMaterial({ color: 0x9d6bff });

      // fixed grid coordinates flagged as wash spikes
      const washKeys = new Set(["3,2", "10,6", "12,1", "6,8", "8,4"]);

      interface Bar {
        mesh: import("three").LineSegments;
        wash: boolean;
        phase: number;
      }
      const bars: Bar[] = [];

      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const wash = washKeys.has(c + "," + r);
          const seg = new THREE.LineSegments(edges, wash ? violet : green);
          seg.position.x = c * STEP - offX;
          seg.position.z = r * STEP - offZ;
          group.add(seg);
          bars.push({ mesh: seg, wash, phase: c * 0.42 + r * 0.31 });
        }
      }
      group.rotation.y = -0.32;

      const setH = (m: import("three").LineSegments, h: number) => {
        m.scale.y = h;
        m.position.y = h / 2;
      };

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      const render = () => renderer.render(scene, camera);

      const disposeCore = () => {
        ro.disconnect();
        edges.dispose();
        green.dispose();
        violet.dispose();
        renderer.dispose();
      };

      if (reduce) {
        for (const b of bars) {
          const base = 0.45 + (Math.sin(b.phase) * 0.5 + 0.5) * 1.7;
          setH(b.mesh, b.wash ? base + 2.6 : base);
        }
        render();
        cleanup = disposeCore;
        return;
      }

      // GSAP drives the travelling volume wave and the wash-spike pulse
      const wave = { t: 0 };
      const washPulse = { boost: 0 };
      const waveTween = gsap.to(wave, { t: Math.PI * 2, duration: 7, repeat: -1, ease: "none" });
      const pulseTween = gsap.to(washPulse, {
        boost: 1,
        duration: 1.15,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      const driftTween = gsap.to(group.rotation, {
        y: 0.32,
        duration: 16,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      const tick = () => {
        for (const b of bars) {
          let h = 0.45 + (Math.sin(b.phase + wave.t * 2) * 0.5 + 0.5) * 1.8;
          if (b.wash) h += 2.3 + washPulse.boost * 1.7;
          setH(b.mesh, h);
        }
        render();
      };
      gsap.ticker.add(tick);

      cleanup = () => {
        gsap.ticker.remove(tick);
        waveTween.kill();
        pulseTween.kill();
        driftTween.kill();
        gsap.killTweensOf(group.rotation);
        disposeCore();
      };
    })();

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, []);

  return <canvas ref={canvasRef} className="scene" aria-hidden="true" />;
}
