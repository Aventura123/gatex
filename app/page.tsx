'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import FullScreenLayout from '../components/FullScreenLayout';
import '../styles/globals.css';

function Home() {
  const router = useRouter();
  return (
    <FullScreenLayout>
      <div className="homepage-bg flex flex-col items-center justify-center min-h-screen relative overflow-hidden px-4">
        {/* Elemento animado tecnológico */}
        <div className="tech-lines"></div>
        
        {/* Seção principal com imagem de fundo e modal */}
        <div className="hero-section relative w-full h-full flex items-center justify-center">
          {/* Logo animado como fundo */}
          <img
            src="/images/3a1c587e459142a944acdb0e7aa6e10e2d631aab.png"
            alt="Gate33 Logo"
            className="animated-bg-img mx-auto sm:static sm:translate-x-0 sm:translate-y-0"
            style={{ animation: 'floatLogoY 4s ease-in-out infinite alternate' }}
          />
          
          {/* Modal de acesso centralizado sobrepondo a imagem */}
          <div className="w-full max-w-md mx-auto bg-[#23262F]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 border border-orange-500/30 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
            <h1 className="text-3xl md:text-4xl font-bold text-orange-500 mb-2 text-center font-verdana tracking-wide">GateX Admin Portal</h1>
            <p className="text-gray-300 text-base md:text-lg text-center mb-4 font-verdana">
              Welcome to the GateX private dashboard.<br />Select your access type below:
            </p>
            <div className="flex flex-col gap-6 w-full">
              <button
                className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg font-verdana shadow-md transition-all border-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                onClick={() => router.push('/admin-login')}
              >
                Admin Access
              </button>
              <button
                className="w-full py-4 rounded-xl bg-[#23262F] border border-orange-500 text-orange-500 font-bold text-lg font-verdana shadow-md transition-all hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                onClick={() => router.push('/support-login')}
              >
                Support Access
              </button>
            </div>
          </div>
        </div>
      </div>
    </FullScreenLayout>
  );
}

export default Home;

