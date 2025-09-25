const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const userAuthMiddleware = require("../middleware/userAuth");
const createOrgAccessMiddleware = require("../middleware/orgAccess");

// Role visibility rules
const ROLE_VISIBILITY_RULES = {
  "super-admin": "all",
  observer: "all",
  member: "all",
  "customer-admin": "restricted",
  "core-team-member": "restricted",
  "analytics-user": "restricted",
};

// Restricted roles can only see these roles
const RESTRICTED_VISIBLE_ROLES = [
  "customer-admin",
  "core-team-member",
  "analytics-user",
];

/**
 * @route GET /api/v1/members/:org_id/list
 * @desc Get list of members for an organization
 * @access Private - requires JWT and org access
 */
router.get(
  "/:org_id/list",
  userAuthMiddleware, // Verify JWT token
  createOrgAccessMiddleware({ requireOrgId: true }), // Verify org access
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const requestingUserRole = req.user.role;

      logger.info("Fetching members list", {
        orgId: org_id,
        requestedBy: req.user.userId,
        requestingRole: requestingUserRole,
      });

      // Determine visibility rule based on requesting user's role
      const visibilityRule =
        ROLE_VISIBILITY_RULES[requestingUserRole] || "restricted";

      // Build the base query
      let query = `
        SELECT DISTINCT
          u.id,
          u.username,
          u.email,
          u.role,
          u.org_id as primary_org_id,
          u.assigned_workspace,
          u.is_active,
          u.created_at,
          u.last_login,
          CASE 
            WHEN u.org_id = $1 THEN 'primary'
            WHEN $1 = ANY(u.assigned_workspace) THEN 'assigned'
            ELSE 'unknown'
          END as access_type
        FROM users u
        WHERE 
          u.is_active = true
          AND (
            u.org_id = $1 
            OR $1 = ANY(u.assigned_workspace)
          )
      `;

      const queryParams = [parseInt(org_id)];

      // Add role filtering for restricted visibility
      if (visibilityRule === "restricted") {
        query += ` AND u.role = ANY($2::varchar[])`;
        queryParams.push(RESTRICTED_VISIBLE_ROLES);
      }

      // Add ordering
      query += ` ORDER BY u.role, u.username`;

      // Execute query
      const result = await db.query(query, queryParams);

      // Transform the data for response
      const members = result.rows.map((member) => ({
        id: member.id,
        username: member.username,
        email: member.email,
        role: member.role,
        accessType: member.access_type,
        isActive: member.is_active,
        lastLogin: member.last_login,
        createdAt: member.created_at,
        isPrimaryOrg: member.primary_org_id === parseInt(org_id),
        hasMultipleOrgs:
          member.assigned_workspace && member.assigned_workspace.length > 0,
      }));

      // Group members by role for better organization
      const membersByRole = {};
      members.forEach((member) => {
        if (!membersByRole[member.role]) {
          membersByRole[member.role] = [];
        }
        membersByRole[member.role].push(member);
      });

      logger.info("Members list fetched successfully", {
        orgId: org_id,
        totalMembers: members.length,
        visibilityRule: visibilityRule,
        requestedBy: req.user.userId,
      });

      res.json({
        success: true,
        data: {
          orgId: parseInt(org_id),
          totalMembers: members.length,
          visibilityRule: visibilityRule,
          members: members,
          membersByRole: membersByRole,
          summary: {
            totalActive: members.filter((m) => m.isActive).length,
            byRole: Object.keys(membersByRole).reduce((acc, role) => {
              acc[role] = membersByRole[role].length;
              return acc;
            }, {}),
            primaryOrgMembers: members.filter((m) => m.isPrimaryOrg).length,
            assignedMembers: members.filter((m) => !m.isPrimaryOrg).length,
          },
        },
      });
    } catch (error) {
      logger.error("Error fetching members list", {
        error: error.message,
        orgId: req.params.org_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to fetch members list",
        message: error.message,
      });
    }
  },
);

/**
 * @route GET /api/v1/members/:org_id/member/:member_id
 * @desc Get detailed information about a specific member
 * @access Private - requires JWT and org access
 */
router.get(
  "/:org_id/member/:member_id",
  userAuthMiddleware,
  createOrgAccessMiddleware({ requireOrgId: true }),
  async (req, res) => {
    try {
      const { org_id, member_id } = req.params;
      const requestingUserRole = req.user.role;

      logger.info("Fetching member details", {
        orgId: org_id,
        memberId: member_id,
        requestedBy: req.user.userId,
      });

      // Build query to get member details
      const query = `
        SELECT 
          u.id,
          u.username,
          u.email,
          u.role,
          u.org_id as primary_org_id,
          u.assigned_workspace,
          u.is_active,
          u.created_at,
          u.updated_at,
          u.last_login,
          o.name as primary_org_name,
          CASE 
            WHEN u.org_id = $1 THEN 'primary'
            WHEN $1 = ANY(u.assigned_workspace) THEN 'assigned'
            ELSE 'no_access'
          END as access_type
        FROM users u
        LEFT JOIN organisations o ON u.org_id = o.org_id
        WHERE 
          u.id = $2
          AND (u.org_id = $1 OR $1 = ANY(u.assigned_workspace))
      `;

      const result = await db.query(query, [
        parseInt(org_id),
        parseInt(member_id),
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error:
            "Member not found or does not have access to this organization",
        });
      }

      const member = result.rows[0];

      // Apply visibility rules
      const visibilityRule =
        ROLE_VISIBILITY_RULES[requestingUserRole] || "restricted";
      if (
        visibilityRule === "restricted" &&
        !RESTRICTED_VISIBLE_ROLES.includes(member.role)
      ) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to view this member",
        });
      }

      // Get permissions for the member's role
      const permissionsResult = await db.query(
        `SELECT p.name, p.description 
         FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [member.role],
      );

      // Get all organizations this member has access to
      let memberOrganizations = [];
      if (member.assigned_workspace && member.assigned_workspace.length > 0) {
        const orgsQuery = `
          SELECT org_id, name, created_at
          FROM organisations 
          WHERE org_id = ANY($1)
          ORDER BY name
        `;
        const allOrgIds = [member.primary_org_id, ...member.assigned_workspace];
        const orgsResult = await db.query(orgsQuery, [allOrgIds]);
        memberOrganizations = orgsResult.rows;
      } else {
        // Just get primary org
        const orgsQuery = `
          SELECT org_id, name, created_at
          FROM organisations 
          WHERE org_id = $1
        `;
        const orgsResult = await db.query(orgsQuery, [member.primary_org_id]);
        memberOrganizations = orgsResult.rows;
      }

      const memberDetails = {
        id: member.id,
        username: member.username,
        email: member.email,
        role: member.role,
        accessType: member.access_type,
        isActive: member.is_active,
        primaryOrg: {
          id: member.primary_org_id,
          name: member.primary_org_name,
        },
        organizations: memberOrganizations,
        permissions: permissionsResult.rows,
        timestamps: {
          createdAt: member.created_at,
          updatedAt: member.updated_at,
          lastLogin: member.last_login,
        },
      };

      logger.info("Member details fetched successfully", {
        orgId: org_id,
        memberId: member_id,
        requestedBy: req.user.userId,
      });

      res.json({
        success: true,
        data: memberDetails,
      });
    } catch (error) {
      logger.error("Error fetching member details", {
        error: error.message,
        orgId: req.params.org_id,
        memberId: req.params.member_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to fetch member details",
        message: error.message,
      });
    }
  },
);

/**
 * @route POST /api/v1/members/:org_id/add
 * @desc Add a new member to the organization
 * @access Private - requires JWT, org access, and appropriate permissions
 */
router.post(
  "/:org_id/add",
  userAuthMiddleware,
  createOrgAccessMiddleware({ requireOrgId: true }),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { email, username, role, password, assignAsSecondary } = req.body;
      const requestingUserRole = req.user.role;

      logger.info("Adding new member", {
        orgId: org_id,
        email: email,
        role: role,
        requestedBy: req.user.userId,
      });

      // Check if requesting user can add members
      const canAddMembers = ["super-admin", "customer-admin"].includes(
        requestingUserRole,
      );
      if (!canAddMembers) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to add members",
        });
      }

      // Validate role assignment permissions
      if (requestingUserRole === "customer-admin") {
        // Customer admins can only add restricted roles
        if (!RESTRICTED_VISIBLE_ROLES.includes(role)) {
          return res.status(403).json({
            success: false,
            error:
              "You can only add members with customer-admin, core-team-member, or analytics-user roles",
          });
        }
      }

      // Check if user already exists
      const existingUserCheck = await db.query(
        "SELECT id, email, org_id FROM users WHERE email = $1",
        [email],
      );

      if (existingUserCheck.rows.length > 0) {
        const existingUser = existingUserCheck.rows[0];

        // If assignAsSecondary is true, add org to assigned_workspace
        if (assignAsSecondary) {
          await db.query(
            `UPDATE users 
             SET assigned_workspace = array_append(
               COALESCE(assigned_workspace, ARRAY[]::integer[]), 
               $1
             )
             WHERE id = $2 AND NOT ($1 = ANY(COALESCE(assigned_workspace, ARRAY[]::integer[])))`,
            [parseInt(org_id), existingUser.id],
          );

          logger.info(
            "Added organization to existing user assigned workspaces",
            {
              userId: existingUser.id,
              orgId: org_id,
            },
          );

          return res.json({
            success: true,
            message:
              "Organization added to existing user's assigned workspaces",
            data: {
              userId: existingUser.id,
              email: existingUser.email,
              assignedToOrg: parseInt(org_id),
            },
          });
        } else {
          return res.status(400).json({
            success: false,
            error: "User with this email already exists",
          });
        }
      }

      // Hash password
      const bcrypt = require("bcrypt");
      const passwordHash = await bcrypt.hash(password, 10);

      // Insert new user
      const insertQuery = `
        INSERT INTO users (
          username, email, password_hash, role, org_id, 
          is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        RETURNING id, username, email, role, org_id
      `;

      const insertResult = await db.query(insertQuery, [
        username,
        email,
        passwordHash,
        role,
        parseInt(org_id),
      ]);

      const newMember = insertResult.rows[0];

      logger.info("New member added successfully", {
        orgId: org_id,
        memberId: newMember.id,
        email: newMember.email,
        role: newMember.role,
        addedBy: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message: "Member added successfully",
        data: newMember,
      });
    } catch (error) {
      logger.error("Error adding member", {
        error: error.message,
        orgId: req.params.org_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to add member",
        message: error.message,
      });
    }
  },
);

/**
 * @route PUT /api/v1/members/:org_id/member/:member_id/role
 * @desc Update member role
 * @access Private - requires JWT, org access, and appropriate permissions
 */
router.put(
  "/:org_id/member/:member_id/role",
  userAuthMiddleware,
  createOrgAccessMiddleware({ requireOrgId: true }),
  async (req, res) => {
    try {
      const { org_id, member_id } = req.params;
      const { newRole } = req.body;
      const requestingUserRole = req.user.role;

      logger.info("Updating member role", {
        orgId: org_id,
        memberId: member_id,
        newRole: newRole,
        requestedBy: req.user.userId,
      });

      // Check permissions
      const canUpdateRoles = ["super-admin", "customer-admin"].includes(
        requestingUserRole,
      );
      if (!canUpdateRoles) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to update member roles",
        });
      }

      // Validate role assignment permissions for customer-admin
      if (requestingUserRole === "customer-admin") {
        if (!RESTRICTED_VISIBLE_ROLES.includes(newRole)) {
          return res.status(403).json({
            success: false,
            error:
              "You can only assign customer-admin, core-team-member, or analytics-user roles",
          });
        }
      }

      // Prevent self role change for non-super-admins
      if (
        parseInt(member_id) === req.user.userId &&
        requestingUserRole !== "super-admin"
      ) {
        return res.status(403).json({
          success: false,
          error: "You cannot change your own role",
        });
      }

      // Update the role
      const updateQuery = `
        UPDATE users 
        SET role = $1, updated_at = NOW()
        WHERE id = $2 
        AND (org_id = $3 OR $3 = ANY(assigned_workspace))
        RETURNING id, username, email, role
      `;

      const updateResult = await db.query(updateQuery, [
        newRole,
        parseInt(member_id),
        parseInt(org_id),
      ]);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Member not found or does not belong to this organization",
        });
      }

      logger.info("Member role updated successfully", {
        orgId: org_id,
        memberId: member_id,
        newRole: newRole,
        updatedBy: req.user.userId,
      });

      res.json({
        success: true,
        message: "Role updated successfully",
        data: updateResult.rows[0],
      });
    } catch (error) {
      logger.error("Error updating member role", {
        error: error.message,
        orgId: req.params.org_id,
        memberId: req.params.member_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to update member role",
        message: error.message,
      });
    }
  },
);

/**
 * @route DELETE /api/v1/members/:org_id/member/:member_id
 * @desc Remove member from organization (deactivate or remove from assigned)
 * @access Private - requires JWT, org access, and appropriate permissions
 */
router.delete(
  "/:org_id/member/:member_id",
  userAuthMiddleware,
  createOrgAccessMiddleware({ requireOrgId: true }),
  async (req, res) => {
    try {
      const { org_id, member_id } = req.params;
      const requestingUserRole = req.user.role;

      logger.info("Removing member", {
        orgId: org_id,
        memberId: member_id,
        requestedBy: req.user.userId,
      });

      // Check permissions
      const canRemoveMembers = ["super-admin", "customer-admin"].includes(
        requestingUserRole,
      );
      if (!canRemoveMembers) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to remove members",
        });
      }

      // Prevent self-removal
      if (parseInt(member_id) === req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "You cannot remove yourself",
        });
      }

      // Check if this is primary org or assigned workspace
      const memberCheck = await db.query(
        `SELECT id, org_id, assigned_workspace 
         FROM users 
         WHERE id = $1`,
        [parseInt(member_id)],
      );

      if (memberCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Member not found",
        });
      }

      const member = memberCheck.rows[0];

      if (member.org_id === parseInt(org_id)) {
        // This is their primary org - deactivate the account
        await db.query(
          `UPDATE users 
           SET is_active = false, updated_at = NOW()
           WHERE id = $1`,
          [parseInt(member_id)],
        );

        logger.info("Member deactivated from primary organization", {
          orgId: org_id,
          memberId: member_id,
          deactivatedBy: req.user.userId,
        });

        res.json({
          success: true,
          message: "Member has been deactivated",
          action: "deactivated",
        });
      } else if (
        member.assigned_workspace &&
        member.assigned_workspace.includes(parseInt(org_id))
      ) {
        // Remove from assigned workspace
        await db.query(
          `UPDATE users 
           SET assigned_workspace = array_remove(assigned_workspace, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [parseInt(org_id), parseInt(member_id)],
        );

        logger.info("Member removed from assigned organization", {
          orgId: org_id,
          memberId: member_id,
          removedBy: req.user.userId,
        });

        res.json({
          success: true,
          message: "Member has been removed from this organization",
          action: "removed_from_assigned",
        });
      } else {
        return res.status(400).json({
          success: false,
          error: "Member does not belong to this organization",
        });
      }
    } catch (error) {
      logger.error("Error removing member", {
        error: error.message,
        orgId: req.params.org_id,
        memberId: req.params.member_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to remove member",
        message: error.message,
      });
    }
  },
);

module.exports = router;
