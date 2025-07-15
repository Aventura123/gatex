"use client";

import { useState } from 'react';
import Link from 'next/link';
import '../globals.css';
import '../../styles/globals.css';

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username) {
      setMessage({ type: 'error', text: 'Please enter your username' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ 
          type: 'success', 
          text: data.message || 'If your account exists, you will receive an email with instructions to reset your password.' 
        });
        setUsername('');
      } else {
        setMessage({ 
          type: 'error', 
          text: data.error || 'An error occurred. Please try again later.' 
        });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: 'An error occurred. Please try again later.' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-orange-900 to-red-900 flex flex-col items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-[300px] w-[300px] rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 blur-3xl"></div>
      </div>
      
      <div className="relative w-full max-w-md p-8 space-y-8 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-xl border border-orange-500/30">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 7.89a2 2 0 002.82 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
            Gatex Password Recovery
          </h1>
          <p className="mt-2 text-sm text-gray-300">
            Enter your admin username and we will send you a password reset link
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-green-900/50 border-green-500/50 text-green-300' 
              : 'bg-red-900/50 border-red-500/50 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
              Admin Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 bg-gray-700 text-white placeholder-gray-400"
              placeholder="Enter your username"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 focus:ring-offset-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Sending...
                </div>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </div>
        </form>

        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-orange-400 hover:text-orange-300 font-medium transition-colors">
            ← Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
