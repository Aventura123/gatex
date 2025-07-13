"use client";

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import '../components/global.css';
import UserProfileButton from './UserProfileButton';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [jobsDropdownOpen, setJobsDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [learnDropdownOpen, setLearnDropdownOpen] = useState(false);
  const isProduction = process.env.NEXT_PUBLIC_DEPLOY_STAGE === "production";
  
  // Get current pathname for highlighting active menu items
  const pathname = usePathname();

  // Function to check if a menu item is active
  const isActiveMenuItem = (path: string) => {
    return pathname === path;
  };

  // Function to get menu item styling with active state
  const getMenuItemClasses = (path: string) => {
    const baseClasses = "block px-4 py-2 text-base font-verdana font-normal leading-[24px] tracking-normal uppercase transition-all duration-200 relative";
    const activeClasses = "text-white border-l-2 border-orange-500 bg-orange-500/10";
    const inactiveClasses = "text-gray-300 hover:text-white hover:border-l-2 hover:border-orange-500 hover:bg-orange-500/5";
    
    return `${baseClasses} ${isActiveMenuItem(path) ? activeClasses : inactiveClasses}`;
  };

  // Function to get mobile menu item styling with active state
  const getMobileMenuItemClasses = (path: string) => {
    const baseClasses = "block py-1.5 text-base transition-colors";
    const activeClasses = "text-orange-500 font-bold bg-orange-500/10";
    const inactiveClasses = "hover:text-orange-500";
    
    return `${baseClasses} ${isActiveMenuItem(path) ? activeClasses : inactiveClasses}`;
  };

  // Mobile detection hook
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Verificar se o usuário está logado para decidir quais botões mostrar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Add debugging to see what's in localStorage
      console.log("Login check - seekerToken:", localStorage.getItem("seekerToken"));
      console.log("Login check - token:", localStorage.getItem("token"));
      console.log("Login check - companyId:", localStorage.getItem("companyId"));
      console.log("Login check - companyName:", localStorage.getItem("companyName"));
      
      const hasToken = Boolean(
        localStorage.getItem("seekerToken") || 
        localStorage.getItem("token") || 
        localStorage.getItem("companyId")
      );
      console.log("Login check - isLoggedIn:", hasToken);
      setIsLoggedIn(hasToken);
    }
  }, []);

  // Force component re-render when localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const hasToken = Boolean(
        localStorage.getItem("seekerToken") || 
        localStorage.getItem("token") || 
        localStorage.getItem("companyId")
      );
      setIsLoggedIn(hasToken);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // ...existing code...
  return (
    <div className="layout">
      {/* Header - apenas logo e login/signup/profile */}
      <header className="site-header fixed h-[10vh] left-0 top-0 w-[100vw] z-50 text-white gate33-header-fullwidth overflow-visible">
        <div className="header-bg"></div>
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center py-4 px-4 h-16">
          <a href="/" className="logo flex items-center">
            <img src="/images/GATE33-LOGO-wordmark.png" alt="Gate33 Logo" className="h-6" />
          </a>
          {isLoggedIn ? (
            <UserProfileButton className="ml-4 mr-4 header-button min-w-0" />
          ) : (
            <a 
              href="/login" 
              className="px-6 py-2 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors font-medium header-button login-button"
            >
              Log In / Sign Up
            </a>
          )}
        </div>
      </header>

      {/* Mobile Navigation Panel (Slides from right) */}
      <nav
        className={`fixed top-0 right-0 h-full w-72 max-w-full bg-black/85 z-[70] transition-transform duration-300 ease-in-out md:hidden overflow-y-auto mobile-nav-panel backdrop-blur-sm ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Close Button inside the panel */}
        <button
          className="absolute top-4 right-4 text-orange-500 focus:outline-none text-2xl"
          onClick={() => setMenuOpen(false)}
        >
          &times;
        </button>
        
        <div className="flex flex-col px-4 pb-6 pt-16">
          <a href="/" className={`block py-2 text-lg font-medium hover:text-orange-500 transition-colors mb-4 border-b border-gray-800 pb-4`} onClick={() => setMenuOpen(false)}>HOME</a>
          <div className="border-t border-gray-800 my-2"></div>
          {isLoggedIn ? (
            <div className="pt-2">
              <UserProfileButton />
            </div>
          ) : (
            <div className="pt-2">
              <a 
                href="/login" 
                className="block w-full px-6 py-2.5 bg-orange-500 text-white rounded-full text-center hover:bg-orange-600 transition-colors font-medium" 
                onClick={() => setMenuOpen(false)}
              >
                Log In / Sign Up
              </a>
            </div>
          )}
        </div>
      </nav>      {/* Main Content with spacing for glassmorphism header */}
      <main className="px-0 sm:px-0 md:px-0 lg:px-0 w-full">{children}</main>

      {/* Modern Footer - Only show contact form on index page */}
      <footer id="main-footer" className="bg-[#FF6A00] text-black border-t-4 border-orange-500 mt-0">
        <div className="text-center text-black/60 text-xs mt-4 pb-2">
          © 2025 Gate33. All Rights Reserved.
        </div>
      </footer>
    </div>
  );
};

export default Layout;

