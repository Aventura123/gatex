import { NextResponse } from 'next/server';
import { db, auth } from '../../../../lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { compare } from 'bcryptjs';
import { cookies } from 'next/headers';
import { signInWithCustomToken } from 'firebase/auth';
import { initAdmin } from '../../../../lib/firebaseAdmin';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { usernameToInternalEmail, generateTempPassword } from '../../../../utils/adminEmailConverter';

export async function POST(request: Request) {
  try {
    // Check if Firestore is initialized
    if (!db) {
      console.error('Firestore was not initialized correctly');
      return NextResponse.json({ error: 'Service unavailable. Please try again later.' }, { status: 503 });
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    console.log('🔐 Attempting to authenticate support user:', username);
    
    const normalizedUsername = username.toLowerCase(); // Normalize to lowercase
    console.log('🔄 Normalized username:', normalizedUsername);

    // 1. Buscar admin por username no Firestore (case-insensitive)
    const adminsCollection = collection(db, 'admins');
    const qUsername = query(adminsCollection, where("username", "==", normalizedUsername));
    let querySnapshot = await getDocs(qUsername);
    
    console.log('📊 Query result:', querySnapshot.size, 'user(s) found with username:', normalizedUsername);
    
    if (querySnapshot.empty) {
      console.log('❌ No user found with username:', normalizedUsername);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const adminDoc = querySnapshot.docs[0];
    const adminData = adminDoc.data();
    
    console.log('📋 User document data:', {
      id: adminDoc.id,
      username: adminData.username,
      role: adminData.role,
      hasPassword: !!adminData.password,
      email: adminData.email,
      name: adminData.name
    });

    // 2. Verificar se o usuário tem permissão para acessar o support dashboard
    const userRole = adminData.role;
    if (!['support', 'admin', 'super_admin'].includes(userRole)) {
      console.log('❌ User does not have support permissions. Role:', userRole);
      return NextResponse.json({ 
        error: `You do not have permission to access the support panel. Current role: ${userRole}` 
      }, { status: 403 });
    }

    // 3. Verificar password (bcrypt)
    if (!adminData.password) {
      console.error('❌ User found but no password defined:', adminDoc.id);
      return NextResponse.json({ error: 'Invalid user account' }, { status: 401 });
    }

    let passwordValid = false;
    try {
      passwordValid = await compare(password, adminData.password);
    } catch (compareError) {
      console.error('❌ Error comparing passwords:', compareError);
      return NextResponse.json({ error: 'Password validation error' }, { status: 500 });
    }
    
    console.log('🔍 Password validation:', passwordValid ? 'Success' : 'Failed');

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // 4. Converter username para email interno (sempre como support para manter consistência)
    const internalEmail = usernameToInternalEmail(normalizedUsername, 'support');
    console.log('🔄 Internal email generated:', internalEmail);

    // 5. Inicializar Firebase Admin
    initAdmin();
    const adminAuth = getAdminAuth();

    // 6. Criar/obter conta Firebase Auth
    let firebaseUser;
    try {
      // First, check if user already exists by UID stored in Firestore
      if (adminData.firebaseAuthUid) {
        console.log('🔍 Checking existing Firebase Auth UID:', adminData.firebaseAuthUid);
        try {
          firebaseUser = await adminAuth.getUser(adminData.firebaseAuthUid);
          console.log('✅ Found existing Firebase user by UID:', firebaseUser.uid);
        } catch (uidError: any) {
          if (uidError.code === 'auth/user-not-found') {
            console.log('⚠️ Firebase user with stored UID not found, will create new one');
          } else {
            throw uidError;
          }
        }
      }
      
      // If not found by UID, try to find by email
      if (!firebaseUser) {
        try {
          firebaseUser = await adminAuth.getUserByEmail(internalEmail);
          console.log('✅ Found existing Firebase user by email:', firebaseUser.uid);
          
          // Update Firestore document with the Firebase UID if not stored
          if (!adminData.firebaseAuthUid) {
            console.log('🔄 Updating user document with Firebase UID');
            await updateDoc(doc(db, 'admins', adminDoc.id), {
              firebaseAuthUid: firebaseUser.uid
            });
          }
        } catch (emailError: any) {
          if (emailError.code === 'auth/user-not-found') {
            console.log('🆕 Creating new Firebase Auth user...');
            
            // Criar nova conta Firebase Auth
            firebaseUser = await adminAuth.createUser({
              email: internalEmail,
              displayName: adminData.name || normalizedUsername,
              password: generateTempPassword() // Senha temporária para Firebase Auth
            });
            
            console.log('✅ Firebase Auth user created:', firebaseUser.uid);
            
            // Store the Firebase UID in the admin document
            await updateDoc(doc(db, 'admins', adminDoc.id), {
              firebaseAuthUid: firebaseUser.uid,
              internalEmail: internalEmail
            });
          } else {
            console.error('❌ Error accessing Firebase Auth:', emailError);
            throw emailError;
          }
        }
      }
    } catch (error: any) {
      console.error('❌ Error in Firebase Auth user management:', error);
      throw error;
    }

    // 7. Definir custom claims para support
    await adminAuth.setCustomUserClaims(firebaseUser.uid, {
      role: userRole, // Mantém o role original (support, admin ou super_admin)
      username: normalizedUsername,
      adminId: adminDoc.id,
      accessLevel: 'support' // Flag específica para indicar acesso ao support dashboard
    });
    
    console.log('✅ Custom claims set for support user:', firebaseUser.uid);

    // 8. Criar token personalizado
    const customToken = await adminAuth.createCustomToken(firebaseUser.uid);
    
    console.log('✅ Custom token generated successfully');

    // 9. Configurar cookie de sessão específico para support
    const tokenData = {
      id: adminDoc.id,
      username: adminData.username,
      role: adminData.role,
      accessLevel: 'support',
      timestamp: Date.now(),
      firebaseUid: firebaseUser.uid
    };
    
    const supportToken = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    const cookieStore = await cookies();
    cookieStore.set('supportSession', supportToken, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });

    // 10. Retornar token Firebase Auth para o frontend
    return NextResponse.json({
      success: true,
      firebaseToken: customToken, // Token para autenticar no Firebase Auth
      admin: {
        id: adminDoc.id,
        name: adminData.name || '',
        username: adminData.username, // Mostrar username, não email
        email: adminData.email || '',
        role: adminData.role,
        accessLevel: 'support',
        photoURL: adminData.photoURL || adminData.photo || null,
        firebaseUid: firebaseUser.uid
      },
      requiresPasswordChange: adminData.requiresPasswordChange || false
    });
  } catch (error) {
    console.error('❌ Error during support authentication:', error);
    return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 500 });
  }
}
