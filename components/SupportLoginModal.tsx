"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from '../lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';

interface SupportLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SupportLoginModal: React.FC<SupportLoginModalProps> = ({ isOpen, onClose }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!username || !password) {
        setError("Please enter both username and password");
        setLoading(false);
        return;
      }

      console.log("🔐 Attempting support login for:", username);

      // Chama API específica do support
      const res = await fetch("/api/support/login", {
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
        console.log("✅ Support login successful!");

        // Authenticate with Firebase using custom token
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

        // Salva dados no localStorage
        if (data.admin) {
          console.log("👤 Support user data:", data.admin);
          
          localStorage.setItem("userId", data.admin.id);
          localStorage.setItem("userName", data.admin.name || data.admin.username || username);
          localStorage.setItem("userRole", data.admin.role);
          localStorage.setItem("adminUsername", data.admin.username);
          localStorage.setItem("accessLevel", "support"); // Flag específica para support
          
          if (data.admin.photoURL) {
            localStorage.setItem("userPhoto", data.admin.photoURL);
          }
        } else {
          console.warn("⚠️ Support user data not found in response");
        }

        // Set authentication cookie for compatibility
        document.cookie = "isAuthenticated=true; path=/; max-age=86400"; // 24 hours

        // Dispatch custom event to notify UserProfileButton
        window.dispatchEvent(new Event('userLoggedIn'));

        // Permite acesso para support, admin e super_admin
        const role = data.admin?.role;
        if (["support", "admin", "super_admin"].includes(role)) {
          console.log("🚀 Support authentication complete, redirecting to support dashboard");
          onClose();
          router.replace("/support-dashboard");
        } else {
          throw new Error("You do not have permission to access the support panel. Current role: " + role);
        }
      } else {
        console.error("❌ Error during support login:", data.error);
        setError(data.error || "Invalid username or password");
      }
    } catch (err: any) {
      console.error("❌ Error during support login process:", err);
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-blue-500/30">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-blue-500">Support Login</h2>
              <p className="text-sm text-gray-300 mt-1">Access your support dashboard</p>
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
          
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-900/50 border border-red-500/50 text-red-300 px-4 py-3 rounded relative mb-4" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white placeholder-gray-400"
                placeholder="Enter your username"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white placeholder-gray-400"
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className={`w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-800 transition-colors font-medium ${
                loading ? "opacity-70 cursor-not-allowed" : ""
              }`}
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Logging in...
                </div>
              ) : (
                "Login to Support Panel"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              Support panel access for authorized personnel only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportLoginModal;
