const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt");
const { validateOrgAccess } = require("../middleware/orgAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const bcrypt = require("bcrypt");

/**
 * Member Access Rules:
 * - super-admin & observer: Have access to ALL organizations (global access)
 * - member: Has access to their own org (org_id) + assigned orgs (assigned_workspace)
 * - customer-admin, core-team-member, analytics-user: Only their own org (org_id)
 *
 * When listing members for an org, we include:
 * 1. Users where org_id matches (primary organization)
 * 2. Users where org is in assigned_workspace array
 * 3. ALL super-admins and observers (they have global access)
 */

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
  jwtMiddleware,
  validateOrgAccess,
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
      // Include:
      // 1. Users with this org as primary (org_id = $1)
      // 2. Users with this org in assigned_workspace
      // 3. ALL super-admins and observers (they have access to all orgs)
      let query = `
        SELECT DISTINCT
          u.id,
          u.username,
          u.email,
          u.first_name,
          u.last_name,
          u.role,
          u.org_id as primary_org_id,
          u.assigned_workspace,
          u.is_active,
          u.created_at,
          u.last_login,
          CASE 
            WHEN u.org_id = $1 THEN 'primary'
            WHEN $1 = ANY(u.assigned_workspace) THEN 'assigned'
            WHEN u.role IN ('super-admin', 'observer') THEN 'global_access'
            ELSE 'unknown'
          END as access_type
        FROM users u
        WHERE 
          u.is_active = true
          AND (
            u.org_id = $1 
            OR $1 = ANY(u.assigned_workspace)
            OR u.role IN ('super-admin', 'observer')
          )
      `;

      const queryParams = [parseInt(org_id)];

      // Add role filtering for restricted visibility
      if (visibilityRule === "restricted") {
        query += ` AND u.role = ANY($2::varchar[])`;
        queryParams.push(RESTRICTED_VISIBLE_ROLES);
      }

      // Add ordering
      query += ` ORDER BY u.role, u.first_name, u.last_name, u.username`;

      // Execute query
      const result = await db.query(query, queryParams);

      // Transform the data for response
      const members = result.rows.map((member) => ({
        id: member.id,
        username: member.username,
        email: member.email,
        firstName: member.first_name || null,
        lastName: member.last_name || null,
        fullName:
          member.first_name || member.last_name
            ? `${member.first_name || ""} ${member.last_name || ""}`.trim()
            : null,
        role: member.role,
        accessType: member.access_type, // 'primary', 'assigned', or 'global_access'
        isActive: member.is_active,
        lastLogin: member.last_login,
        createdAt: member.created_at,
        isPrimaryOrg: member.primary_org_id === parseInt(org_id),
        hasMultipleOrgs:
          member.assigned_workspace && member.assigned_workspace.length > 0,
        hasGlobalAccess: member.access_type === "global_access", // Added for clarity
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
            assignedMembers: members.filter((m) => m.accessType === "assigned")
              .length,
            globalAccessMembers: members.filter(
              (m) => m.accessType === "global_access",
            ).length,
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
  jwtMiddleware,
  validateOrgAccess,
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
      // Include super-admins and observers who have global access
      const query = `
        SELECT 
          u.id,
          u.username,
          u.email,
          u.first_name,
          u.last_name,
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
            WHEN u.role IN ('super-admin', 'observer') THEN 'global_access'
            ELSE 'no_access'
          END as access_type
        FROM users u
        LEFT JOIN organisations o ON u.org_id = o.org_id
        WHERE 
          u.id = $2
          AND (
            u.org_id = $1 
            OR $1 = ANY(u.assigned_workspace)
            OR u.role IN ('super-admin', 'observer')
          )
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
        firstName: member.first_name || null,
        lastName: member.last_name || null,
        fullName:
          member.first_name || member.last_name
            ? `${member.first_name || ""} ${member.last_name || ""}`.trim()
            : null,
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
  jwtMiddleware,
  validateOrgAccess,
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { email, username, firstName, lastName, role } = req.body;
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
        // Customer admins can only add these specific roles
        const allowedRoles = [
          "customer-admin",
          "core-team-member",
          "analytics-user",
        ];
        if (!allowedRoles.includes(role)) {
          return res.status(403).json({
            success: false,
            error:
              "You can only add members with customer-admin, core-team-member, or analytics-user roles",
          });
        }
      }

      // Validate required fields
      if (!email || !username || !firstName || !role) {
        return res.status(400).json({
          success: false,
          error:
            "Missing required fields: email, username, firstName, and role are required",
        });
      }

      // Check if user already exists
      const existingUserCheck = await db.query(
        "SELECT id, email, org_id, role, assigned_workspace FROM users WHERE email = $1",
        [email],
      );

      if (existingUserCheck.rows.length > 0) {
        const existingUser = existingUserCheck.rows[0];

        // Only allow adding to assigned_workspace if the existing user role is "member"
        if (existingUser.role === "member") {
          // Check if org is already in assigned_workspace
          const alreadyAssigned =
            existingUser.assigned_workspace &&
            existingUser.assigned_workspace.includes(parseInt(org_id));

          if (alreadyAssigned) {
            return res.status(400).json({
              success: false,
              error: "User already has access to this organization",
            });
          }

          // Add org to assigned_workspace
          await db.query(
            `UPDATE users 
             SET assigned_workspace = array_append(
               COALESCE(assigned_workspace, ARRAY[]::integer[]), 
               $1
             ),
             updated_at = NOW()
             WHERE id = $2`,
            [parseInt(org_id), existingUser.id],
          );

          logger.info(
            "Added organization to existing member's assigned workspaces",
            {
              userId: existingUser.id,
              orgId: org_id,
            },
          );

          return res.json({
            success: true,
            message:
              "Organization added to existing member's assigned workspaces",
            data: {
              userId: existingUser.id,
              email: existingUser.email,
              role: existingUser.role,
              assignedToOrg: parseInt(org_id),
            },
          });
        } else {
          return res.status(400).json({
            success: false,
            error: `User already exists with role: ${existingUser.role}. Cannot add to this organization.`,
          });
        }
      }

      // Generate random password for new user
      const generatePassword = () => {
        const length = 12;
        const charset =
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let password = "";
        for (let i = 0; i < length; i++) {
          password += charset.charAt(
            Math.floor(Math.random() * charset.length),
          );
        }
        return password;
      };

      const generatedPassword = generatePassword();
      const passwordHash = await bcrypt.hash(generatedPassword, 10);

      // Get organization name for email
      const orgResult = await db.query(
        "SELECT name FROM organisations WHERE org_id = $1",
        [parseInt(org_id)],
      );
      const orgName = orgResult.rows[0]?.name || "MyFlowAI";

      // Insert new user
      const insertQuery = `
        INSERT INTO users (
          username, email, first_name, last_name, password_hash, role, org_id, 
          is_active, force_password_reset, created_at, updated_at  
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, NOW(), NOW())  
        RETURNING id, username, email, first_name, last_name, role, org_id
      `;

      const insertResult = await db.query(insertQuery, [
        username,
        email,
        firstName,
        lastName || null,
        passwordHash,
        role,
        parseInt(org_id),
      ]);

      const newMember = insertResult.rows[0];

      // Send welcome email with credentials
      try {
        const { Resend } = require("resend");
        const resend = new Resend("re_DXtS219b_C9LEPwDvBsy2ZMmEKZGh8yYx");

        const emailHtml = `
<!doctype html>
<html>
  <head>
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width">
    <meta charset="utf-8">
    <title>Welcome to MyFlowAI</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);padding:30px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:600;">Welcome to MyFlowAI</h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 10px 0;color:#1a202c;font-size:20px;">Hi ${firstName},</h2>
                <p style="margin:0 0 20px 0;color:#4a5568;line-height:1.6;">
                  You have been added as a <strong>${role}</strong> to the <strong>${orgName}</strong> organization on MyFlowAI.
                </p>

                <!-- Credentials Box -->
                <div style="background:#f7fafc;border:2px solid #e2e8f0;border-radius:8px;padding:20px;margin:30px 0;">
                  <h3 style="margin:0 0 15px 0;color:#2d3748;font-size:16px;">Your Login Credentials</h3>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="padding:8px 0;color:#4a5568;">
                        <strong>Email:</strong>
                      </td>
                      <td style="padding:8px 0;color:#2d3748;font-family:monospace;">
                        ${email}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;color:#4a5568;">
                        <strong>Username:</strong>
                      </td>
                      <td style="padding:8px 0;color:#2d3748;font-family:monospace;">
                        ${username}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;color:#4a5568;">
                        <strong>Temporary Password:</strong>
                      </td>
                      <td style="padding:8px 0;color:#2d3748;font-family:monospace;background:#fff;padding:8px;border-radius:4px;">
                        ${generatedPassword}
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Login Button -->
                <div style="text-align:center;margin:30px 0;">
                  <a href="https://dev.myflowai.com/login" 
                     style="display:inline-block;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:16px;">
                    Login to MyFlowAI
                  </a>
                </div>

                <!-- Security Notice -->
                <div style="background:#fef5e7;border-left:4px solid #f39c12;padding:15px;margin:30px 0;border-radius:4px;">
                  <p style="margin:0;color:#856404;font-size:14px;">
                    <strong>Security Notice:</strong> Please change your password after your first login. 
                    Keep your credentials secure and do not share them with anyone.
                  </p>
                </div>

                <!-- Next Steps -->
                <div style="margin:30px 0;">
                  <h3 style="margin:0 0 10px 0;color:#2d3748;font-size:16px;">Next Steps:</h3>
                  <ol style="margin:10px 0;padding-left:20px;color:#4a5568;line-height:1.8;">
                    <li>Click the login button above or visit <a href="https://dev.myflowai.com/login" style="color:#667eea;">https://dev.myflowai.com/login</a></li>
                    <li>Enter your email and temporary password</li>
                    <li>Change your password when prompted</li>
                    <li>Start exploring your dashboard and features</li>
                  </ol>
                </div>

                <!-- Support -->
                <p style="margin:20px 0 0 0;color:#718096;font-size:14px;line-height:1.6;">
                  If you have any questions or need assistance, please don't hesitate to contact our support team at 
                  <a href="mailto:support@myflowai.com" style="color:#667eea;">support@myflowai.com</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f7fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#718096;font-size:12px;">
                  © 2025 MyFlowAI. All rights reserved.<br>
                  This is an automated message, please do not reply to this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

        await resend.emails.send({
          from: "MyFlowAI <no-reply@myflowai.com>",
          to: email,
          subject: `Welcome to MyFlowAI - Your Account Has Been Created`,
          html: emailHtml,
        });

        logger.info("Welcome email sent successfully", {
          to: email,
          memberId: newMember.id,
        });
      } catch (emailError) {
        logger.error("Failed to send welcome email", {
          error: emailError.message,
          to: email,
          memberId: newMember.id,
        });
        // Don't fail the request if email fails - user is still created
      }

      logger.info("New member added successfully", {
        orgId: org_id,
        memberId: newMember.id,
        email: newMember.email,
        role: newMember.role,
        addedBy: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message:
          "Member added successfully. Welcome email has been sent with login credentials.",
        data: {
          id: newMember.id,
          username: newMember.username,
          email: newMember.email,
          firstName: newMember.first_name,
          lastName: newMember.last_name || null,
          role: newMember.role,
          orgId: newMember.org_id,
        },
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
 * @route PUT /api/v1/members/:org_id/member/:member_id/profile
 * @desc Update member profile information (name, username)
 * @access Private - requires JWT, org access, and appropriate permissions
 */
router.put(
  "/:org_id/member/:member_id/profile",
  jwtMiddleware,
  validateOrgAccess,
  async (req, res) => {
    try {
      const { org_id, member_id } = req.params;
      const { firstName, lastName, username } = req.body;
      const requestingUserRole = req.user.role;

      logger.info("Updating member profile", {
        orgId: org_id,
        memberId: member_id,
        requestedBy: req.user.userId,
      });

      // Check permissions - user can update their own profile, or admins can update others
      const canUpdateProfile =
        parseInt(member_id) === req.user.userId ||
        ["super-admin", "customer-admin"].includes(requestingUserRole);

      if (!canUpdateProfile) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to update this member's profile",
        });
      }

      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (firstName !== undefined) {
        updateFields.push(`first_name = ${paramIndex}`);
        values.push(firstName);
        paramIndex++;
      }

      if (lastName !== undefined) {
        updateFields.push(`last_name = ${paramIndex}`);
        values.push(lastName);
        paramIndex++;
      }

      if (username !== undefined) {
        updateFields.push(`username = ${paramIndex}`);
        values.push(username);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updateFields.push("updated_at = NOW()");
      values.push(parseInt(member_id));
      values.push(parseInt(org_id));

      // Update the member profile
      const updateQuery = `
        UPDATE users 
        SET ${updateFields.join(", ")}
        WHERE id = ${paramIndex} 
        AND (
          org_id = ${paramIndex + 1} 
          OR ${paramIndex + 1} = ANY(assigned_workspace)
          OR role IN ('super-admin', 'observer')
        )
        RETURNING id, username, email, first_name, last_name, role
      `;

      const updateResult = await db.query(updateQuery, values);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Member not found or does not belong to this organization",
        });
      }

      const updatedMember = updateResult.rows[0];

      logger.info("Member profile updated successfully", {
        orgId: org_id,
        memberId: member_id,
        updatedBy: req.user.userId,
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          id: updatedMember.id,
          username: updatedMember.username,
          email: updatedMember.email,
          firstName: updatedMember.first_name || null,
          lastName: updatedMember.last_name || null,
          fullName:
            updatedMember.first_name || updatedMember.last_name
              ? `${updatedMember.first_name || ""} ${updatedMember.last_name || ""}`.trim()
              : null,
          role: updatedMember.role,
        },
      });
    } catch (error) {
      logger.error("Error updating member profile", {
        error: error.message,
        orgId: req.params.org_id,
        memberId: req.params.member_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to update member profile",
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
  jwtMiddleware,
  validateOrgAccess,
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
      // Include super-admins and observers in the update query
      const updateQuery = `
        UPDATE users 
        SET role = $1, updated_at = NOW()
        WHERE id = $2 
        AND (
          org_id = $3 
          OR $3 = ANY(assigned_workspace)
          OR role IN ('super-admin', 'observer')
        )
        RETURNING id, username, email, first_name, last_name, role
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

      const updatedMember = updateResult.rows[0];

      res.json({
        success: true,
        message: "Role updated successfully",
        data: {
          id: updatedMember.id,
          username: updatedMember.username,
          email: updatedMember.email,
          firstName: updatedMember.first_name || null,
          lastName: updatedMember.last_name || null,
          role: updatedMember.role,
        },
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
  jwtMiddleware,
  validateOrgAccess,
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
        `SELECT id, org_id, assigned_workspace, role 
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

      // Handle super-admin and observer special cases
      if (member.role === "super-admin" || member.role === "observer") {
        if (member.org_id !== parseInt(org_id)) {
          return res.status(400).json({
            success: false,
            error: `Cannot remove ${member.role} from organization - they have global access to all organizations. Change their role or deactivate their account instead.`,
          });
        }
        // If it IS their primary org, proceed to deactivate below
      }

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

/**
 * @route PUT /api/v1/members/:org_id/member/:member_id/reactivate
 * @desc Reactivate a deactivated member
 * @access Private - requires JWT, org access, and appropriate permissions
 */
router.put(
  "/:org_id/member/:member_id/reactivate",
  jwtMiddleware,
  validateOrgAccess,
  async (req, res) => {
    try {
      const { org_id, member_id } = req.params;
      const requestingUserRole = req.user.role;

      logger.info("Reactivating member", {
        orgId: org_id,
        memberId: member_id,
        requestedBy: req.user.userId,
      });

      // Check permissions
      const canReactivateMembers = ["super-admin", "customer-admin"].includes(
        requestingUserRole,
      );
      if (!canReactivateMembers) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to reactivate members",
        });
      }

      // Check if member exists and belongs to this org
      const memberCheck = await db.query(
        `SELECT id, org_id, is_active 
         FROM users 
         WHERE id = $1 AND org_id = $2`,
        [parseInt(member_id), parseInt(org_id)],
      );

      if (memberCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Member not found in this organization",
        });
      }

      const member = memberCheck.rows[0];

      if (member.is_active) {
        return res.status(400).json({
          success: false,
          error: "Member is already active",
        });
      }

      // Reactivate the member
      await db.query(
        `UPDATE users 
         SET is_active = true, updated_at = NOW()
         WHERE id = $1`,
        [parseInt(member_id)],
      );

      logger.info("Member reactivated successfully", {
        orgId: org_id,
        memberId: member_id,
        reactivatedBy: req.user.userId,
      });

      res.json({
        success: true,
        message: "Member has been reactivated",
      });
    } catch (error) {
      logger.error("Error reactivating member", {
        error: error.message,
        orgId: req.params.org_id,
        memberId: req.params.member_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to reactivate member",
        message: error.message,
      });
    }
  },
);

/**
 * @route POST /api/v1/members/:org_id/assign-workspaces
 * @desc Bulk assign workspaces to a member
 * @access Private - requires JWT, org access, and super-admin role
 */
router.post(
  "/:org_id/assign-workspaces",
  jwtMiddleware,
  validateOrgAccess,
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { member_id, workspace_ids } = req.body;
      const requestingUserRole = req.user.role;

      logger.info("Assigning workspaces to member", {
        orgId: org_id,
        memberId: member_id,
        workspaceIds: workspace_ids,
        requestedBy: req.user.userId,
      });

      // Only super-admin can bulk assign workspaces
      if (requestingUserRole !== "super-admin") {
        return res.status(403).json({
          success: false,
          error: "Only super-admin can assign multiple workspaces",
        });
      }

      if (!Array.isArray(workspace_ids) || workspace_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: "workspace_ids must be a non-empty array",
        });
      }

      // Check if the member is super-admin or observer
      const memberCheck = await db.query(
        "SELECT role FROM users WHERE id = $1",
        [parseInt(member_id)],
      );

      if (memberCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Member not found",
        });
      }

      const memberRole = memberCheck.rows[0].role;
      if (memberRole === "super-admin" || memberRole === "observer") {
        return res.status(400).json({
          success: false,
          error: `Cannot assign workspaces to ${memberRole} - they already have global access to all organizations`,
        });
      }

      // Update member's assigned_workspace array
      await db.query(
        `UPDATE users 
         SET assigned_workspace = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [workspace_ids, parseInt(member_id)],
      );

      logger.info("Workspaces assigned successfully", {
        memberId: member_id,
        workspaceCount: workspace_ids.length,
        assignedBy: req.user.userId,
      });

      res.json({
        success: true,
        message: `Successfully assigned ${workspace_ids.length} workspace(s) to member`,
        data: {
          member_id: parseInt(member_id),
          assigned_workspaces: workspace_ids,
        },
      });
    } catch (error) {
      logger.error("Error assigning workspaces", {
        error: error.message,
        orgId: req.params.org_id,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to assign workspaces",
        message: error.message,
      });
    }
  },
);

module.exports = router;
