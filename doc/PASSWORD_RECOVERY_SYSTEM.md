
# GateX Password Recovery System

## Overview

The GateX system uses internal emails (`admin.username@gate33.internal`) that do not allow password recovery via standard Firebase Auth. Therefore, we implemented our own password recovery system.

## Implemented Features

### 1. Password Reset (Self-service)
**Endpoint:** `POST /api/admin/reset-password`

Allows an admin to change their own password by providing:
- Current username
- Current password (for verification)
- New password

```json
{
  "username": "aventura77",
  "currentPassword": "current_password",
  "newPassword": "new_secure_password"
}
```

### 2. Temporary Password Generation (Super Admin)
**Endpoint:** `POST /api/admin/generate-temp-password`

Allows super admins to generate temporary passwords for other admins:
- Only super admins can use
- Generates a random temporary password
- Forces the admin to change the password on next login

```json
{
  "username": "admin_forgot_password",
  "requesterUid": "super_admin_uid"
}
```

### 3. Temporary Password Verification
The login system checks if the admin needs to change the password and returns the `requiresPasswordChange` flag.

## Recovery Flow

### Scenario 1: Admin remembers the current password
1. Admin accesses the password change form
2. Provides username, current password, and new password
3. System validates and updates both Firestore and Firebase Auth

### Scenario 2: Admin forgot the password
1. Admin contacts a super admin
2. Super admin uses the interface/API to generate a temporary password
3. Super admin provides the temporary password to the admin
4. Admin logs in with the temporary password
5. System forces password change on first login

## Security

- Passwords are hashed with bcrypt (cost 10)
- Current password verification required for self-reset
- Only super admins can generate temporary passwords
- Detailed logs of all operations
- Temporary passwords are marked with timestamp and who generated them
- The `requiresPasswordChange` flag forces password change on next login

## Main Files

- `/app/api/admin/reset-password/route.ts` - Self reset
- `/app/api/admin/generate-temp-password/route.ts` - Temp generation (super admin)
- `/app/api/admin/login/route.ts` - Temp password verification
- `/utils/adminEmailConverter.ts` - Conversion and generation utilities

## Frontend Integration

The system is ready for integration. Required:

1. **Password Reset Form**
   - Fields: username, currentPassword, newPassword, confirmPassword
   - Password confirmation validation
   - Call to `/api/admin/reset-password`

2. **Super Admin Interface for Temp Password**
   - List of admins
   - "Generate Temporary Password" button
   - Secure display of generated password
   - Call to `/api/admin/generate-temp-password`

3. **Temporary Password Detection on Login**
   - Check `requiresPasswordChange` in login response
   - Redirect to mandatory password change form
   - Do not allow dashboard access until password is changed
