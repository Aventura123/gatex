"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAdminAuth } from '../hooks/useAdminAuth';

interface UserProfileButtonProps {
  className?: string;
}

const UserProfileButton: React.FC<UserProfileButtonProps> = ({ className = "" }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{
    name: string;
    photo: string;
    role: string;
    type: 'admin' | 'support';
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // Usar o hook do Firebase Auth para admin/support
  const adminAuth = useAdminAuth();
  
  // Detect if it's a mobile version to adjust the dropdown behavior
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Reference for the dropdown container to detect mouse leave
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Reference for the dropdown close timer
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const router = useRouter();

  // Function to fetch admin/support data from Firebase
  const fetchUserDataFromFirebase = async (type: 'admin' | 'support', id: string) => {
    try {
      if (!db) return null;
      
      const collection = type === 'admin' ? 'admins' : 'support';
      console.log(`Attempting to fetch ${type} data from '${collection}' collection with ID: ${id}`);
      
      const docRef = doc(db, collection, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        console.log(`${type} document found:`, docSnap.data());
        return docSnap.data();
      } else {
        console.log(`No ${type} document found for ID: ${id}`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching ${type} data:`, error);
      return null;
    }
  };

  // Function to check the logged-in user type
  useEffect(() => {
    const checkLoggedInUser = async () => {
      setIsLoading(true);
      
      // Debug localStorage
      console.log("🔍 UserProfileButton localStorage check:", {
        userId: localStorage.getItem("userId"),
        userRole: localStorage.getItem("userRole"),
        userName: localStorage.getItem("userName"),
        userPhoto: localStorage.getItem("userPhoto"),
        isAuthenticated: document.cookie.includes("isAuthenticated=true")
      });
      
      try {
        // First priority: Check localStorage for any logged in user
        const userId = localStorage.getItem("userId");
        const userRole = localStorage.getItem("userRole");
        const userName = localStorage.getItem("userName");
        
        if (userId && userRole) {
          console.log("✅ Found user in localStorage:", { userId, userRole, userName });
          
          // Handle admin/support users
          if (userRole === "super_admin" || userRole === "admin" || userRole === "support") {
            const formattedRole = userRole === "super_admin" ? "Super Admin" : 
                             userRole === "support" ? "Support" : "Admin";

            const userInfo = {
              name: userName || "Admin",
              photo: localStorage.getItem("userPhoto") || "/images/default-avatar.png",
              role: formattedRole,
              type: (userRole === "support" ? 'support' : 'admin') as 'admin' | 'support'
            };
            
            console.log("✅ Setting userInfo:", userInfo);
            setUserInfo(userInfo);
            setIsLoading(false);
            return userInfo;
          }
        } else {
          console.log("❌ No userId or userRole found in localStorage");
        }
        
        // Check Firebase Auth for admin/support (secondary check)
        if (adminAuth.isReady && adminAuth.user && !userId) {
          setUserInfo({
            name: adminAuth.username || adminAuth.user.displayName || "Admin",
            photo: adminAuth.user.photoURL || "/images/default-avatar.png",
            role: adminAuth.role === 'admin' ? 'Admin' : 'Support',
            type: adminAuth.role as 'admin' | 'support'
          });
          setIsLoading(false);
          return;
        }

        // Check localStorage for admin/support users (detailed check)
        if (localStorage.getItem("userId") && localStorage.getItem("userRole")) {
          const userId = localStorage.getItem("userId");
          const userRole = localStorage.getItem("userRole") || "";
          const userName = localStorage.getItem("userName");
          
          console.log("🔍 Found user credentials:", { userId, userRole, userName });
          
          // Handle admin users
          if (userRole === "super_admin" || userRole === "admin") {
            console.log("👑 Processing as admin account");
            const adminData = await fetchUserDataFromFirebase('admin', userId || "");
            const formattedRole = userRole === "super_admin" ? "Super Admin" : "Admin";

            // For admins, we need to be careful about the name
            // Check if userName is "suporte" and avoid using it for admin accounts
            let adminName;
            
            if (userName && userName.toLowerCase() !== "suporte") {
              adminName = userName;
              console.log("Using userName from localStorage:", adminName);
            } else if (adminData?.name) {
              adminName = adminData.name;
              console.log("Using name from adminData:", adminName);
              
              // Update localStorage with correct name from Firebase
              console.log("Updating localStorage userName with correct admin name from Firebase");
              localStorage.setItem("userName", adminData.name);
            } else {
              adminName = "Admin";
              console.log("Using fallback admin name");
            }
            
            console.log("🎯 Final admin name:", adminName);
                             
            return {
              name: adminName,
              photo: adminData?.photoURL || localStorage.getItem("userPhoto") || "/images/default-avatar.png",
              role: formattedRole,
              type: 'admin' as const
            };
          }
          
          // Handle support users
          else if (userRole === "support" && userId) {
            console.log("Processing as support account");
            const supportData = await fetchUserDataFromFirebase('support', userId);
            return {
              name: supportData?.name || userName || "Support",
              photo: supportData?.photoURL || localStorage.getItem("userPhoto") || "/images/default-avatar.png",
              role: "Support",
              type: 'support' as const
            };
          }
        }
      } catch (error) {
        console.error("Error checking logged in user:", error);
      } finally {
        setIsLoading(false);
      }
      
      setIsLoading(false);
      return null;
    };

    // Only run on client
    if (typeof window !== 'undefined') {
      checkLoggedInUser().then(user => {
        if (user) {
          setUserInfo(user);
        }
        setIsLoading(false);
      });
    }
  }, [adminAuth]); // Dependência do adminAuth para re-executar quando muda

  // Listen for storage changes to detect login/logout
  useEffect(() => {
    const handleStorageChange = () => {
      // Re-check user info when localStorage changes
      if (typeof window !== 'undefined') {
        const checkLoggedInUser = async () => {
          setIsLoading(true);
          
          try {
            // First priority: Check localStorage for any logged in user
            const userId = localStorage.getItem("userId");
            const userRole = localStorage.getItem("userRole");
            const userName = localStorage.getItem("userName");
            
            if (userId && userRole) {
              // Handle admin/support users
              if (userRole === "super_admin" || userRole === "admin" || userRole === "support") {
                const formattedRole = userRole === "super_admin" ? "Super Admin" : 
                                 userRole === "support" ? "Support" :
                                 userRole.charAt(0).toUpperCase() + userRole.slice(1);

                setUserInfo({
                  name: userName || "Admin",
                  photo: localStorage.getItem("userPhoto") || "/images/default-avatar.png",
                  role: formattedRole,
                  type: userRole === "support" ? 'support' : 'admin'
                });
                setIsLoading(false);
                return;
              }
            } else {
              // No user logged in
              setUserInfo(null);
            }
          } catch (error) {
            console.error("Error checking logged in user:", error);
          } finally {
            setIsLoading(false);
          }
        };
        
        checkLoggedInUser();
      }
    };

    // Listen for storage events
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for a custom event we'll dispatch after login
    window.addEventListener('userLoggedIn', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userLoggedIn', handleStorageChange);
    };
  }, []);

  // Add event listener to handle clicks outside the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Functions to handle opening and closing the dropdown with delay
  const handleMouseEnter = () => {
    // Cancel any pending close timer
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    // Set a timer to close the dropdown after 1.5 seconds
    closeTimerRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
    }, 1500); // 1.5 seconds delay to allow cursor movement
  };

  // Clear the timer when the component is unmounted
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    try {
      // Clear admin/support authentication tokens
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      localStorage.removeItem("userPhoto");
      localStorage.removeItem("userRole");
      
      // Clear authentication cookie
      document.cookie = "isAuthenticated=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      
      // Se é admin/support via Firebase Auth, fazer logout do Firebase
      if (adminAuth.user) {
        try {
          const { auth } = await import("../lib/firebase");
          const { signOut } = await import("firebase/auth");
          await signOut(auth);
          console.log("Firebase Auth logout successful");
        } catch (firebaseError) {
          console.error("Error during Firebase logout:", firebaseError);
        }
      }
      
      // Force redirect to home without any delays that could cause loops
      window.location.href = "/";
      
    } catch (error) {
      console.error("Error during logout:", error);
      // Em caso de erro, forçar redirecionamento para home
      window.location.href = "/";
    }
  };

  const handleGoToDashboard = () => {
    if (!userInfo) return;
    switch (userInfo.type) {
      case 'admin':
        router.push("/admin/dashboard");
        break;
      case 'support':
        router.push("/support-dashboard");
        break;
      default:
        // Fallback: go to home
        router.push("/");
        break;
    }
  };

  // If not logged in, render nothing
  if (isLoading) {
    return (
      <div className={`relative ${className}`}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-orange-500 bg-black/20 flex items-center justify-center">
            <div className="animate-pulse w-4 h-4 bg-orange-500 rounded-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!userInfo) {
    return null;
  }
  return (
    <div 
      className={`relative ${className}`}
      ref={dropdownRef}
      onMouseEnter={isMobile ? undefined : handleMouseEnter}
      onMouseLeave={isMobile ? undefined : handleMouseLeave}
    >      <div
        className="flex items-center gap-2 cursor-pointer whitespace-nowrap"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-orange-500">
          <img
            src={userInfo.photo}
            alt={`${userInfo.name}'s profile`}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = '/images/default-avatar.png';
            }}
          />
        </div>        <h1 className={`text-sm font-medium text-orange-500 flex-shrink-0 ${isMobile ? 'inline' : 'hidden md:inline'}`} style={{ fontFamily: 'Verdana, sans-serif' }}>
          My Profile
        </h1>
      </div>
      
      {isDropdownOpen && (
        <div 
          className={`${isMobile ? 'relative left-0 w-full' : 'absolute right-0 w-48'} mt-2 bg-black/95 border border-gray-700 rounded-md shadow-lg py-1 z-50`}
          onMouseEnter={isMobile ? undefined : handleMouseEnter}
          onMouseLeave={isMobile ? undefined : handleMouseLeave}
        >
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-orange-400 font-semibold">{userInfo.name}</p>
            <p className="text-gray-400 text-xs">{userInfo.role}</p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-gray-200 hover:bg-red-600 hover:text-white w-full text-left"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfileButton;
