/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  trailingSlash: false,
  compress: true,
  
  // Environment específico para admin
  env: {
    NEXT_PUBLIC_APP_TYPE: 'admin',
    NEXT_PUBLIC_APP_NAME: 'GateX',
  },
  
  // Otimizações básicas
  experimental: {
    optimizePackageImports: ['@headlessui/react', '@heroicons/react'],
  },
  
  // Bundle optimization simplificado
  webpack: (config, { dev, isServer }) => {
    // Fix para compatibilidade com Edge Runtime
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "crypto": false,
        "stream": false,
        "util": false,
      };
    }
    
    // Otimizações básicas apenas para produção
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          // Chunk para bibliotecas Web3
          web3: {
            name: 'web3',
            test: /[\\/]node_modules[\\/](ethers|@walletconnect|@web3modal|@reown|@wagmi|viem|wagmi)[\\/]/,
            chunks: 'all',
            priority: 30,
          },
          // Chunk para UI
          ui: {
            name: 'ui',
            test: /[\\/]node_modules[\\/](@headlessui|@heroicons)[\\/]/,
            chunks: 'all',
            priority: 20,
          },
          // Vendors padrão
          default: {
            name: 'vendors',
            test: /[\\/]node_modules[\\/]/,
            chunks: 'all',
            priority: 10,
            maxSize: 1000000, // 1MB limit
          }
        }
      };
    }
    
    return config;
  },
  
  // Configurações de imagem (mantendo Firebase)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'gate33.net' },
      { protocol: 'https', hostname: 'gate33.me' },
    ],
  },
  
  // Headers de segurança básicos
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
  
  // Configurações básicas de produção
  poweredByHeader: false,
  distDir: '.next',
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

module.exports = nextConfig;
