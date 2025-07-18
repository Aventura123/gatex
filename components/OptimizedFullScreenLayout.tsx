"use client";

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import '../components/global.css';

// Importação dinâmica do UserProfileButton apenas quando necessário
const UserProfileButton = React.lazy(() => import('./UserProfileButton'));

const OptimizedFullScreenLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [shouldLoadUserProfile, setShouldLoadUserProfile] = useState(false);
  
  // Get current pathname for highlighting active menu items
  const pathname = usePathname();

  // Mobile detection hook (otimizado)
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    const debouncedResize = debounce(checkIsMobile, 250);
    window.addEventListener('resize', debouncedResize);

    return () => {
      window.removeEventListener('resize', debouncedResize);
    };
  }, []);

  // Verificar se o usuário está logado (otimizado com cache)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkAuth = () => {
        const hasToken = Boolean(localStorage.getItem("userId"));
        setIsLoggedIn(hasToken);
        setShouldLoadUserProfile(hasToken);
      };
      
      checkAuth();
      
      // Listener otimizado para mudanças
      const handleStorageChange = () => {
        const hasToken = Boolean(localStorage.getItem("userId"));
        setIsLoggedIn(hasToken);
        setShouldLoadUserProfile(hasToken);
      };

      window.addEventListener('storage', handleStorageChange, { passive: true });
      window.addEventListener('userLoggedIn', handleStorageChange, { passive: true });
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('userLoggedIn', handleStorageChange);
      };
    }
  }, []);

  return (
    <div className="layout">
      {/* Header with Professional Glassmorphism */}
      <header className="site-header fixed h-[10vh] left-0 top-0 w-[100vw] z-50 text-white gate33-header-fullwidth overflow-visible">
        <div className="header-bg"></div>
        <div className="w-full flex justify-between items-center py-4 px-6 h-16">
          <a href="/" className="logo flex items-center">
            <img src="/images/GATE33-LOGO-wordmark.png" alt="Gate33 Logo" className="h-6" />
          </a>
          
          {/* Hamburger Menu Button - Toggles the menu */}
          <button
            className="md:hidden text-orange-500 focus:outline-none z-50 flex items-center"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="mr-2 text-sm font-medium">Menu</span>
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          
          {/* Desktop Navigation - Only Login/Profile Button */}
          <nav className="hidden md:flex gap-8 items-center relative z-[1000]">
            {isLoggedIn && shouldLoadUserProfile && (
              <React.Suspense fallback={<div className="w-8 h-8 rounded-full bg-gray-600 animate-pulse"></div>}>
                <UserProfileButton className="ml-4 mr-4 header-button min-w-0" />
              </React.Suspense>
            )}
          </nav>
        </div>
      </header>

      {/* Mobile Navigation Panel (Slides from right) */}
      <nav
        className={`fixed top-0 right-0 h-full w-72 max-w-full bg-black/85 z-[70] transition-transform duration-300 ease-in-out md:hidden overflow-y-auto mobile-nav-panel backdrop-blur-sm ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close Button inside the panel */}
        <button
          className="absolute top-4 right-4 text-orange-500 focus:outline-none text-2xl"
          onClick={() => setMenuOpen(false)}
        >
          &times;
        </button>
        <div className="flex flex-col px-4 pb-6 pt-16">
          {/* Home link */}
          <a 
            href="/" 
            className="block py-2 text-lg font-medium hover:text-orange-500 transition-colors mb-4 border-b border-gray-800 pb-4" 
            onClick={() => setMenuOpen(false)}
          >
            HOME
          </a>
          <div className="border-t border-gray-800 my-2"></div>
          
          {/* Login/Profile Section */}
          {isLoggedIn && shouldLoadUserProfile && (
            <div className="pt-2">
              <React.Suspense fallback={<div className="w-full h-10 bg-gray-600 animate-pulse rounded"></div>}>
                <UserProfileButton />
              </React.Suspense>
            </div>
          )}
        </div>
      </nav>
      
      <main className="px-0 sm:px-0 md:px-0 lg:px-0 w-full">{children}</main>
    </div>
  );
};

// Função debounce para otimizar resize events
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default OptimizedFullScreenLayout;
