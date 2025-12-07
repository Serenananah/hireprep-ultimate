import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  return (
    <div className={`min-h-screen w-full relative overflow-x-hidden text-gray-100 font-sans ${className}`}>
      {/* Background Layer */}
      <div className="fixed inset-0 z-0">
        
        {/* 1. The Fluid Art Image (bg.png) */}
        {/* CRITICAL FIX: Use '/bg.png' (absolute path) instead of 'bg.png' so it loads from public root on all subpages. */}
        {/* Added a fallback color/gradient in case the image is missing or loading */}
        <div 
          className="absolute inset-0 bg-cover bg-no-repeat bg-contain"
          style={{ backgroundImage: "url('/bg.png')" }}
        />

        
        {/* 4. Vignette to focus center */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/60" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 w-full min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
};

export default Layout;
