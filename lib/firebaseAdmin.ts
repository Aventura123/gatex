import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Inicializa o Firebase Admin SDK com melhorias para v13.x
 */
export function initAdmin() {
  if (getApps().length === 0) {
    console.log('=== INICIALIZANDO FIREBASE ADMIN v13.x ===');
    
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    console.log('Configuração de ambiente:', {
      hasClientEmail: !!clientEmail,
      hasProjectId: !!projectId,
      hasPrivateKey: !!privateKey,
      hasGoogleAppCreds: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
    });
    
    if (!projectId) {
      throw new Error('PROJECT_ID é obrigatório. Verifique FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    }
    
    try {
      let app;
      
      // Estratégia 1: Application Default Credentials (recomendado)
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('🔑 Usando Application Default Credentials...');
        app = initializeApp({
          credential: applicationDefault(),
          projectId: projectId,
        });
        console.log('✅ ADC inicializado com sucesso');
      }
      // Estratégia 2: Service Account manual
      else if (privateKey && clientEmail) {
        console.log('🔑 Usando credenciais de Service Account...');
        
        // Corrigir formato da chave privada
        console.log('🔧 Corrigindo formatação da chave privada...');
        let cleanPrivateKey = privateKey.replace(/\\n/g, '\n');
        
        if (!cleanPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
          throw new Error('Formato da chave privada inválido');
        }
        
        console.log('✅ Chave privada corrigida');
        
        const credential = cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: cleanPrivateKey,
        });
        
        app = initializeApp({
          credential: credential,
          projectId: projectId,
        });
        
        console.log('✅ Service Account inicializado com sucesso');
      }
      // Estratégia 3: Modo básico (para desenvolvimento/emuladores)
      else {
        console.log('🔑 Modo básico - apenas Project ID...');
        app = initializeApp({
          projectId: projectId,
        });
        console.log('✅ Modo básico inicializado');
      }
      
      // Verificar se Auth está disponível
      try {
        const auth = getAuth(app);
        console.log('🔐 Firebase Auth service verificado');
      } catch (authError) {
        console.warn('⚠️ Auth service não disponível:', authError);
      }
      
      console.log('🚀 Firebase Admin SDK inicializado com sucesso!');
      console.log('📊 Detalhes finais:', {
        projectId,
        appName: app.name,
        authAvailable: true,
      });
      
      return app;
      
    } catch (error) {
      console.error('❌ ERRO NA INICIALIZAÇÃO DO FIREBASE ADMIN ===');
      
      const errorDetails = error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      } : {
        message: String(error),
        name: 'UnknownError',
        stack: 'N/A',
      };
      
      console.error('🔍 Detalhes do erro:', errorDetails);
      
      // Sugestões de solução
      console.error('💡 Possíveis soluções:');
      console.error('   1. Verificar variáveis de ambiente');
      console.error('   2. Verificar formato da FIREBASE_PRIVATE_KEY');
      console.error('   3. Verificar se o Project ID está correto');
      console.error('   4. Verificar se o service account tem permissões');
      
      throw new Error(`Falha na inicialização do Firebase Admin: ${errorDetails.message}`);
    }
  } else {
    console.log('♻️ Firebase Admin SDK já estava inicializado');
    return getApps()[0];
  }
}

/**
 * Obtém instância do Firebase Auth com tratamento de erro melhorado
 * Compatível com Firebase Admin SDK v13.x
 */
export function getAdminAuth() {
  try {
    // Certificar que o Admin está inicializado
    if (getApps().length === 0) {
      console.log('Admin não inicializado, inicializando...');
      initAdmin();
    }
    
    const app = getApps()[0];
    const auth = getAuth(app);
    
    // Verificação adicional para v13.x
    if (!auth) {
      throw new Error('Firebase Auth instance is null');
    }
    
    console.log('✅ Firebase Admin Auth obtido com sucesso');
    return auth;
  } catch (error) {
    console.error('❌ Erro ao obter Firebase Admin Auth:', error);
    throw error;
  }
}

/**
 * Obtém instância do Firestore Admin
 */
export function getAdminFirestore() {
  try {
    // Certificar que o Admin está inicializado
    if (getApps().length === 0) {
      console.log('Admin não inicializado, inicializando...');
      initAdmin();
    }
    
    const app = getApps()[0];
    const firestore = getFirestore(app);
    
    if (!firestore) {
      throw new Error('Firebase Firestore instance is null');
    }
    
    console.log('✅ Firebase Admin Firestore obtido com sucesso');
    return firestore;
  } catch (error) {
    console.error('❌ Erro ao obter Firebase Admin Firestore:', error);
    throw error;
  }
}

/**
 * Verifica se o Firebase Admin está corretamente configurado
 */
export function validateAdminConfiguration(): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Verificar variáveis de ambiente críticas
  if (!process.env.FIREBASE_PROJECT_ID && !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    errors.push('FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_PROJECT_ID não definido');
  }
  
  // Verificar credenciais
  const hasADC = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasServiceAccount = !!(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL);
  
  if (!hasADC && !hasServiceAccount) {
    errors.push('Nenhuma credencial válida encontrada (ADC ou Service Account)');
  }
  
  if (hasServiceAccount) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      warnings.push('Formato da chave privada pode estar incorreto');
    }
  }
  
  // Verificar se já está inicializado
  if (getApps().length === 0) {
    warnings.push('Firebase Admin não foi inicializado ainda');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
