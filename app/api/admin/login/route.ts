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

    console.log('🔐 Attempting to authenticate admin:', username);
    
    // 1. Buscar admin por username no Firestore (case-insensitive search)
    // Get all admins and filter manually since Firestore doesn't support case-insensitive queries
    const adminsCollection = collection(db, 'admins');
    const allAdminsSnapshot = await getDocs(adminsCollection);
    
    console.log('📊 Total admins in database:', allAdminsSnapshot.docs.length);
    
    // Debug: Log all usernames in database
    allAdminsSnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Admin ${index + 1}: "${data.username}"`);
    });
    
    let adminDoc = null;
    for (const doc of allAdminsSnapshot.docs) {
      const adminData = doc.data();
      console.log(`🔍 Comparing: "${adminData.username?.toLowerCase()}" === "${username.toLowerCase()}"`);
      if (adminData.username && adminData.username.toLowerCase() === username.toLowerCase()) {
        adminDoc = doc;
        console.log('✅ Match found!');
        break;
      }
    }
    
    console.log('📊 Case-insensitive search result:', adminDoc ? 'Admin found' : 'No admin found', 'for username:', username);
    
    if (!adminDoc) {
      console.log('❌ No admin found with username:', username);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const adminData = adminDoc.data();
    
    console.log('📋 Admin document data:', {
      id: adminDoc.id,
      username: adminData.username,
      role: adminData.role,
      hasPassword: !!adminData.password,
      email: adminData.email,
      name: adminData.name
    });

    // 2. Verificar password (bcrypt)
    if (!adminData.password) {
      console.error('❌ Admin found but no password defined:', adminDoc.id);
      return NextResponse.json({ error: 'Invalid administrator account' }, { status: 401 });
    }

    let passwordValid = false;
    try {
      console.log('🔐 Input password length:', password.length);
      console.log('🔐 Stored password hash starts with:', adminData.password.substring(0, 20) + '...');
      passwordValid = await compare(password, adminData.password);
    } catch (compareError) {
      console.error('❌ Error comparing passwords:', compareError);
      return NextResponse.json({ error: 'Password validation error' }, { status: 500 });
    }
    
    console.log('🔍 Password validation:', passwordValid ? 'Success' : 'Failed');

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // 3. Converter username para email interno (usar username original do banco em lowercase)
    const role = adminData.role || 'admin';
    const internalEmail = usernameToInternalEmail(adminData.username.toLowerCase(), role);
    console.log('🔄 Internal email generated:', internalEmail);

    // 4. Inicializar Firebase Admin
    initAdmin();
    const adminAuth = getAdminAuth();

    // 5. Criar/obter conta Firebase Auth
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
            console.log('🔄 Updating admin document with Firebase UID');
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
              displayName: adminData.name || adminData.username,
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

    // 6. Definir custom claims
    await adminAuth.setCustomUserClaims(firebaseUser.uid, {
      role: role,
      username: adminData.username.toLowerCase(), // Use lowercase version of original username
      adminId: adminDoc.id
    });
    
    console.log('✅ Custom claims set for user:', firebaseUser.uid);

    // 7. Criar token personalizado
    const customToken = await adminAuth.createCustomToken(firebaseUser.uid);
    
    console.log('✅ Custom token generated successfully');

    // 8. Configurar cookie de sessão (manter compatibilidade)
    const tokenData = {
      id: adminDoc.id,
      username: adminData.username.toLowerCase(), // Use lowercase version of original username
      role: adminData.role || 'viewer',
      timestamp: Date.now(),
      firebaseUid: firebaseUser.uid
    };
    
    const legacyToken = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    const cookieStore = await cookies();
    cookieStore.set('adminSession', legacyToken, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });

    // 9. Retornar token Firebase Auth para o frontend
    return NextResponse.json({
      success: true,
      firebaseToken: customToken, // Token para autenticar no Firebase Auth
      admin: {
        id: adminDoc.id,
        name: adminData.name || '',
        username: adminData.username.toLowerCase(), // Use lowercase version of original username
        email: adminData.email || '',
        role: adminData.role || 'viewer',
        photoURL: adminData.photoURL || adminData.photo || null,
        firebaseUid: firebaseUser.uid
      },
      requiresPasswordChange: adminData.requiresPasswordChange || false // Flag to force password change
    });
  } catch (error) {
    console.error('❌ Error during authentication:', error);
    return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 500 });
  }
}
