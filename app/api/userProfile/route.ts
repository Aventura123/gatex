import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "../../../lib/firebaseAdmin";

// GET: Fetch user profile data with or without ID
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const targetCollection = url.searchParams.get("collection");

    if (!userId) {
      return NextResponse.json({ 
        error: "User ID is required" 
      }, { status: 400 });
    }

    const db = getAdminFirestore();

    // If a specific collection is requested, check that first
    if (targetCollection) {
      const userRef = db.collection(targetCollection).doc(userId);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log(`GET: Found user data in ${targetCollection}:`, userData);
        return NextResponse.json({ 
          photoUrl: userData?.photoURL || null,
          collection: targetCollection,
          userData: userData
        });
      }
    }

    // Check all collections that might contain the user
    const collections = ["admins", "employers", "seekers", "users"];
    
    for (const collectionName of collections) {
      // Skip the target collection if we already checked it
      if (collectionName === targetCollection) continue;
      
      console.log(`GET: Checking collection: ${collectionName}`);
      const userRef = db.collection(collectionName).doc(userId);
      const userDoc = await userRef.get();
      
      console.log(`GET: Document exists in ${collectionName}:`, userDoc.exists);
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log(`GET: Found user data in ${collectionName}:`, userData);
        return NextResponse.json({ 
          photoUrl: userData?.photoURL || null,
          collection: collectionName,
          userData: userData
        });
      }
    }
    
    // If user not found in any collection
    return NextResponse.json({ photoUrl: null, userData: null });
  } catch (error: any) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { error: "Error fetching user profile", message: error.message },
      { status: 500 }
    );
  }
}

// POST: Update user profile data
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, photoUrl, collection = "admins", ...otherFields } = body;

    if (!userId) {
      return NextResponse.json({ 
        error: "Invalid parameters", 
        message: "userId is required" 
      }, { status: 400 });
    }

    console.log("📝 POST: Updating user profile for:", userId, "in collection:", collection);
    console.log("📝 POST: Update data:", { 
      photoUrl: photoUrl ? "[PHOTO_URL_PROVIDED]" : null, 
      otherFields: Object.keys(otherFields),
      fieldsCount: Object.keys(otherFields).length
    });

    const db = getAdminFirestore();

    // Reference to the user document in the specified collection
    const userRef = db.collection(collection).doc(userId);
    
    // Check if the document exists
    const userDoc = await userRef.get();
    
    console.log("📝 POST: Document exists:", userDoc.exists);
    
    if (userDoc.exists) {
      // Update existing document with all fields from the request
      const updateData = {
        ...otherFields,
        updatedAt: new Date().toISOString()
      };
      
      // Only include photoUrl if it was provided
      if (photoUrl) {
        updateData.photoURL = photoUrl;
      }
      
      console.log("📝 POST: Updating document with data:", Object.keys(updateData));
      
      await userRef.update(updateData);
      
      console.log("✅ POST: User profile updated successfully in Firestore");
      return NextResponse.json({ 
        success: true,
        message: "Profile updated successfully"
      });
    } else {
      // Create a new document with all fields from the request
      const newData = {
        ...otherFields,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Only include photoUrl if it was provided
      if (photoUrl) {
        newData.photoURL = photoUrl;
      }
      
      console.log("📝 POST: Creating new document with data:", Object.keys(newData));
      
      await userRef.set(newData);
      
      console.log("✅ POST: New user document created with all profile data");
      return NextResponse.json({ 
        success: true,
        message: "New profile created successfully"
      });
    }
  } catch (error: any) {
    console.error("❌ POST: Error updating user profile:", error);
    return NextResponse.json(
      { error: "Error updating user profile", message: error.message },
      { status: 500 }
    );
  }
}