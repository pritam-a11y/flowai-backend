const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const JWT_CONFIG = require("../config/jwt");
const db = require("../db/connection");
const logger = require("../utils/logger");

class UserAuthService {
  constructor() {
    // Constructor
  }

  // Add this new method to the UserAuthService class in services/userAuthService.js

  /**
   * Validate user is still active and get fresh data with role-based access logic
   * Handles super-admin and observer cases where they might not have user records for all orgs
   * @param {object} decodedToken - Decoded JWT payload
   * @returns {Promise<object>} - Fresh user data
   */
  async validateAndRefreshUserWithRoles(decodedToken) {
    try {
      logger.info("Validating user with role-based access", {
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role,
        orgId: decodedToken.orgId,
      });

      // Define workspace access rules
      const WORKSPACE_ACCESS_RULES = {
        "super-admin": "all",
        observer: "all",
        member: "own_and_assigned",
        "customer-admin": "own",
        "core-team-member": "own",
        "analytics-user": "own",
      };

      const accessType = WORKSPACE_ACCESS_RULES[decodedToken.role] || "own";

      // First, verify the user exists in their original org
      const userResult = await db.query(
        `SELECT u.id, u.username, u.email, u.role, u.is_active,
                u.org_id, u.assigned_workspace
         FROM users u
         WHERE u.id = $1`,
        [decodedToken.userId],
      );

      if (userResult.rows.length === 0) {
        throw new Error("User not found");
      }

      const originalUser = userResult.rows[0];

      // Check if user is active
      if (!originalUser.is_active) {
        throw new Error("User account is deactivated");
      }

      // Verify the organisation exists
      const orgResult = await db.query(
        `SELECT org_id, name, api_key, retell_workspace_id 
         FROM organisations 
         WHERE org_id = $1`,
        [decodedToken.orgId],
      );

      if (orgResult.rows.length === 0) {
        throw new Error("Organisation not found");
      }

      const targetOrg = orgResult.rows[0];
      let hasAccess = false;
      let userDataForOrg = null;

      // Check access based on role
      if (accessType === "all") {
        // Super-admin and observer can access any org
        hasAccess = true;

        // Check if they have a specific user record for this org
        const userOrgResult = await db.query(
          `SELECT u.id, u.username, u.email, u.role, u.is_active
           FROM users u
           WHERE u.email = $1 AND u.org_id = $2`,
          [decodedToken.email, decodedToken.orgId],
        );

        if (userOrgResult.rows.length > 0 && userOrgResult.rows[0].is_active) {
          // Use the org-specific user record
          userDataForOrg = userOrgResult.rows[0];
        } else {
          // Use original user data but maintain super-admin/observer role
          userDataForOrg = {
            id: originalUser.id,
            username: originalUser.username,
            email: originalUser.email,
            role: originalUser.role, // Keep original role (super-admin/observer)
            is_active: originalUser.is_active,
          };
        }
      } else if (accessType === "own") {
        // User can only access their own org
        if (originalUser.org_id === decodedToken.orgId) {
          hasAccess = true;
          userDataForOrg = originalUser;
        }
      } else if (accessType === "own_and_assigned") {
        // Check if it's their own org or in assigned workspaces
        if (originalUser.org_id === decodedToken.orgId) {
          hasAccess = true;
          userDataForOrg = originalUser;
        } else if (
          originalUser.assigned_workspace &&
          Array.isArray(originalUser.assigned_workspace) &&
          originalUser.assigned_workspace.includes(decodedToken.orgId)
        ) {
          hasAccess = true;

          // Check if they have a user record for this assigned org
          const assignedOrgUserResult = await db.query(
            `SELECT u.id, u.username, u.email, u.role, u.is_active
             FROM users u
             WHERE u.email = $1 AND u.org_id = $2`,
            [decodedToken.email, decodedToken.orgId],
          );

          if (
            assignedOrgUserResult.rows.length > 0 &&
            assignedOrgUserResult.rows[0].is_active
          ) {
            userDataForOrg = assignedOrgUserResult.rows[0];
          } else {
            userDataForOrg = originalUser;
          }
        }
      }

      if (!hasAccess) {
        logger.warn("User no longer has access to organisation", {
          userId: decodedToken.userId,
          email: decodedToken.email,
          role: decodedToken.role,
          orgId: decodedToken.orgId,
          accessType: accessType,
        });
        throw new Error("Access denied to organisation");
      }

      if (!userDataForOrg || !userDataForOrg.is_active) {
        throw new Error("User not found or inactive for this organisation");
      }

      // Get current permissions based on the user's role
      const permissionsResult = await db.query(
        `SELECT p.name FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [userDataForOrg.role],
      );

      // Build the validated user data
      const validatedUserData = {
        userId: userDataForOrg.id,
        username: userDataForOrg.username,
        email: userDataForOrg.email,
        role: userDataForOrg.role,
        orgId: targetOrg.org_id,
        orgKey: targetOrg.api_key,
        orgName: targetOrg.name,
        retellWorkspaceId: targetOrg.retell_workspace_id,
        permissions: permissionsResult.rows.map((p) => p.name),
        isActive: userDataForOrg.is_active,
        accessType: accessType, // Include access type for transparency
      };

      logger.info("User validation successful", {
        userId: validatedUserData.userId,
        email: validatedUserData.email,
        role: validatedUserData.role,
        orgId: validatedUserData.orgId,
        accessType: accessType,
      });

      return validatedUserData;
    } catch (error) {
      logger.error("User validation with roles error", {
        error: error.message,
        userId: decodedToken.userId,
        orgId: decodedToken.orgId,
      });
      throw error;
    }
  }

  /**
   * Select organisation for authenticated user with role-based access control
   * @param {number} userId - User ID from JWT
   * @param {string} email - User email
   * @param {string} role - User's role
   * @param {number} orgId - Selected organisation ID
   * @returns {Promise<object>} - User data for selected organisation
   */
  async selectOrganisationWithAuth(userId, email, role, orgId) {
    try {
      logger.info("Selecting organisation with auth", {
        userId,
        email,
        role,
        orgId,
      });

      // Define workspace access rules
      const WORKSPACE_ACCESS_RULES = {
        "super-admin": "all",
        observer: "all",
        member: "own_and_assigned",
        "customer-admin": "own",
        "core-team-member": "own",
        "analytics-user": "own",
      };

      const accessType = WORKSPACE_ACCESS_RULES[role] || "own";
      let hasAccess = false;
      let userData = null;

      // First, check if the requested organisation exists
      const orgCheckResult = await db.query(
        `SELECT org_id, name, api_key, retell_workspace_id 
         FROM organisations 
         WHERE org_id = $1`,
        [orgId],
      );

      if (orgCheckResult.rows.length === 0) {
        throw new Error("Organisation not found");
      }

      const targetOrg = orgCheckResult.rows[0];

      // Check access based on role
      if (accessType === "all") {
        // Super-admin and observer can access any org
        hasAccess = true;

        // Check if user has a record for this org
        const userOrgResult = await db.query(
          `SELECT u.id, u.username, u.email, u.role, u.is_active
           FROM users u
           WHERE u.email = $1 AND u.org_id = $2`,
          [email, orgId],
        );

        if (userOrgResult.rows.length > 0) {
          // User has existing record for this org
          userData = userOrgResult.rows[0];

          // Update last login
          await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [
            userData.id,
          ]);
        } else {
          // Super-admin/observer accessing org without user record
          // Use their original user data but with the new org
          const originalUserResult = await db.query(
            `SELECT id, username, email, role, is_active
             FROM users
             WHERE id = $1`,
            [userId],
          );

          if (originalUserResult.rows.length === 0) {
            throw new Error("User not found");
          }

          userData = originalUserResult.rows[0];
          // Keep the original role for super-admin/observer
        }
      } else if (accessType === "own") {
        // Check if the user's org_id matches
        const userResult = await db.query(
          `SELECT u.id, u.username, u.email, u.role, u.org_id, u.is_active
           FROM users u
           WHERE u.id = $1`,
          [userId],
        );

        if (userResult.rows.length > 0 && userResult.rows[0].org_id === orgId) {
          hasAccess = true;
          userData = userResult.rows[0];

          // Update last login
          await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [
            userData.id,
          ]);
        }
      } else if (accessType === "own_and_assigned") {
        // Check if org is in user's own org_id or assigned_workspace array
        const userResult = await db.query(
          `SELECT u.id, u.username, u.email, u.role, u.org_id, 
                  u.assigned_workspace, u.is_active
           FROM users u
           WHERE u.id = $1`,
          [userId],
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];

          // Check if it's their own org
          if (user.org_id === orgId) {
            hasAccess = true;
            userData = user;
          }
          // Check if it's in assigned workspaces
          else if (
            user.assigned_workspace &&
            Array.isArray(user.assigned_workspace)
          ) {
            if (user.assigned_workspace.includes(orgId)) {
              hasAccess = true;

              // Check if user has a record for this assigned org
              const assignedOrgUserResult = await db.query(
                `SELECT u.id, u.username, u.email, u.role, u.is_active
                 FROM users u
                 WHERE u.email = $1 AND u.org_id = $2`,
                [email, orgId],
              );

              if (assignedOrgUserResult.rows.length > 0) {
                userData = assignedOrgUserResult.rows[0];
              } else {
                // Use original user data
                userData = user;
              }
            }
          }

          if (hasAccess && userData) {
            // Update last login
            await db.query(
              "UPDATE users SET last_login = NOW() WHERE id = $1",
              [userData.id],
            );
          }
        }
      }

      if (!hasAccess) {
        logger.warn("Organisation access denied", {
          userId,
          email,
          role,
          orgId,
          accessType,
        });
        throw new Error("Access denied to this organisation");
      }

      if (!userData) {
        throw new Error("User data not found");
      }

      // Check if user is active
      if (!userData.is_active) {
        throw new Error("Account is deactivated");
      }

      // Get permissions based on role
      const permissionsResult = await db.query(
        `SELECT p.name 
         FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [userData.role],
      );

      const permissions = permissionsResult.rows.map((p) => p.name);

      return {
        userId: userData.id,
        username: userData.username,
        email: userData.email,
        role: userData.role,
        orgId: targetOrg.org_id,
        orgKey: targetOrg.api_key,
        orgName: targetOrg.name,
        retellWorkspaceId: targetOrg.retell_workspace_id,
        permissions: permissions,
        isActive: userData.is_active,
      };
    } catch (error) {
      logger.error("Organisation selection with auth error", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<object>} - User data or organisation selection required
   */
  async authenticateUser(email, password) {
    try {
      logger.info("Authenticating user", { email });

      // Get all orgs for this email
      const query = `
        SELECT u.id, u.username, u.email, u.password_hash, u.role, 
               u.org_id, u.is_active, u.failed_login_attempts,
               u.last_login, u.force_password_reset, o.name as org_name, 
               o.api_key as org_api_key, o.retell_workspace_id
        FROM users u
        JOIN organisations o ON u.org_id = o.org_id
        WHERE u.email = $1
        ORDER BY u.last_login DESC NULLS LAST
      `;

      const result = await db.query(query, [email]);

      logger.info("Query result", { rowCount: result.rows.length }); // Add debug log

      if (result.rows.length === 0) {
        throw new Error("Invalid credentials");
      }

      // Use the first record to verify password
      const user = result.rows[0];

      logger.info("User found", {
        // Add debug log
        userId: user.id,
        orgId: user.org_id,
        isActive: user.is_active,
      });

      // Check if user is active
      if (!user.is_active) {
        throw new Error("Account is deactivated");
      }

      // Check failed login attempts
      if (user.failed_login_attempts >= 5) {
        throw new Error("Account locked due to multiple failed attempts");
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(
        password,
        user.password_hash,
      );

      logger.info("Password verification", { isValid: isValidPassword }); // Add debug log

      if (!isValidPassword) {
        // Increment failed attempts
        await db.query(
          "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE email = $1",
          [email],
        );
        throw new Error("Invalid credentials");
      }

      // Reset failed attempts
      await db.query(
        "UPDATE users SET failed_login_attempts = 0 WHERE email = $1",
        [email],
      );

      // If user has multiple organisations, return them for selection
      if (result.rows.length > 1) {
        logger.info("Multiple orgs found"); // Add debug log
        return {
          requireOrgSelection: true,
          email: email,
          organisations: result.rows.map((r) => ({
            id: r.org_id,
            key: r.org_api_key,
            name: r.org_name,
            role: r.role,
            lastLogin: r.last_login,
          })),
        };
      }

      // Single organisation - proceed with login
      await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [
        user.id,
      ]);

      // Get permissions based on role
      const permissionsResult = await db.query(
        `SELECT p.name 
         FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [user.role],
      );

      const permissions = permissionsResult.rows.map((p) => p.name);

      logger.info("Returning user data"); // Add debug log

      return {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        orgId: user.org_id,
        orgKey: user.org_api_key,
        orgName: user.org_name,
        retellWorkspaceId: user.retell_workspace_id,
        permissions: permissions,
        lastLogin: user.last_login,
        isActive: user.is_active,
        forcePasswordReset: user.force_password_reset,
      };
    } catch (error) {
      logger.error("User authentication error", { error: error.message });
      throw error;
    }
  }

  /**
   * Select organisation for authenticated user
   * @param {string} email - User email
   * @param {number} orgId - Selected organisation ID
   * @returns {Promise<object>} - User data for selected organisation
   */
  async selectOrganisation(email, orgId) {
    try {
      logger.info("Selecting organisation for user", { email, orgId });

      const query = `
        SELECT u.id, u.username, u.email, u.role, 
               u.org_id, u.is_active,
               o.name as org_name, o.api_key as org_api_key,
               o.retell_workspace_id
        FROM users u
        JOIN organisations o ON u.org_id = o.org_id
        WHERE u.email = $1 AND u.org_id = $2 AND u.is_active = true
      `;

      const result = await db.query(query, [email, orgId]);

      if (result.rows.length === 0) {
        throw new Error("Invalid organisation selection");
      }

      const user = result.rows[0];

      // Update last login for this specific user-organisation record
      await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [
        user.id,
      ]);

      // Get permissions based on role
      const permissionsResult = await db.query(
        `SELECT p.name 
         FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [user.role],
      );

      const permissions = permissionsResult.rows.map((p) => p.name);

      return {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        orgId: user.org_id,
        orgKey: user.org_api_key,
        orgName: user.org_name,
        retellWorkspaceId: user.retell_workspace_id,
        permissions: permissions,
        isActive: user.is_active,
      };
    } catch (error) {
      logger.error("Organisation selection error", { error: error.message });
      throw error;
    }
  }

  /**
   * Generate JWT token for authenticated user
   * @param {object} userData - User data to encode in token
   * @returns {string} - JWT token
   */
  generateJWT(userData) {
    const payload = {
      userId: userData.userId,
      email: userData.email,
      username: userData.username,
      role: userData.role,
      orgId: userData.orgId,
      orgKey: userData.orgKey,
      orgName: userData.orgName,
      retellWorkspaceId: userData.retellWorkspaceId,
      permissions: userData.permissions,
    };

    console.log("Generating JWT with payload:", payload);

    const token = jwt.sign(payload, JWT_CONFIG.secret, {
      expiresIn: JWT_CONFIG.expiresIn,
    });

    logger.info("JWT generated successfully", {
      userId: userData.userId,
      email: userData.email,
      expiresIn: JWT_CONFIG.expiresIn,
    });

    return token;
  }

  /**
   * Generate refresh token
   * @param {number} userId - User ID
   * @param {number} orgId - Organisation ID
   * @returns {string} - Refresh token
   */
  generateRefreshToken(userId, orgId) {
    const payload = {
      userId,
      orgId,
      type: "refresh",
      jti: crypto.randomUUID(), // JWT ID for token tracking
    };

    const token = jwt.sign(payload, JWT_CONFIG.secret, {
      expiresIn: JWT_CONFIG.refreshExpiresIn,
    });

    // Store refresh token in database for tracking (optional)
    this.storeRefreshToken(userId, orgId, payload.jti).catch((err) => {
      logger.error("Failed to store refresh token", { error: err.message });
    });

    return token;
  }

  /**
   * Store refresh token in database (optional for tracking/revocation)
   * @param {number} userId - User ID
   * @param {number} orgId - Organisation ID
   * @param {string} jti - JWT ID
   */
  async storeRefreshToken(userId, orgId, jti) {
    try {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, org_id, token_id, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
         ON CONFLICT (user_id, org_id) DO UPDATE
         SET token_id = $3, expires_at = NOW() + INTERVAL '7 days', created_at = NOW()`,
        [userId, orgId, jti],
      );
    } catch (error) {
      logger.error("Error storing refresh token", { error: error.message });
      // Non-critical error, don't throw
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {object} - Decoded token payload
   */
  verifyJWT(token) {
    try {
      const decoded = jwt.verify(token, JWT_CONFIG.secret);
      logger.debug("JWT verified successfully", { userId: decoded.userId });
      return decoded;
    } catch (error) {
      logger.error("JWT verification failed", { error: error.message });
      throw new Error("Invalid or expired token");
    }
  }

  /**
   * Validate user is still active and get fresh data
   * @param {object} decodedToken - Decoded JWT payload
   * @returns {Promise<object>} - Fresh user data
   */
  async validateAndRefreshUser(decodedToken) {
    try {
      // Verify user still exists and is active
      const result = await db.query(
        `SELECT u.id, u.username, u.email, u.role, u.is_active,
                u.org_id, o.api_key as org_api_key, o.name as org_name,
                o.retell_workspace_id
         FROM users u
         JOIN organisations o ON u.org_id = o.org_id
         WHERE u.id = $1 AND u.org_id = $2`,
        [decodedToken.userId, decodedToken.orgId],
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        throw new Error("User not found or inactive");
      }

      const user = result.rows[0];

      // Get current permissions (role might have changed)
      const permissionsResult = await db.query(
        `SELECT p.name FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [user.role],
      );

      return {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        orgId: user.org_id,
        orgKey: user.org_api_key,
        orgName: user.org_name,
        retellWorkspaceId: user.retell_workspace_id,
        permissions: permissionsResult.rows.map((p) => p.name),
        isActive: user.is_active,
      };
    } catch (error) {
      logger.error("User validation error", { error: error.message });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<object>} - New tokens and user data
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = this.verifyJWT(refreshToken);

      if (decoded.type !== "refresh") {
        throw new Error("Invalid token type");
      }

      // Get fresh user data
      const userResult = await db.query(
        `SELECT u.id, u.username, u.email, u.role, u.is_active,
                u.org_id, o.api_key as org_api_key, o.name as org_name,
                o.retell_workspace_id
         FROM users u
         JOIN organisations o ON u.org_id = o.org_id
         WHERE u.id = $1`,
        [decoded.userId],
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        throw new Error("User not found or inactive");
      }

      const user = userResult.rows[0];

      // Verify organisation match
      if (user.org_id !== decoded.orgId) {
        throw new Error("Organisation mismatch");
      }

      // Get permissions
      const permissionsResult = await db.query(
        `SELECT p.name FROM role_permissions rp 
         JOIN permissions p ON rp.permission_id = p.id 
         WHERE rp.role = $1`,
        [user.role],
      );

      const userData = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        orgId: user.org_id,
        orgKey: user.org_api_key,
        orgName: user.org_name,
        retellWorkspaceId: user.retell_workspace_id,
        permissions: permissionsResult.rows.map((p) => p.name),
      };

      // Generate new tokens
      const newAccessToken = this.generateJWT(userData);
      const newRefreshToken = this.generateRefreshToken(user.id, user.org_id);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        userData,
      };
    } catch (error) {
      logger.error("Token refresh error", { error: error.message });
      throw error;
    }
  }

  /**
   * Invalidate refresh token (for logout)
   * @param {number} userId - User ID
   * @param {number} orgId - Organisation ID
   */
  async invalidateRefreshToken(userId, orgId) {
    try {
      await db.query(
        "DELETE FROM refresh_tokens WHERE user_id = $1 AND org_id = $2",
        [userId, orgId],
      );
    } catch (error) {
      logger.error("Error invalidating refresh token", {
        error: error.message,
      });
      // Non-critical error, don't throw
    }
  }

  /**
   * Change user password
   * @param {number} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user
      const userResult = await db.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId],
      );

      if (userResult.rows.length === 0) {
        throw new Error("User not found");
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        currentPassword,
        userResult.rows[0].password_hash,
      );

      if (!isValidPassword) {
        throw new Error("Invalid current password");
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await db.query(
        `UPDATE users 
         SET password_hash = $1, 
             force_password_reset = false,
             updated_at = NOW() 
         WHERE id = $2`,
        [newPasswordHash, userId],
      );
      // Update password

      logger.info("Password changed successfully", { userId });
    } catch (error) {
      logger.error("Password change error", { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get user organisations
   * @param {string} email - User email
   * @returns {Promise<array>} - List of organisations
   */
  async getUserOrganisations(email) {
    try {
      const result = await db.query(
        `SELECT u.org_id, u.role, u.last_login,
                o.name, o.api_key, o.retell_workspace_id
         FROM users u
         JOIN organisations o ON u.org_id = o.org_id
         WHERE u.email = $1 AND u.is_active = true
         ORDER BY u.last_login DESC NULLS LAST`,
        [email],
      );

      return result.rows.map((row) => ({
        id: row.org_id,
        name: row.name,
        key: row.api_key,
        retellWorkspaceId: row.retell_workspace_id,
        role: row.role,
        lastLogin: row.last_login,
      }));
    } catch (error) {
      logger.error("Error fetching user organisations", {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = UserAuthService;
