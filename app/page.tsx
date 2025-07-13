'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Layout from '../components/Layout';

function Home() {
  const router = useRouter();
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#181A20]">
        <div className="w-full max-w-md mx-auto bg-[#23262F] rounded-2xl shadow-lg p-8 flex flex-col items-center gap-8 border border-orange-500/30">
          <h1 className="text-3xl md:text-4xl font-bold text-orange-500 mb-2 text-center font-verdana tracking-wide">GateX Admin Portal</h1>
          <p className="text-gray-300 text-base md:text-lg text-center mb-4 font-verdana">
            Welcome to the GateX private dashboard.<br />Select your access type below:
          </p>
          <div className="flex flex-col gap-6 w-full">
            <button
              className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg font-verdana shadow-md transition-all border-none focus:outline-none focus:ring-2 focus:ring-orange-500"
              onClick={() => router.push('/admin-login')}
            >
              Admin Access
            </button>
            <button
              className="w-full py-4 rounded-xl bg-[#23262F] border border-orange-500 text-orange-500 font-bold text-lg font-verdana shadow-md transition-all hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              onClick={() => router.push('/support-login')}
            >
              Support Access
            </button>
          </div>
        </div>
        <div className="mt-8 text-center text-xs text-gray-500 font-verdana">
          GateX &copy; {new Date().getFullYear()} &mdash; Restricted access
        </div>
      </div>
    </Layout>
  );
}

export default Home;

