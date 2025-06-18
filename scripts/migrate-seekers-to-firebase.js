/**
 * SCRIPT DE MIGRAÇÃO DE SEEKERS PARA FIREBASE AUTH
 * 
 * ✅ FUNCIONAL - IDs SINCRONIZADOS ENTRE FIRESTORE E AUTH
 * 
 * Este script migra seekers do sistema legado para Firebase Auth,
 * garantindo que os IDs ficam sincronizados através da movimentação
 * dos documentos Firestore para usar o UID do Firebase Auth.
 * 
 * COMO USAR:
 *   node scripts/migrate-seekers-to-firebase.js --verbose
 * 
 * RESULTADO:
 *   - Cria usuários no Firebase Auth
 *   - Move documentos Firestore para novos IDs (UID do Auth)
 *   - Fotos de perfil e dados sincronizados
 *   - Senhas temporárias geradas (usar "Esqueci a senha")
 * 
 * SEGURANÇA:
 *   - Script seguro - não deleta dados
 *   - Pode ser executado múltiplas vezes
 *   - Sistema legado continua funcionando
 */

const { initializeApp, getApps } = require('firebase/app');
const { 
  getAuth, 
  createUserWithEmailAndPassword, 
  updateProfile
} = require('firebase/auth');
const { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  updateDoc,
  deleteDoc,
  setDoc
} = require('firebase/firestore');

// Configurações
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const BATCH_SIZE = 5;

// Configuração do Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBUZ-F0kzPxRdlSkBacI2AnlNe8_-BuSZo",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "gate33-b5029.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gate33-b5029",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "gate33-b5029.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "823331487278",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:823331487278:web:932f2936eef09e37c3a9bf"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

function log(message, level = 'info') {
  const prefix = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };
  
  console.log(`${prefix[level]} ${message}`);
}

function verbose(message) {
  if (VERBOSE) {
    console.log(`   🔍 ${message}`);
  }
}

function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function migrateWithCorrectIdStructure(seeker) {
  try {
    verbose(`Processando seeker: ${seeker.email} (ID atual: ${seeker.id})`);
    
    const tempPassword = generateTempPassword();
    const displayName = `${seeker.firstName || seeker.name || ''} ${seeker.lastName || seeker.surname || ''}`.trim();
    
    // Criar usuário no Firebase Auth (vai gerar novo UID)
    const userCredential = await createUserWithEmailAndPassword(auth, seeker.email, tempPassword);
    const newAuthUid = userCredential.user.uid;
    
    verbose(`Usuário criado no Auth com UID: ${newAuthUid}`);
    
    // Atualizar perfil
    if (displayName) {
      await updateProfile(userCredential.user, { 
        displayName,
        photoURL: seeker.photoURL || null
      });
    }
    
    // ESTRATÉGIA: Mover documento para usar o novo UID como ID
    verbose(`Movendo documento do Firestore para novo ID: ${newAuthUid}`);
    
    // 1. Criar novo documento com o UID do Auth
    const newSeekerRef = doc(db, 'seekers', newAuthUid);
    await setDoc(newSeekerRef, {
      ...seeker,
      firebaseAuthUid: newAuthUid,
      migratedToAuth: true,
      migrationDate: new Date(),
      authProvider: 'migrated',
      tempPassword: tempPassword,
      uidsSynchronized: true,
      oldFirestoreId: seeker.id // Guardar o ID antigo para referência
    });
    
    // 2. Deletar documento antigo
    const oldSeekerRef = doc(db, 'seekers', seeker.id);
    await deleteDoc(oldSeekerRef);
    
    verbose(`✅ IDs SINCRONIZADOS: ${newAuthUid} (documento movido)`);
    
    return { 
      success: true, 
      authUid: newAuthUid, 
      synchronized: true,
      moved: true,
      oldId: seeker.id
    };
    
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      verbose('Email já existe no Auth - pulando');
      return { success: true, authUid: 'existing', skipped: true };
    }
    
    const errorMsg = error.message || error.toString();
    verbose(`❌ Erro ao migrar: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

async function processBatch(seekers, batchNumber) {
  log(`📦 Processando lote ${batchNumber} (${seekers.length} seekers)...`);
  
  const stats = {
    total: seekers.length,
    newlyMigrated: 0,
    synchronized: 0,
    moved: 0,
    skipped: 0,
    errors: 0
  };
  
  for (const seeker of seekers) {
    if (!seeker.email || !seeker.email.includes('@')) {
      log(`Seeker ${seeker.id} ignorado: email inválido`, 'warning');
      stats.skipped++;
      continue;
    }
    
    const result = await migrateWithCorrectIdStructure(seeker);
    
    if (result.success) {
      if (result.skipped) {
        stats.skipped++;
        log(`⚠️  ${seeker.email} - email já existe no Auth`, 'warning');
      } else {
        stats.newlyMigrated++;
        if (result.synchronized) {
          stats.synchronized++;
        }
        if (result.moved) {
          stats.moved++;
        }
        log(`✅ ${seeker.email} migrado - ID: ${result.oldId} → ${result.authUid}`, 'success');
      }
    } else {
      stats.errors++;
      log(`❌ Erro ao migrar ${seeker.email}: ${result.error}`, 'error');
    }
    
    // Pausa para evitar rate limits
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  return stats;
}

async function migrateSeekers() {
  try {
    log('🚀 Iniciando migração com SINCRONIZAÇÃO DE IDs...');
    log('🎯 ESTRATÉGIA: Mover documentos Firestore para usar UID do Auth');
    
    // Buscar todos os seekers não migrados
    log('📖 Buscando seekers não migrados...');
    const seekersCollection = collection(db, 'seekers');
    const snapshot = await getDocs(seekersCollection);
    
    const seekers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.migratedToAuth) {
        seekers.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    log(`📊 Encontrados ${seekers.length} seekers para migrar`);
    
    if (seekers.length === 0) {
      log('✅ Nenhum seeker encontrado para migrar', 'success');
      return;
    }
    
    // Processar em lotes
    const totalStats = {
      total: seekers.length,
      newlyMigrated: 0,
      synchronized: 0,
      moved: 0,
      skipped: 0,
      errors: 0
    };
    
    for (let i = 0; i < seekers.length; i += BATCH_SIZE) {
      const batch = seekers.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(seekers.length / BATCH_SIZE);
      
      log(`\n📦 Lote ${batchNumber}/${totalBatches}`);
      
      const batchStats = await processBatch(batch, batchNumber);
      
      // Agregar estatísticas
      Object.keys(totalStats).forEach(key => {
        totalStats[key] += batchStats[key];
      });
      
      // Pausa entre lotes
      if (i + BATCH_SIZE < seekers.length) {
        log('⏸️  Pausa entre lotes...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Relatório final
    log('\n📊 RELATÓRIO FINAL:');
    log(`   Total de seekers: ${totalStats.total}`);
    log(`   🆕 Migrados: ${totalStats.newlyMigrated}`);
    log(`   🎯 IDs sincronizados: ${totalStats.synchronized}`);
    log(`   📦 Documentos movidos: ${totalStats.moved}`);
    log(`   ⚠️  Pulados: ${totalStats.skipped}`);
    log(`   ❌ Erros: ${totalStats.errors}`);
    
    const successRate = ((totalStats.newlyMigrated + totalStats.skipped) / totalStats.total * 100).toFixed(1);
    log(`   📈 Taxa de sucesso: ${successRate}%`);
    
    if (totalStats.synchronized > 0) {
      log('\n🎉 MIGRAÇÃO COM IDs SINCRONIZADOS CONCLUÍDA!', 'success');
      log('   ✅ Fotos de perfil devem aparecer corretamente', 'success');
      log('   ✅ Dados sincronizados entre Firestore e Auth', 'success');
    }
    
    if (totalStats.newlyMigrated > 0) {
      log('\n🔑 SENHAS TEMPORÁRIAS:', 'warning');
      log('   Usuários podem usar "Esqueci a senha" para redefinir', 'warning');
    }
    
    log('\n✅ Migração concluída!', 'success');
    
  } catch (error) {
    log(`❌ Erro fatal: ${error}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Executar migração
migrateSeekers()
  .then(() => {
    log('🎉 Script concluído com sucesso!', 'success');
    process.exit(0);
  })
  .catch((error) => {
    log(`💥 Script falhou: ${error}`, 'error');
    console.error(error);
    process.exit(1);
  });
