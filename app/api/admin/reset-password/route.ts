import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from '../../../../lib/firebaseAdmin';
import { hash } from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return NextResponse.json({ 
        error: 'Token and new password are required' 
      }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ 
        error: 'New password must be at least 6 characters long' 
      }, { status: 400 });
    }

    console.log('🔐 Processing password reset with token');
    
    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();

    // 1. Find token in passwordResets collection
    const tokenDoc = await db.collection('passwordResets').doc(token).get();
    
    if (!tokenDoc.exists) {
      console.log('❌ Invalid or expired token');
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    const tokenData = tokenDoc.data();
    
    if (!tokenData) {
      console.log('❌ Token data is undefined');
      return NextResponse.json({ error: 'Invalid token data' }, { status: 400 });
    }
    
    // Check if token is expired or already used
    const now = new Date();
    const expiresAt = new Date(tokenData.expiresAt);
    
    if (tokenData.used || now > expiresAt) {
      console.log('❌ Token expired or already used');
      return NextResponse.json({ error: 'Token expired or already used' }, { status: 400 });
    }

    // 2. Verify this is an admin password reset
    if (tokenData.userType !== 'admin') {
      console.error('❌ Invalid token type:', tokenData.userType);
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // 3. Get admin document
    const adminDoc = await db.collection('admins').doc(tokenData.userId).get();
    
    if (!adminDoc.exists) {
      console.error('❌ Admin not found:', tokenData.userId);
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const adminData = adminDoc.data();
    if (!adminData) {
      console.error('❌ Admin data is undefined');
      return NextResponse.json({ error: 'User data could not be retrieved' }, { status: 500 });
    }
    
    console.log('📋 Admin found:', adminDoc.id);

    // 4. Hash new password
    const hashedNewPassword = await hash(newPassword, 10);

    // 5. Update password in Firestore
    await db.collection('admins').doc(adminDoc.id).update({
      password: hashedNewPassword,
      updatedAt: new Date().toISOString(),
      passwordChangedAt: new Date().toISOString(),
      requiresPasswordChange: false
    });

    // 6. Update Firebase Auth password if user exists
    if (adminData.firebaseAuthUid) {
      try {
        await adminAuth.updateUser(adminData.firebaseAuthUid, {
          password: newPassword // Firebase Auth handles its own hashing
        });
        console.log('✅ Firebase Auth password updated');
      } catch (authError) {
        console.warn('⚠️ Failed to update Firebase Auth password:', authError);
        // Continue - Firestore password was updated successfully
      }
    }

    // 7. Mark token as used
    await db.collection('passwordResets').doc(token).update({
      used: true,
      usedAt: new Date().toISOString()
    });

    console.log('✅ Password reset completed for admin:', adminDoc.id);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('❌ Error processing password reset:', error);
    return NextResponse.json({ 
      error: 'Password reset failed. Please try again.' 
    }, { status: 500 });
  }
}
