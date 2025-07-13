import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { getAdminFirestore, getAdminAuth } from "../../../lib/firebaseAdmin";
import { 
  usernameToInternalEmail, 
  generateTempPassword, 
  validateUsername,
  AdminRole 
} from "../../../utils/adminEmailConverter";

// Interface para tipar os dados do administrador
interface AdminData {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  password?: string;
  createdAt: string;
  updatedAt: string;
}

// GET: Buscar todos os administradores
export async function GET(req: NextRequest) {
  try {
    const db = getAdminFirestore();
    
    const adminsCollection = await db.collection("admins").get();
    
    const admins = adminsCollection.docs.map(doc => {
      const data = doc.data() as Omit<AdminData, 'id'>;
      // Remover dados sensíveis
      delete data.password;
      
      return {
        id: doc.id,
        ...data
      };
    });
    
    return NextResponse.json(admins);
  } catch (error: any) {
    console.error("Erro ao buscar administradores:", error);
    return NextResponse.json(
      { error: "Erro ao buscar administradores", message: error.message },
      { status: 500 }
    );
  }
}

// POST: Create a new administrator with Firebase Auth integration
export async function POST(req: NextRequest) {
  try {
    const { name, username, password, email, role } = await req.json();
    
    // Basic validation
    if (!name || !username || !password || !email || !role) {
      return NextResponse.json(
        { error: "Incomplete data" },
        { status: 400 }
      );
    }

    // Validate username format
    if (!validateUsername(username)) {
      return NextResponse.json(
        { error: "Invalid username format. Use only letters, numbers, _ and -" },
        { status: 400 }
      );
    }

    // Validate role
    if (!['admin', 'support'].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'support'" },
        { status: 400 }
      );
    }
    
    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();
    
    // Check if username already exists
    const usernameQuery = await db.collection("admins")
      .where("username", "==", username)
      .get();
    
    if (!usernameQuery.empty) {
      return NextResponse.json(
        { error: "Username is already in use" },
        { status: 400 }
      );
    }
    
    // Check if email already exists
    const emailQuery = await db.collection("admins")
      .where("email", "==", email)
      .get();
    
    if (!emailQuery.empty) {
      return NextResponse.json(
        { error: "Email is already in use" },
        { status: 400 }
      );
    }

    // Generate internal email for Firebase Auth
    const internalEmail = usernameToInternalEmail(username, role as AdminRole);
    console.log('🔄 Generated internal email:', internalEmail);

    // Create Firebase Auth user first
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.createUser({
        email: internalEmail,
        displayName: name,
        password: generateTempPassword() // Temporary password for Firebase Auth
      });
      
      console.log('✅ Firebase Auth user created:', firebaseUser.uid);
    } catch (firebaseError: any) {
      console.error('❌ Error creating Firebase Auth user:', firebaseError);
      return NextResponse.json(
        { error: "Error creating Firebase Auth account", message: firebaseError.message },
        { status: 500 }
      );
    }
    
    // Hash password for Firestore storage
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Use Firebase UID as document ID to sync both systems
    const adminId = firebaseUser.uid;
    
    try {
      // Create document in Firestore using Firebase UID
      await db.collection("admins").doc(adminId).set({
        id: adminId,
        name,
        username,
        email,
        role,
        password: hashedPassword,
        firebaseUid: firebaseUser.uid,
        internalEmail: internalEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Set custom claims for Firebase Auth
      await adminAuth.setCustomUserClaims(firebaseUser.uid, {
        role: role,
        username: username,
        adminId: adminId
      });

      console.log('✅ Admin created and synced:', adminId);
      
      return NextResponse.json(
        { 
          success: true, 
          message: "Administrator created successfully",
          admin: {
            id: adminId,
            name,
            username,
            email,
            role,
            firebaseUid: firebaseUser.uid
          }
        },
        { status: 201 }
      );
    } catch (firestoreError: any) {
      // If Firestore fails, clean up Firebase Auth user
      try {
        await adminAuth.deleteUser(firebaseUser.uid);
        console.log('🧹 Cleaned up Firebase Auth user after Firestore error');
      } catch (cleanupError) {
        console.error('❌ Error cleaning up Firebase Auth user:', cleanupError);
      }
      
      throw firestoreError;
    }
  } catch (error: any) {
    console.error("Error creating administrator:", error);
    return NextResponse.json(
      { error: "Error creating administrator", message: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Remove administrator from both Firestore and Firebase Auth
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    
    if (!id) {
      return NextResponse.json(
        { error: "Administrator ID is required" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();
    
    // Remove from Firestore
    await db.collection("admins").doc(id).delete();
    
    // Remove from Firebase Auth (ID should be the same as Firebase UID)
    try {
      await adminAuth.deleteUser(id);
      console.log('✅ Removed from Firebase Auth:', id);
    } catch (authError: any) {
      // Log but don't fail if Firebase Auth user doesn't exist
      console.warn('⚠️ Firebase Auth user not found or already deleted:', authError.message);
    }
    
    return NextResponse.json(
      { success: true, message: "Administrator removed successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error removing administrator:", error);
    return NextResponse.json(
      { error: "Error removing administrator", message: error.message },
      { status: 500 }
    );
  }
}
