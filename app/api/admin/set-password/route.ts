import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebaseAdmin';
import { hash } from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, password, username } = body;

    if (!userId || !password) {
      return NextResponse.json({ error: 'userId and password are required' }, { status: 400 });
    }

    console.log('🔧 Setting password for admin:', userId, 'username:', username);

    // Hash the password
    const hashedPassword = await hash(password, 12);
    console.log('🔐 Password hashed successfully');

    // Update the admin document
    const db = getAdminFirestore();
    const adminRef = db.collection('admins').doc(userId);
    
    const updateData: any = {
      password: hashedPassword,
      updatedAt: new Date().toISOString()
    };
    
    // If username is provided, ensure it's stored
    if (username) {
      updateData.username = username.toLowerCase();
    }
    
    await adminRef.update(updateData);
    
    console.log('✅ Admin password updated successfully');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Password set successfully',
      userId: userId
    });

  } catch (error: any) {
    console.error('❌ Error setting admin password:', error);
    return NextResponse.json(
      { error: 'Failed to set password', details: error.message },
      { status: 500 }
    );
  }
}
