import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from '../../../../lib/firebaseAdmin';
import { g33TokenDistributorService } from '../../../../services/g33TokenDistributorService';

/**
 * API endpoint for manual token distribution by administrators
 * This allows admins to manually distribute tokens to specific addresses
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔄 [MANUAL API] Starting manual G33 token distribution");

    const requestData = await request.json();
    const { 
      recipientAddress, 
      usdValue, 
      reason, 
      adminId
    } = requestData;

    // Validation
    if (!recipientAddress || !ethers.utils.isAddress(recipientAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid recipient address' },
        { status: 400 }
      );
    }

    if (!usdValue || typeof usdValue !== 'number' || usdValue <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid USD value' },
        { status: 400 }
      );
    }

    if (usdValue < 1) {
      return NextResponse.json(
        { success: false, error: 'USD value too low. Minimum required: 1 USD' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length < 5) {
      return NextResponse.json(
        { success: false, error: 'Reason is required (minimum 5 characters)' },
        { status: 400 }
      );
    }

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    // Round USD value to integer
    const finalUsdValue = Math.floor(usdValue);
    const tokenAmount = finalUsdValue * 20; // 20 G33 tokens per USD

    console.log(`📊 [MANUAL API] Manual distribution request:`, {
      recipientAddress,
      usdValue: finalUsdValue,
      tokenAmount,
      reason,
      adminId
    });

    // Check if service is initialized
    if (!g33TokenDistributorService.checkIsInitialized()) {
      console.log("⏳ [MANUAL API] Waiting for service initialization...");
      await g33TokenDistributorService.init(true);
      
      if (!g33TokenDistributorService.checkIsInitialized()) {
        const initError = g33TokenDistributorService.getInitializationError();
        return NextResponse.json({
          success: false,
          error: "Token distributor service not available",
          details: initError || "Service initialization failed"
        }, { status: 503 });
      }
    }

    // Initialize Firebase Admin
    await initAdmin();
    const db = getFirestore();

    // Create manual distribution record in Firebase using Admin SDK
    const manualDistributionData = {
      recipientAddress,
      usdValue: finalUsdValue,
      tokenAmount,
      reason: reason.trim(),
      adminId,
      type: 'manual',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const docRef = await db.collection('manualTokenDistributions').add(manualDistributionData);
    const distributionId = docRef.id;

    console.log(`📝 [MANUAL API] Manual distribution record created: ${distributionId}`);

    try {
      // Perform the actual token distribution
      console.log(`🚀 [MANUAL API] Calling token distribution service...`);
      const distributionResult = await g33TokenDistributorService.distributeTokens(
        recipientAddress,
        finalUsdValue
      );

      if (!distributionResult) {
        // Update record as failed using Admin SDK
        await db.collection('manualTokenDistributions').doc(distributionId).update({
          status: 'failed',
          error: 'Token distribution failed - no transaction hash returned',
          updatedAt: new Date()
        });

        return NextResponse.json({
          success: false,
          error: 'Token distribution failed',
          distributionId
        }, { status: 500 });
      }

      console.log("✅ [MANUAL API] Tokens distributed successfully");

      // Update record as successful using Admin SDK
      await db.collection('manualTokenDistributions').doc(distributionId).update({
        status: 'distributed',
        distributionTxHash: distributionResult,
        updatedAt: new Date()
      });

      return NextResponse.json({
        success: true,
        transactionHash: distributionResult,
        distributionId,
        recipientAddress,
        tokenAmount,
        usdValue: finalUsdValue,
        message: `Successfully distributed ${tokenAmount} G33 tokens to ${recipientAddress}`
      });

    } catch (distributionError: any) {
      console.error("❌ [MANUAL API] Error during token distribution:", distributionError);

      // Update record as failed using Admin SDK
      await db.collection('manualTokenDistributions').doc(distributionId).update({
        status: 'failed',
        error: distributionError.message || 'Distribution failed',
        updatedAt: new Date()
      });

      return NextResponse.json({
        success: false,
        error: 'Token distribution failed',
        details: distributionError.message || 'Unknown error',
        distributionId
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("❌ [MANUAL API] Unexpected error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Unexpected error during manual distribution',
        details: error.message || String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to fetch manual distribution history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');

    // For now, return a simple implementation
    // In production, you would implement proper filtering and pagination
    
    return NextResponse.json({
      success: true,
      distributions: [],
      message: "Manual distribution history endpoint - implementation pending"
    });

  } catch (error: any) {
    console.error("❌ [MANUAL API] Error fetching distribution history:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Error fetching distribution history',
        details: error.message || String(error)
      },
      { status: 500 }
    );
  }
}
