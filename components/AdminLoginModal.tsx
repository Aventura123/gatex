"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import "./global.css";
// import { logSystemActivity } from "../utils/logSystem"; // Temporarily commented
import { auth } from '../lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!username || !password) {
      setError("Please enter both username and password");
      setIsLoading(false);
      return;
    }

    try {
      console.log("🔐 Attempting admin login for:", username);
      
      // 1. Login via API (returns Firebase token)
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ username: username, password: password })
      });

      console.log("📡 Response status:", res.status);
      
      if (!res.ok) {
        let errorMessage = `Error ${res.status}: ${res.statusText}`;
        try {
          const errorData = await res.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          console.error("❌ Error parsing error response:", parseError);
        }
        
        throw new Error(errorMessage);
      }
      
      const contentType = res.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        console.warn("⚠️ Response is not JSON. Content-Type:", contentType);
        const textData = await res.text();
        try {
          data = JSON.parse(textData);
        } catch (e) {
          console.error("❌ Failed to parse response as JSON:", e);
          throw new Error("Invalid server response format");
        }
      }
      
      console.log("📦 Response received:", data);

      if (data.success && data.firebaseToken) {
        console.log("✅ Admin login successful!");

        // 2. Authenticate with Firebase using custom token
        try {
          const userCredential = await signInWithCustomToken(auth, data.firebaseToken);
          console.log("🔥 Firebase authentication successful:", userCredential.user.uid);
          
          // Wait for custom claims to propagate
          await userCredential.user.getIdToken(true);
          console.log("🏷️ Custom claims refreshed - Ready for Firestore operations");
          
        } catch (firebaseError: any) {
          console.error("❌ Firebase authentication failed:", firebaseError);
          throw new Error("Firebase authentication failed: " + firebaseError.message);
        }

        // 3. Save admin data in localStorage (for UI display)
        if (data.admin) {
          console.log("👤 Admin data:", data.admin);
          
          localStorage.setItem("userId", data.admin.id);
          localStorage.setItem("userName", data.admin.name || data.admin.username || username);
          localStorage.setItem("userRole", data.admin.role || "viewer");
          localStorage.setItem("adminUsername", data.admin.username); // Store username separately
          
          if (data.admin.photoURL) {
            localStorage.setItem("userPhoto", data.admin.photoURL);
          }
          
          // TEMPORARILY COMMENTED: System activity logging to avoid permission errors
          /*
          await logSystemActivity(
            "login",
            data.admin.name || data.admin.username || username,
            {
              adminId: data.admin.id,
              role: data.admin.role || "viewer",
              timestamp: new Date().toISOString(),
              loginMethod: "admin-portal"
            }
          );
          */
        } else {
          console.warn("⚠️ Admin data not found in response");
        }

        // 4. Set authentication cookie for compatibility
        document.cookie = "isAuthenticated=true; path=/; max-age=86400"; // 24 hours
        
        // Dispatch custom event to notify UserProfileButton
        window.dispatchEvent(new Event('userLoggedIn'));
        
        console.log("🚀 Authentication complete, redirecting to admin dashboard");
        router.replace("/admin/dashboard");
        
      } else {
        console.error("❌ Error during login:", data.error);
        setError(data.error || "Invalid username or password");
        
        // TEMPORARILY COMMENTED: System activity logging
        /*
        await logSystemActivity(
          "login",
          username,
          {
            success: false,
            error: data.error || "Invalid username or password",
            timestamp: new Date().toISOString(),
            loginMethod: "admin-portal"
          }
        );
        */
      }
    } catch (err: any) {
      console.error("❌ Error during login process:", err);
      setError(err.message || "An error occurred. Please try again.");
      
      // TEMPORARILY COMMENTED: System activity logging
      /*
      await logSystemActivity(
        "login",
        username,
        {
          success: false,
          error: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
          loginMethod: "admin-portal"
        }
      );
      */
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-orange-500/30">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-orange-500">Admin Login</h2>
              <p className="text-sm text-gray-300 mt-1">Access your admin dashboard</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-900/50 border border-red-500/50 text-red-300 px-4 py-3 rounded relative mb-4" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            
            <div className="mb-6">
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="Enter your admin username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 bg-gray-700 text-white placeholder-gray-400"
                required
              />
            </div>
            
            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 bg-gray-700 text-white placeholder-gray-400"
                required
              />
            </div>
            
            <div className="mb-2 text-right">
              <a href="/forgot-password" className="text-xs text-orange-400 hover:text-orange-300 font-medium">
                Forgot password?
              </a>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full bg-orange-500 text-white py-3 px-4 rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 focus:ring-offset-gray-800 transition-colors font-medium ${
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                {isLoading ? "Logging in..." : "Login to Admin Panel"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginModal;
