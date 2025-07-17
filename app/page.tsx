'use client';

import React, { useState, useEffect } from 'react';
import FullScreenLayout from '../components/FullScreenLayout';
import AdminLoginModal from '../components/AdminLoginModal';
import SupportLoginModal from '../components/SupportLoginModal';
import '../styles/globals.css';

function Home() {
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check authentication status when component mounts
  useEffect(() => {
    const checkAuthAndRedirect = () => {
      try {
        const role = localStorage.getItem("userRole");
        const userId = localStorage.getItem("userId");
        const isAuthenticated = document.cookie.includes('isAuthenticated=true');

        console.log("🔍 Checking auth status:", { role, userId, isAuthenticated });

        // Only redirect if user is properly authenticated
        if (role && userId && isAuthenticated) {
          if (["support"].includes(role)) {
            console.log("✅ Redirecting support user to support dashboard");
            window.location.href = "/support-dashboard";
            return;
          } else if (["admin", "super_admin"].includes(role)) {
            console.log("✅ Redirecting admin user to admin dashboard");
            window.location.href = "/admin/dashboard";
            return;
          }
        }

        console.log("ℹ️ User not authenticated or invalid role, staying on homepage");
      } catch (error) {
        console.error("Error checking authentication:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    // Small delay to ensure localStorage is available
    const timer = setTimeout(checkAuthAndRedirect, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSupportAccess = () => {
    // If checking auth, do nothing
    if (isCheckingAuth) return;
    
    // Check if user is already logged in as support/admin
    const role = localStorage.getItem("userRole");
    const userId = localStorage.getItem("userId");
    
    if (role && userId && ["support", "admin", "super_admin"].includes(role)) {
      // Already logged in, redirect to dashboard
      console.log("User already logged in as", role, "- redirecting to dashboard");
      window.location.href = "/support-dashboard";
    } else {
      // Not logged in, open modal
      console.log("User not logged in - opening support modal");
      setShowSupportModal(true);
    }
  };

  const handleAdminAccess = () => {
    // If checking auth, do nothing
    if (isCheckingAuth) return;
    
    // Check if user is already logged in as admin
    const role = localStorage.getItem("userRole");
    const userId = localStorage.getItem("userId");
    
    if (role && userId && ["admin", "super_admin"].includes(role)) {
      // Already logged in, redirect to dashboard
      console.log("User already logged in as", role, "- redirecting to admin dashboard");
      window.location.href = "/admin/dashboard";
    } else {
      // Not logged in, open modal
      console.log("User not logged in - opening admin modal");
      setShowAdminModal(true);
    }
  };

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
            
            {isCheckingAuth ? (
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                <p className="text-gray-300 text-center font-verdana">
                  Checking authentication status...
                </p>
              </div>
            ) : (
              <>
                <p className="text-gray-300 text-base md:text-lg text-center mb-4 font-verdana">
                  Welcome to the GateX private dashboard.<br />Select your access type below:
                </p>
                <div className="flex flex-col gap-6 w-full">
                  <button
                    className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg font-verdana shadow-md transition-all border-none focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={handleAdminAccess}
                    disabled={isCheckingAuth}
                  >
                    Admin Access
                  </button>
                  <button
                    className="w-full py-4 rounded-xl bg-[#23262F] border border-orange-500 text-orange-500 font-bold text-lg font-verdana shadow-md transition-all hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={handleSupportAccess}
                    disabled={isCheckingAuth}
                  >
                    Support Access
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AdminLoginModal 
        isOpen={showAdminModal} 
        onClose={() => setShowAdminModal(false)} 
      />
      <SupportLoginModal 
        isOpen={showSupportModal} 
        onClose={() => setShowSupportModal(false)} 
      />
    </FullScreenLayout>
  );
}

export default Home;

