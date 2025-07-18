// Configuração de cache para otimizar build times
module.exports = {
  // Cache configurações para páginas estáticas
  staticPageGenerationTimeout: 60, // 1 minuto para páginas estáticas
  
  // Configurações específicas para páginas rápidas (apenas as que realmente existem)
  fastPages: [
    '/404',        // Pages Router - única página 404
    '/_error'      // Pages Router - página de erro
  ],
  
  // Configurações de cache para diferentes tipos de páginas
  pageCache: {
    // Páginas de erro - cache mais agressivo
    errorPages: {
      maxAge: 3600, // 1 hora
      staleWhileRevalidate: 86400, // 24 horas
    },
    
    // Páginas estáticas - cache moderado
    staticPages: {
      maxAge: 300, // 5 minutos
      staleWhileRevalidate: 3600, // 1 hora
    },
    
    // Páginas dinâmicas - cache mínimo
    dynamicPages: {
      maxAge: 0,
      staleWhileRevalidate: 60, // 1 minuto
    }
  }
};
