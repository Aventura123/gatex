import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebaseAdmin';
import { randomBytes } from 'crypto';
import { sendAdminResetPasswordEmail } from '../../../../utils/emailService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    console.log('🔐 Password reset request for admin:', username);
    
    const normalizedUsername = username.toLowerCase().trim();
    const db = getAdminFirestore();

    // 1. Find admin by username (case-insensitive search)
    // First, get all admins and filter manually since Firestore doesn't support case-insensitive queries
    const adminsSnapshot = await db.collection('admins').get();
    
    let adminDoc = null;
    for (const doc of adminsSnapshot.docs) {
      const adminData = doc.data();
      if (adminData.username && adminData.username.toLowerCase() === normalizedUsername) {
        adminDoc = doc;
        break;
      }
    }
    
    if (!adminDoc) {
      // For security, don't reveal if the username exists or not
      console.log('❌ No admin found with username:', normalizedUsername);
      return NextResponse.json({ 
        success: true, 
        message: 'If your account exists, you will receive an email with instructions to reset your password.' 
      });
    }

    const adminData = adminDoc.data();
    
    console.log('📋 Admin found:', adminDoc.id);

    // Check if the admin has an email address
    if (!adminData.email) {
      console.error('❌ Admin has no email address:', adminDoc.id);
      return NextResponse.json({ error: 'No email address associated with this account' }, { status: 400 });
    }

    // 2. Generate a secure reset token
    const resetToken = randomBytes(32).toString('hex');
    
    // 3. Store the token in Firestore with expiration (24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    await db.collection('passwordResets').doc(resetToken).set({
      userId: adminDoc.id,
      username: adminData.username,
      userType: 'admin',
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      used: false
    });

    // 4. Send the password reset email
    await sendAdminResetPasswordEmail(adminData.email, resetToken);
    
    console.log('✅ Password reset email sent to:', adminData.email);

    return NextResponse.json({
      success: true,
      message: 'If your account exists, you will receive an email with instructions to reset your password.'
    });
  } catch (error) {
    console.error('❌ Error processing password reset request:', error);
    return NextResponse.json({ 
      error: 'Password reset request failed. Please try again.' 
    }, { status: 500 });
  }
}
