"use client";

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setMessage({
        type: 'error',
        text: 'Invalid or missing reset token. Please request a new password reset link.'
      });
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setMessage({ type: 'error', text: 'Invalid or missing reset token' });
      return;
    }

    if (!newPassword) {
      setMessage({ type: 'error', text: 'Please enter a new password' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ 
          type: 'success', 
          text: 'Your password has been reset successfully. You will be redirected to login.' 
        });
        
        // Clear form
        setNewPassword('');
        setConfirmPassword('');
        
        // Redirect to login page after 3 seconds
        setTimeout(() => {
          router.push('/admin-login');
        }, 3000);
      } else {
        setMessage({ 
          type: 'error', 
          text: data.error || 'An error occurred while resetting your password.' 
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
          <h1 className="text-2xl font-bold text-gray-900">Reset Admin Password</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter a new password for your admin account
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter new password"
              disabled={isSubmitting || !token}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Confirm new password"
              disabled={isSubmitting || !token}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting || !token}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Resetting...' : 'Reset Password'}
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
