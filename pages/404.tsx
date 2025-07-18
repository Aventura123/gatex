import React from 'react';
import Link from 'next/link';

// Página 404 super otimizada - sem dependências externas
const Custom404: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header minimalista */}
      <header className="p-4 border-b border-gray-800">
        <Link href="/" className="text-orange-500 font-bold text-xl">
          GATE33
        </Link>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-6xl font-bold text-orange-500 mb-4">404</h1>
          <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
          <p className="text-gray-300 mb-8">
            The page you are looking for does not exist or has been moved.
          </p>
          
          <div className="space-y-4">
            <Link 
              href="/" 
              className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Back to Homepage
            </Link>
            
            <div className="text-sm text-gray-400">
              <p>Quick Links:</p>
              <div className="mt-2 space-x-4">
                <Link href="/jobs" className="text-orange-400 hover:text-orange-300">
                  Jobs
                </Link>
                <Link href="/instant-jobs" className="text-orange-400 hover:text-orange-300">
                  Instant Jobs
                </Link>
                <Link href="/learn2earn" className="text-orange-400 hover:text-orange-300">
                  Learn2Earn
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Custom404;
