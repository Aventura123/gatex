const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, updateDoc } = require('firebase/firestore');

// Firebase Configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBUZ-F0kzPxRdlSkBacI2AnlNe8_-BuSZo',
  authDomain: 'gate33-b5029.firebaseapp.com',
  projectId: 'gate33-b5029',
  storageBucket: 'gate33-b5029.firebasestorage.app',
  messagingSenderId: '823331487278',
  appId: '1:823331487278:web:932f2936eef09e37c3a9bf'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findAndUpdateAdminPermissions() {
  try {
    console.log('Searching for administrator with username Aventura77...');
    
    // Search for admin with username Aventura77
    const adminsCollection = collection(db, 'admins');
    const q = query(adminsCollection, where('username', '==', 'Aventura77'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('Administrator with username Aventura77 not found!');
      return;
    }
    
    // Get document ID
    const adminDoc = querySnapshot.docs[0];
    const adminId = adminDoc.id;
    const adminData = adminDoc.data();
    
    console.log(`Administrator found: ${adminData.name || adminData.username} (ID: ${adminId})`);
    
    // Define super admin permissions
    const fullPermissions = {
      canManageUsers: true,
      canApproveCompanies: true,
      canDeleteJobs: true,
      canAccessSettings: true,
      canViewAnalytics: true,
      canEditContent: true
    };
    
    // Update the admin document with full permissions
    const adminRef = doc(db, 'admins', adminId);
    await updateDoc(adminRef, {
      role: 'super_admin',
      permissions: fullPermissions
    });
    
    console.log('Permissions updated successfully!');
    console.log('New permissions:', JSON.stringify(fullPermissions, null, 2));
    console.log('Role updated to: super_admin');
    
  } catch (error) {
    console.error('Error updating permissions:', error);
  }
}

// Execute the function
findAndUpdateAdminPermissions().then(() => {
  console.log('Process completed!');
  process.exit(0);
}).catch((error) => {
  console.error('Error during execution:', error);
  process.exit(1);
});