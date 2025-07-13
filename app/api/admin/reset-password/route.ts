import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from '../../../../lib/firebaseAdmin';
import { compare, hash } from 'bcryptjs';
import { usernameToInternalEmail } from '../../../../utils/adminEmailConverter';

// POST: Reset password (admin only, requires current password)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, currentPassword, newPassword } = body;

    if (!username || !currentPassword || !newPassword) {
      return NextResponse.json({ 
        error: 'Username, current password, and new password are required' 
      }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ 
        error: 'New password must be at least 6 characters long' 
      }, { status: 400 });
    }

    console.log('🔐 Password reset request for admin:', username);
    
    const normalizedUsername = username.toLowerCase();
    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();

    // 1. Find admin by username
    const adminsSnapshot = await db.collection('admins')
      .where('username', '==', normalizedUsername)
      .get();
    
    if (adminsSnapshot.empty) {
      console.log('❌ No admin found with username:', normalizedUsername);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const adminDoc = adminsSnapshot.docs[0];
    const adminData = adminDoc.data();
    
    console.log('📋 Admin found:', adminDoc.id);

    // 2. Verify current password
    if (!adminData.password) {
      console.error('❌ Admin found but no password defined');
      return NextResponse.json({ error: 'Invalid administrator account' }, { status: 401 });
    }

    const passwordValid = await compare(currentPassword, adminData.password);
    if (!passwordValid) {
      console.log('❌ Current password validation failed');
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // 3. Hash new password
    const hashedNewPassword = await hash(newPassword, 10);

    // 4. Update password in Firestore
    await db.collection('admins').doc(adminDoc.id).update({
      password: hashedNewPassword,
      updatedAt: new Date().toISOString(),
      passwordChangedAt: new Date().toISOString()
    });

    // 5. Update Firebase Auth password if user exists
    if (adminData.firebaseAuthUid) {
      try {
        await adminAuth.updateUser(adminData.firebaseAuthUid, {
          password: newPassword // Firebase Auth handles its own hashing
        });
        console.log('✅ Firebase Auth password updated');
      } catch (authError: any) {
        console.warn('⚠️ Failed to update Firebase Auth password:', authError.message);
        // Continue - Firestore password was updated successfully
      }
    }

    console.log('✅ Password reset completed for admin:', adminDoc.id);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('❌ Error during password reset:', error);
    return NextResponse.json({ 
      error: 'Password reset failed. Please try again.' 
    }, { status: 500 });
  }
}
