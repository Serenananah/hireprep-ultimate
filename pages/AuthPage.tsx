
import React, { useState, Suspense } from 'react';
import GlassCard from '../components/GlassCard';
import { User } from '../types';
import { authService } from '../services/authService';
import { UserPlus, LogIn, AlertCircle, ArrowRight } from 'lucide-react';

// ⭐ 新增：3D 背景所需的 imports
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Galaxy from "../components/Galaxy";
import Starfield from "../components/Starfield";


interface AuthPageProps {
  onLogin: (user: User) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true); // Toggle between Login and Register
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  const clearForm = () => {
    setError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    clearForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let user: User;
      
      if (isLogin) {
        // Login Logic
        user = await authService.login(email, password);
      } else {
        // Register Logic
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        if (!name.trim()) {
           throw new Error("Name is required.");
        }
        user = await authService.register(name, email, password);
      }

      onLogin(user);

    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-['Rajdhani']">
      
      {/* ======= 动态粒子背景层（完整复制自 LandingPage） ======= */}
      <div className="fixed inset-0 z-0">
        <Canvas
          camera={{ position: [0, 0.8, 2.8], fov: 55 }}
          gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
          dpr={[1, 2]}
        >
          <color attach="background" args={["#050505"]} />

          <Suspense fallback={null}>
            <group rotation={[0, 0, Math.PI / 8]}>
              <Galaxy
                config={{
                  count: 40000,
                  size: 0.012,
                  radius: 5,
                  branches: 4,
                  spin: 1.2,
                  randomness: 0.8,
                  randomnessPower: 2.5,
                  insideColor: "#ff8a5b",
                  outsideColor: "#2b5aff",
                }}
              />
            </group>
            <Starfield />
          </Suspense>

          <OrbitControls enablePan={false} enableZoom rotateSpeed={0.4} />
        </Canvas>

        {/* Cinematic overlays */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]" />
        <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      
      {/* ======= 前景 UI 层 ======= */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 overflow-y-auto pointer-events-auto -translate-y-12">
        
        {/* 登录卡片 */}
        <GlassCard className="w-full max-w-md p-0 overflow-hidden relative backdrop-blur-xl bg-white/5 border border-white/10">
          
          {/* Header */}
          <div className="p-8 pb-6 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 mb-4 mx-auto shadow-[0_0_15px_rgba(37,99,235,0.3)]">
              {isLogin ? <LogIn className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
            </div>
            <h2 className="text-2xl font-bold text-white text-center">
              {isLogin ? "Welcome Back" : "Create Account"}
            </h2>
            <p className="text-gray-400 mt-2 text-center text-sm">
              {isLogin ? "Enter your credentials to continue" : "Join Hireprep to start practicing"}
            </p>
          </div>

          {/* Form */}
          <div className="p-8 pt-6">
            {error && (
              <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-3">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-blue-300 ml-1 uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    required={!isLogin}
                    onChange={(e) => setName(e.target.value)}
                    className="glass-input w-full px-4 py-3 rounded-xl"
                    placeholder="e.g. Alex Chen"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-blue-300 ml-1 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-blue-300 ml-1 uppercase tracking-wider">Password</label>
                <input
                  type="password"
                  value={password}
                  required
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl"
                />
              </div>

              {!isLogin && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-blue-300 ml-1 uppercase tracking-wider">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    required={!isLogin}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="glass-input w-full px-4 py-3 rounded-xl"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-xl bg-white/10 border border-white/30 text-white font-bold shadow-lg mt-4 backdrop-blur-lg hover:bg-white/20 transition-all"
              >
                {isLoading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
              </button>
            </form>

            {/* Toggle */}
            <div className="mt-8 pt-6 border-t border-white/5 text-center">
              <p className="text-gray-400 text-sm">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button onClick={toggleMode} className="ml-2 text-blue-400 hover:underline font-bold">
                  {isLogin ? "Sign Up" : "Log In"}
                </button>
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default AuthPage;
