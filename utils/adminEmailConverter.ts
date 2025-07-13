/**
 * Username to Internal Email Conversion System
 * 
 * Converts admin/support usernames to unique internal emails
 * to avoid conflicts with real user emails.
 */

export type AdminRole = 'admin' | 'support';

/**
 * Converts username to internal Firebase Auth email
 * 
 * @param username - Admin/support username
 * @param role - User role ('admin' or 'support')
 * @returns Internal email in format: role.username@gate33.internal
 * 
 * @example
 * usernameToInternalEmail("admin_user", "admin") 
 * // → "admin.admin_user@gate33.internal"
 * 
 * usernameToInternalEmail("support_user", "support")
 * // → "support.support_user@gate33.internal"
 */
export function usernameToInternalEmail(username: string, role: AdminRole): string {
  // Remove special characters and normalize
  const cleanUsername = username
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '') // Keep only letters, numbers, _ and -
    .replace(/^[^a-z]/, 'u') // Ensure starts with letter (prefix 'u' if needed)
    .slice(0, 50); // Limit size
  
  if (!cleanUsername) {
    throw new Error(`Invalid username for conversion: "${username}"`);
  }
  
  return `${role}.${cleanUsername}@gate33.internal`;
}

/**
 * Extracts username from internal email
 * 
 * @param internalEmail - Internal email in format role.username@gate33.internal
 * @returns Original username
 * 
 * @example
 * internalEmailToUsername("admin.user123@gate33.internal")
 * // → "user123"
 */
export function internalEmailToUsername(internalEmail: string): string {
  try {
    // admin.user123@gate33.internal → ["admin", "user123"]
    const emailPart = internalEmail.split('@')[0];
    const parts = emailPart.split('.');
    
    if (parts.length !== 2) {
      throw new Error(`Invalid internal email format: ${internalEmail}`);
    }
    
    return parts[1]; // Return the username
  } catch (error) {
    throw new Error(`Error extracting username from internal email: ${internalEmail}`);
  }
}

/**
 * Extracts role from internal email
 * 
 * @param internalEmail - Internal email in format role.username@gate33.internal
 * @returns Role ('admin' or 'support')
 */
export function internalEmailToRole(internalEmail: string): AdminRole {
  try {
    const emailPart = internalEmail.split('@')[0];
    const role = emailPart.split('.')[0];
    
    if (role !== 'admin' && role !== 'support') {
      throw new Error(`Invalid role extracted: ${role}`);
    }
    
    return role as AdminRole;
  } catch (error) {
    throw new Error(`Error extracting role from internal email: ${internalEmail}`);
  }
}

/**
 * Checks if email is an internal system email
 * 
 * @param email - Email to check
 * @returns true if internal email
 */
export function isInternalEmail(email: string): boolean {
  return email.endsWith('@gate33.internal') && 
         (email.startsWith('admin.') || email.startsWith('support.'));
}

/**
 * Generates secure temporary password for Firebase Auth account creation
 * (Real password stays in Firestore, this is just for Firebase Auth)
 */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

/**
 * Validates if username is valid for conversion
 */
export function validateUsername(username: string): boolean {
  if (!username || username.length < 3 || username.length > 50) {
    return false;
  }
  
  // Allow only letters, numbers, _ and -
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(username);
}
