/*
  # Update Role Names Migration

  1. Role Changes
    - Rename 'member' → 'fde' (Field Deployment Engineer)
    - Add new role 'account-executive' (same permissions as fde)
    - Rename 'analytics-user' → 'customer-user'
    - Remove 'core-team-member' (migrate users to 'customer-user')

  2. Affected Tables
    - users: Update role column values
    - role_permissions: Update role values in permission mappings

  3. Important Notes
    - This migration updates existing user roles to match new naming conventions
    - Users with 'core-team-member' role will be migrated to 'customer-user'
    - All role-based access control logic has been updated in application code

  4. Execution
    - Run this SQL script against your database after deploying code changes
    - Back up your database before running this migration
*/

BEGIN;

-- Update users table: member -> fde
UPDATE users
SET role = 'fde', updated_at = NOW()
WHERE role = 'member';

-- Update users table: analytics-user -> customer-user
UPDATE users
SET role = 'customer-user', updated_at = NOW()
WHERE role = 'analytics-user';

-- Update users table: core-team-member -> customer-user (role being removed)
UPDATE users
SET role = 'customer-user', updated_at = NOW()
WHERE role = 'core-team-member';

-- Update role_permissions table: member -> fde
UPDATE role_permissions
SET role = 'fde'
WHERE role = 'member';

-- Add new role_permissions entry for account-executive (copy of fde permissions)
INSERT INTO role_permissions (role, permission_id)
SELECT 'account-executive', permission_id
FROM role_permissions
WHERE role = 'fde'
ON CONFLICT (role, permission_id) DO NOTHING;

-- Update role_permissions table: analytics-user -> customer-user
UPDATE role_permissions
SET role = 'customer-user'
WHERE role = 'analytics-user';

-- Delete role_permissions for core-team-member (being removed)
DELETE FROM role_permissions
WHERE role = 'core-team-member';

COMMIT;

-- Verification queries (run after migration)
-- SELECT role, COUNT(*) as user_count FROM users GROUP BY role ORDER BY role;
-- SELECT role, COUNT(*) as permission_count FROM role_permissions GROUP BY role ORDER BY role;
