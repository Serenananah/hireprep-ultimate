import React, { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import Galaxy from "../components/Galaxy";
import Starfield from "../components/Starfield";
import { GalaxyConfig } from "../types";

interface LandingPageProps {
  onStart: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  // Galaxy background configuration
  const [config] = useState<GalaxyConfig>({
    count: 40000,
    size: 0.012,
    radius: 5,
    branches: 4,
    spin: 1.2,
    randomness: 0.8,
    randomnessPower: 2.5,
    insideColor: "#ff8a5b",
    outsideColor: "#2b5aff",
  });

  return (
    <div className="relative w-full h-full bg-black selection:bg-cyan-500 selection:text-black overflow-hidden font-['Rajdhani']">
      
      {/* 3D Background Layer */}
      <div className="fixed inset-0 z-0">
        <Canvas
          camera={{ position: [0, 3.0, 5.0], fov: 55 }}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
            alpha: false,
          }}
          dpr={[1, 2]}
        >
          <color attach="background" args={["#050505"]} />

          <Suspense fallback={null}>
            <group rotation={[0, 0, Math.PI / 8]}>
              <Galaxy config={config} />
            </group>
            <Starfield />
          </Suspense>

          <OrbitControls
            enablePan={false}
            enableZoom
            rotateSpeed={0.4}
            enableDamping
            dampingFactor={0.05}
          />
        </Canvas>

        {/* Cinematic Overlays */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]" />
        <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>


      {/* Foreground Scrollable Layer */}
      <div className="relative z-10 w-full h-full overflow-y-auto overflow-x-hidden pointer-events-none">
        
        {/* Navigation Bar */}
        <nav className="w-full flex justify-between items-center px-8 py-6 sticky top-0 z-50 transition-all duration-300 pointer-events-auto">
          <div className="absolute inset-0 bg-black/10 backdrop-blur-md border-b border-white/5 shadow-lg"></div>

          <div className="relative flex items-center gap-3 z-10">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-purple-500/20 border border-white/20 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
            </div>
            <span className="text-2xl font-bold tracking-[0.1em] text-white/50 mix-blend-difference">
              Synthara
            </span>
          </div>

          {/*<button className="relative z-10 px-6 py-2 bg-[rgba(255,255,255,0.1)] border border-white/20 rounded-full text-xs font-bold tracking-widest hover:bg-[rgba(255,255,255,0.2)] hover:border-cyan-400/50 text-white/70 pointer-events-auto">
            LOGIN
          </button>*/}
        </nav>

        {/* HERO SECTION */}
        <header className="flex-1 flex flex-col justify-center items-center px-4 min-h-screen relative -mt-24">
          <div className="max-w-5xl w-full text-center space-y-6 relative z-10">

            <h1 className="text-7xl md:text-9xl font-bold tracking-tighter text-white/50 mix-blend-difference leading-none pb-2 select-none uppercase">
              HirePrep
            </h1>

            <p className="text-xl md:text-3xl text-white mix-blend-difference max-w-3xl mx-auto leading-relaxed tracking-[0.15em]">
              Stay Hungry Stay Foolish
            </p>

            {/* 🔥 Replace their START SIMULATION with your onStart() */}
            <div className="flex justify-center pt-6 pointer-events-auto">
              <button
                onClick={onStart}
                className="group relative px-8 py-3 bg-[rgba(255,255,255,0.1)] border border-white/20 backdrop-blur-[20px] rounded-xl text-white/70 hover:text-white transition-all duration-300 shadow-lg hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:border-cyan-400/50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <span className="relative z-10 font-bold tracking-[0.2em] text-xs flex items-center gap-2">
                  START SIMULATION
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </span>
              </button>
            </div>
          </div>
        </header>

      </div>
    </div>
  );
};

export default LandingPage;
