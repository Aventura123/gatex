"use client";

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import '../components/global.css';
import UserProfileButton from './UserProfileButton';

const FullScreenLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      console.log("Login check - userId:", localStorage.getItem("userId"));
      console.log("Login check - userRole:", localStorage.getItem("userRole"));
      
      const hasToken = Boolean(
        localStorage.getItem("userId") // Check for admin/support
      );
      console.log("Login check - isLoggedIn:", hasToken);
      setIsLoggedIn(hasToken);
    }
  }, []);

  // Force component re-render when localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const hasToken = Boolean(
        localStorage.getItem("userId") // Check for admin/support
      );
      setIsLoggedIn(hasToken);
    };

    window.addEventListener('storage', handleStorageChange);
    // Also listen for our custom login event
    window.addEventListener('userLoggedIn', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userLoggedIn', handleStorageChange);
    };
  }, []);

  // Dropdown close timers
  const [jobsDropdownTimer, setJobsDropdownTimer] = useState<NodeJS.Timeout | null>(null);
  const [toolsDropdownTimer, setToolsDropdownTimer] = useState<NodeJS.Timeout | null>(null);
  const [learnDropdownTimer, setLearnDropdownTimer] = useState<NodeJS.Timeout | null>(null);

  // Dropdown handlers
  const handleJobsEnter = () => {
    if (jobsDropdownTimer) clearTimeout(jobsDropdownTimer);
    if (toolsDropdownTimer) clearTimeout(toolsDropdownTimer);
    if (learnDropdownTimer) clearTimeout(learnDropdownTimer);
    setJobsDropdownOpen(true);
    setToolsDropdownOpen(false);
    setLearnDropdownOpen(false);
  };
  const handleJobsLeave = () => {
    const timer = setTimeout(() => setJobsDropdownOpen(false), 1000);
    setJobsDropdownTimer(timer);
  };
  const handleToolsEnter = () => {
    if (jobsDropdownTimer) clearTimeout(jobsDropdownTimer);
    if (toolsDropdownTimer) clearTimeout(toolsDropdownTimer);
    if (learnDropdownTimer) clearTimeout(learnDropdownTimer);
    setToolsDropdownOpen(true);
    setJobsDropdownOpen(false);
    setLearnDropdownOpen(false);
  };
  const handleToolsLeave = () => {
    const timer = setTimeout(() => setToolsDropdownOpen(false), 1000);
    setToolsDropdownTimer(timer);
  };
  const handleLearnEnter = () => {
    if (jobsDropdownTimer) clearTimeout(jobsDropdownTimer);
    if (toolsDropdownTimer) clearTimeout(toolsDropdownTimer);
    if (learnDropdownTimer) clearTimeout(learnDropdownTimer);
    setLearnDropdownOpen(true);
    setJobsDropdownOpen(false);
    setToolsDropdownOpen(false);
  };
  const handleLearnLeave = () => {
    const timer = setTimeout(() => setLearnDropdownOpen(false), 1000);
    setLearnDropdownTimer(timer);
  };
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
            {isLoggedIn && (
              <UserProfileButton className="ml-4 mr-4 header-button min-w-0" />
            )}
          </nav>
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
          {/* Home link */}
          <a href="/" className={`block py-2 text-lg font-medium hover:text-orange-500 transition-colors mb-4 border-b border-gray-800 pb-4`} onClick={() => setMenuOpen(false)}>HOME</a>
          <div className="border-t border-gray-800 my-2"></div>
          {/* Login/Profile Section */}
          {isLoggedIn && (
            <div className="pt-2">
              <UserProfileButton />
            </div>
          )}
        </div>
      </nav>
      <main className="px-0 sm:px-0 md:px-0 lg:px-0 w-full">{children}</main>
    </div>
  );
};

export default FullScreenLayout;