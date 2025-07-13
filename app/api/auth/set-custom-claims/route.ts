import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '../../../../lib/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, claims } = body;

    if (!uid) {
      return NextResponse.json(
        { error: 'UID is required' },
        { status: 400 }
      );
    }

    if (!claims || typeof claims !== 'object') {
      return NextResponse.json(
        { error: 'Claims object is required' },
        { status: 400 }
      );
    }

    // Initialize Firebase Admin
    const adminApp = initAdmin();
    
    if (!adminApp) {
      console.error('Failed to initialize Firebase Admin');
      return NextResponse.json(
        { error: 'Firebase Admin initialization failed' },
        { status: 500 }
      );
    }

    // Get Firebase Admin Auth
    const adminAuth = getAuth(adminApp);

    // Set custom claims
    console.log(`Setting custom claims for user ${uid}:`, claims);
    
    try {
      await adminAuth.setCustomUserClaims(uid, claims);
      console.log(`Custom claims set successfully for user ${uid}`);
      
      return NextResponse.json({ 
        success: true, 
        message: `Custom claims set for user ${uid}`,
        claims 
      });
    } catch (authError: any) {
      console.error('Firebase Auth error setting custom claims:', authError);
      
      // Handle specific Firebase Auth errors
      if (authError.code === 'auth/user-not-found') {
        return NextResponse.json(
          { 
            error: 'User not found in Firebase Auth',
            code: authError.code 
          },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to set custom claims',
          details: authError.message,
          code: authError.code 
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in set-custom-claims API:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
