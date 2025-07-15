/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  trailingSlash: false,
  compress: true,
  
  // Environment específico para admin
  env: {
    NEXT_PUBLIC_APP_TYPE: 'admin',
    NEXT_PUBLIC_APP_NAME: 'GateX Admin',
    NEXT_PUBLIC_APP_VERSION: 'admin-only',
  },
  
  // Otimizações experimentais
  experimental: {
    optimizePackageImports: ['@headlessui/react', '@heroicons/react', 'lucide-react'],
    webpackBuildWorker: true, // Use separate workers for webpack builds
  },
  
  // Bundle optimization para produção
  webpack: (config, { dev, isServer }) => {
    // Fix para compatibilidade com Edge Runtime
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "crypto": false,
        "stream": false,
        "util": false,
        "os": false,
        "path": false,
      };
    }
    
    // Otimizações apenas para produção
    if (!dev && !isServer) {
      // Configurar chunks menores para loading mais rápido
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        maxSize: 200000, // 200KB max chunk size
        chunks: 'all',
        cacheGroups: {
          // Chunk separado para Firebase
          firebase: {
            name: 'firebase',
            test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
            chunks: 'all',
            priority: 40,
            maxSize: 150000,
          },
          // Chunk para bibliotecas Web3
          web3: {
            name: 'web3',
            test: /[\\/]node_modules[\\/](ethers|@walletconnect|@web3modal|@reown|@wagmi|viem|wagmi)[\\/]/,
            chunks: 'all',
            priority: 30,
            maxSize: 200000,
          },
          // Chunk para charts
          charts: {
            name: 'charts',
            test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2|recharts|apexcharts|react-apexcharts|lightweight-charts)[\\/]/,
            chunks: 'all',
            priority: 25,
            maxSize: 150000,
          },
          // Chunk para UI
          ui: {
            name: 'ui',
            test: /[\\/]node_modules[\\/](@headlessui|@heroicons|lucide-react|framer-motion)[\\/]/,
            chunks: 'all',
            priority: 20,
            maxSize: 100000,
          },
          // React chunk
          react: {
            name: 'react',
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            chunks: 'all',
            priority: 50,
            maxSize: 100000,
          },
          // Vendors padrão (menor prioridade, chunks menores)
          default: {
            name: 'vendors',
            test: /[\\/]node_modules[\\/]/,
            chunks: 'all',
            priority: 10,
            maxSize: 100000, // 100KB limit para vendors
            minChunks: 2,
          }
        }
      };
      
      // Otimizar resolução de módulos
      config.resolve.extensions = ['.tsx', '.ts', '.jsx', '.js', '.json'];
      
      // Reduzir tamanho do bundle removendo source maps em produção
      config.devtool = false;
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
  
  // Configurações de compilação otimizadas
  poweredByHeader: false,
  distDir: '.next',
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'] // Keep error and warning logs
    } : false,
    styledComponents: true, // Optimize styled-components if used
  },
  
  // Performance optimizations
  onDemandEntries: {
    maxInactiveAge: 25 * 1000, // 25 seconds
    pagesBufferLength: 2,
  },
};

module.exports = nextConfig;
