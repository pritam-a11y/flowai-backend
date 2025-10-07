# Role Migration Guide

## Overview
This document describes the role name changes implemented in the system.

## Role Changes Summary

| Old Role Name | New Role Name | Access Level | Notes |
|--------------|---------------|--------------|-------|
| `member` | `fde` | own_and_assigned | Renamed to Field Deployment Engineer |
| N/A | `account-executive` | own_and_assigned | New role, same permissions as fde |
| `analytics-user` | `customer-user` | own | Renamed for clarity |
| `core-team-member` | **REMOVED** | N/A | Migrated to customer-user |
| `super-admin` | `super-admin` | all | No change |
| `observer` | `observer` | all | No change |
| `customer-admin` | `customer-admin` | own | No change |

## Access Levels Explained

- **all**: Access to all organizations in the system
- **own_and_assigned**: Access to their primary org + assigned organizations
- **own**: Access only to their primary organization

## Feature Permissions by Role

### Launchpad (Configuration Management)
- **super-admin**: Read + Write
- **observer**: Read only
- **fde**: Read + Write
- **account-executive**: Read + Write
- **customer-admin**: Read + Write
- **customer-user**: No access

### Knowledge Base
- **super-admin**: Read + Write + Delete
- **observer**: Read only
- **fde**: Read + Write + Delete
- **account-executive**: Read + Write + Delete
- **customer-admin**: Read + Write + Delete
- **customer-user**: No access

### Agents
- **super-admin**: Read + Write + Delete
- **observer**: Read only
- **fde**: Read + Write
- **account-executive**: Read + Write
- **customer-admin**: Read + Write
- **customer-user**: No access

### Reports
- **super-admin**: Read + Write + Export
- **observer**: Read + Export
- **fde**: Read only
- **account-executive**: Read only
- **customer-admin**: Read + Export
- **customer-user**: Read + Export

## Files Modified

### Constants
- `constants/roles.js` - Updated WORKSPACE_ACCESS_RULES and FEATURE_PERMISSIONS

### Services
- `services/userAuthService.js` - Updated role mappings (2 occurrences)

### Routes
- `routes/auth.js` - Updated role access rules
- `routes/members.js` - Updated role visibility and constraints

## Database Migration

### Migration File
- `migrations/update_role_names.sql`

### What the Migration Does
1. Updates all users with role `member` to `fde`
2. Updates all users with role `analytics-user` to `customer-user`
3. Updates all users with role `core-team-member` to `customer-user`
4. Updates role_permissions table to reflect new role names
5. Adds permissions for new `account-executive` role (copied from fde)
6. Removes permissions for deleted `core-team-member` role

### How to Run the Migration

**IMPORTANT: Back up your database before running this migration!**

```bash
# Using psql
psql -h your-host -U your-user -d your-database -f migrations/update_role_names.sql

# Or execute via Supabase dashboard
# Copy and paste the SQL from migrations/update_role_names.sql
```

### Verification Queries

After running the migration, verify the changes:

```sql
-- Check user role distribution
SELECT role, COUNT(*) as user_count
FROM users
GROUP BY role
ORDER BY role;

-- Check role permissions
SELECT role, COUNT(*) as permission_count
FROM role_permissions
GROUP BY role
ORDER BY role;
```

## Rollback Plan

If you need to rollback these changes:

1. **Code Rollback**: Revert the code changes in the files listed above
2. **Database Rollback**: Run the reverse migration (create if needed)

**Note**: Rollback is complex because `core-team-member` role was removed. Users migrated from `core-team-member` to `customer-user` would need manual review to determine correct role assignment.

## Testing Checklist

After deployment:

- [ ] Login works for all role types
- [ ] Super-admin can access all organizations
- [ ] Observer can view but not edit
- [ ] FDE and account-executive can access assigned organizations
- [ ] Customer-admin can manage their organization
- [ ] Customer-user has appropriate read-only access
- [ ] Role permissions are enforced correctly for each feature
- [ ] Member management works (add/edit/remove)

## Support

If you encounter issues after migration:
1. Check application logs for role-related errors
2. Verify database migration completed successfully
3. Ensure all users have valid role values
4. Contact the development team if issues persist
