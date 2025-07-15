"use client";

import { useState } from 'react';
import Link from 'next/link';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Password Recovery</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter your admin username and we will send you a password reset link
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Admin Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your username"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send Reset Link'}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <Link href="/admin-login" className="text-sm text-indigo-600 hover:text-indigo-500">
            Return to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
