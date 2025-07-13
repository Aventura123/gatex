import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from '../../../../lib/firebaseAdmin';
import { hash } from 'bcryptjs';
import { generateTempPassword } from '../../../../utils/adminEmailConverter';

// POST: Generate temporary password for admin (super admin only)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, requesterUid } = body;

    if (!username || !requesterUid) {
      return NextResponse.json({ 
        error: 'Username and requester UID are required' 
      }, { status: 400 });
    }

    console.log('🔐 Temp password request for admin:', username, 'by:', requesterUid);
    
    const normalizedUsername = username.toLowerCase();
    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();

    // 1. Verify requester is super admin
    const requesterDoc = await db.collection('admins').doc(requesterUid).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== 'super_admin') {
      console.log('❌ Requester is not super admin');
      return NextResponse.json({ 
        error: 'Only super administrators can generate temporary passwords' 
      }, { status: 403 });
    }

    // 2. Find target admin by username
    const adminsSnapshot = await db.collection('admins')
      .where('username', '==', normalizedUsername)
      .get();
    
    if (adminsSnapshot.empty) {
      console.log('❌ No admin found with username:', normalizedUsername);
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const adminDoc = adminsSnapshot.docs[0];
    const adminData = adminDoc.data();
    
    console.log('📋 Target admin found:', adminDoc.id);

    // 3. Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedTempPassword = await hash(tempPassword, 10);

    // 4. Update password in Firestore
    await db.collection('admins').doc(adminDoc.id).update({
      password: hashedTempPassword,
      updatedAt: new Date().toISOString(),
      tempPasswordGeneratedAt: new Date().toISOString(),
      tempPasswordGeneratedBy: requesterUid,
      requiresPasswordChange: true // Flag to force password change on next login
    });

    // 5. Update Firebase Auth password if user exists
    if (adminData.firebaseAuthUid) {
      try {
        await adminAuth.updateUser(adminData.firebaseAuthUid, {
          password: tempPassword
        });
        console.log('✅ Firebase Auth password updated');
      } catch (authError: any) {
        console.warn('⚠️ Failed to update Firebase Auth password:', authError.message);
      }
    }

    console.log('✅ Temporary password generated for admin:', adminDoc.id);

    return NextResponse.json({
      success: true,
      message: 'Temporary password generated successfully',
      tempPassword: tempPassword, // Only return this to super admin
      username: adminData.username,
      adminName: adminData.name
    });

  } catch (error) {
    console.error('❌ Error generating temporary password:', error);
    return NextResponse.json({ 
      error: 'Failed to generate temporary password. Please try again.' 
    }, { status: 500 });
  }
}
