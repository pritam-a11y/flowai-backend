const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

class S3DocumentService {
  constructor() {
    // Configure AWS S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || "us-east-1",
    });

    // ✅ Use AWS_S3_BUCKET (preferred), fallback to S3_BUCKET_NAME, then default
    this.bucketName =
      process.env.AWS_S3_BUCKET ||
      process.env.S3_BUCKET_NAME ||
      "flow-ai-launchpad-docs";

    this.cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN; // Optional: Use CloudFront for CDN
  }

  /**
   * Upload a document to S3
   * @param {Buffer} fileBuffer - File content buffer
   * @param {Object} metadata - File metadata (filename, mimetype, orgId, section, etc.)
   * @returns {Promise<Object>} - Upload result with URL and document metadata
   */
  async uploadDocument(fileBuffer, metadata) {
    try {
      const { filename, mimetype, orgId, section, uploadedBy } = metadata;

      // Generate unique key for the file
      const fileExtension = filename.split(".").pop();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const documentId = uuidv4();
      const timestamp = Date.now();

      // Organize files by org/section/timestamp-uuid-filename
      const s3Key = `org-${orgId}/${section}/${timestamp}-${documentId}-${sanitizedFilename}`;

      logger.info("Uploading document to S3", {
        orgId,
        section,
        filename: sanitizedFilename,
        s3Key,
      });

      // Set up S3 upload parameters
      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimetype,
        // Set metadata
        Metadata: {
          "org-id": String(orgId),
          section: section,
          "original-name": filename,
          "uploaded-by": String(uploadedBy),
          "document-id": documentId,
        },
        // Set appropriate cache and access headers
        CacheControl: "max-age=31536000", // 1 year cache
        ServerSideEncryption: "AES256", // Enable server-side encryption
        // Make the file publicly readable if needed, or use signed URLs
        ACL:
          process.env.S3_PRIVATE_BUCKET === "true" ? "private" : "public-read",
      };

      // Upload to S3
      const uploadResult = await this.s3.upload(uploadParams).promise();

      logger.info("Document uploaded successfully to S3", {
        location: uploadResult.Location,
        key: uploadResult.Key,
        bucket: uploadResult.Bucket,
      });

      // Generate the URL (either CloudFront CDN or direct S3)
      let documentUrl;
      if (this.cloudFrontDomain) {
        documentUrl = `https://${this.cloudFrontDomain}/${s3Key}`;
      } else if (process.env.S3_PRIVATE_BUCKET === "true") {
        // Generate a signed URL that expires in 7 days
        documentUrl = await this.generateSignedUrl(s3Key, 7 * 24 * 60 * 60);
      } else {
        documentUrl = uploadResult.Location;
      }

      // Return document metadata
      return {
        success: true,
        document: {
          id: documentId,
          name: filename,
          original_name: filename,
          s3_key: s3Key,
          url: documentUrl,
          size: fileBuffer.length,
          mime_type: mimetype,
          uploaded_at: new Date().toISOString(),
          uploaded_by: uploadedBy,
          section: section,
        },
      };
    } catch (error) {
      logger.error("Error uploading document to S3", {
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to upload document: ${error.message}`);
    }
  }

  /**
   * Generate a signed URL for private bucket access
   * @param {string} s3Key - S3 object key
   * @param {number} expiresIn - URL expiration in seconds
   * @returns {Promise<string>} - Signed URL
   */
  async generateSignedUrl(s3Key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
        Expires: expiresIn,
      };

      const signedUrl = await this.s3.getSignedUrlPromise("getObject", params);

      logger.info("Generated signed URL", {
        s3Key,
        expiresIn,
      });

      return signedUrl;
    } catch (error) {
      logger.error("Error generating signed URL", {
        error: error.message,
        s3Key,
      });
      throw error;
    }
  }

  /**
   * Delete a document from S3
   * @param {string} s3Key - S3 object key
   * @returns {Promise<boolean>} - Success status
   */
  async deleteDocument(s3Key) {
    try {
      logger.info("Deleting document from S3", { s3Key });

      const deleteParams = {
        Bucket: this.bucketName,
        Key: s3Key,
      };

      await this.s3.deleteObject(deleteParams).promise();

      logger.info("Document deleted successfully from S3", { s3Key });
      return true;
    } catch (error) {
      logger.error("Error deleting document from S3", {
        error: error.message,
        s3Key,
      });
      throw error;
    }
  }

  /**
   * Get document metadata and generate fresh signed URL if needed
   * @param {string} s3Key - S3 object key
   * @returns {Promise<Object>} - Document metadata with fresh URL
   */
  async getDocument(s3Key) {
    try {
      // Get object metadata
      const headParams = {
        Bucket: this.bucketName,
        Key: s3Key,
      };

      const metadata = await this.s3.headObject(headParams).promise();

      // Generate fresh URL
      let documentUrl;
      if (this.cloudFrontDomain) {
        documentUrl = `https://${this.cloudFrontDomain}/${s3Key}`;
      } else if (process.env.S3_PRIVATE_BUCKET === "true") {
        documentUrl = await this.generateSignedUrl(s3Key, 7 * 24 * 60 * 60);
      } else {
        documentUrl = `https://${this.bucketName}.s3.amazonaws.com/${s3Key}`;
      }

      return {
        success: true,
        document: {
          s3_key: s3Key,
          url: documentUrl,
          size: metadata.ContentLength,
          mime_type: metadata.ContentType,
          last_modified: metadata.LastModified,
          metadata: metadata.Metadata,
        },
      };
    } catch (error) {
      if (error.code === "NotFound") {
        logger.warn("Document not found in S3", { s3Key });
        return {
          success: false,
          error: "Document not found",
        };
      }

      logger.error("Error getting document from S3", {
        error: error.message,
        s3Key,
      });
      throw error;
    }
  }

  /**
   * List documents for an organization and section
   * @param {number} orgId - Organization ID
   * @param {string} section - Section name (optional)
   * @returns {Promise<Array>} - List of documents
   */
  async listDocuments(orgId, section = null) {
    try {
      const prefix = section ? `org-${orgId}/${section}/` : `org-${orgId}/`;

      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: 1000,
      };

      const data = await this.s3.listObjectsV2(listParams).promise();

      const documents = await Promise.all(
        data.Contents.map(async (item) => {
          const url = this.cloudFrontDomain
            ? `https://${this.cloudFrontDomain}/${item.Key}`
            : process.env.S3_PRIVATE_BUCKET === "true"
              ? await this.generateSignedUrl(item.Key, 7 * 24 * 60 * 60)
              : `https://${this.bucketName}.s3.amazonaws.com/${item.Key}`;

          return {
            s3_key: item.Key,
            url: url,
            size: item.Size,
            last_modified: item.LastModified,
          };
        }),
      );

      logger.info("Listed documents from S3", {
        orgId,
        section,
        count: documents.length,
      });

      return documents;
    } catch (error) {
      logger.error("Error listing documents from S3", {
        error: error.message,
        orgId,
        section,
      });
      throw error;
    }
  }

  /**
   * Copy document to another location in S3
   * @param {string} sourceKey - Source S3 key
   * @param {string} destinationKey - Destination S3 key
   * @returns {Promise<Object>} - Copy result
   */
  async copyDocument(sourceKey, destinationKey) {
    try {
      const copyParams = {
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
        ServerSideEncryption: "AES256",
      };

      const result = await this.s3.copyObject(copyParams).promise();

      logger.info("Document copied successfully in S3", {
        sourceKey,
        destinationKey,
      });

      return {
        success: true,
        newKey: destinationKey,
      };
    } catch (error) {
      logger.error("Error copying document in S3", {
        error: error.message,
        sourceKey,
        destinationKey,
      });
      throw error;
    }
  }

  /**
   * Get presigned POST data for direct browser upload
   * @param {Object} metadata - Upload metadata
   * @returns {Promise<Object>} - Presigned POST data
   */
  async getPresignedPostData(metadata) {
    try {
      const { filename, orgId, section, maxSize = 10485760 } = metadata; // Default 10MB max

      const documentId = uuidv4();
      const timestamp = Date.now();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const s3Key = `org-${orgId}/${section}/${timestamp}-${documentId}-${sanitizedFilename}`;

      const params = {
        Bucket: this.bucketName,
        Conditions: [
          ["content-length-range", 0, maxSize],
          ["starts-with", "$Content-Type", ""],
        ],
        Fields: {
          key: s3Key,
          "x-amz-server-side-encryption": "AES256",
        },
        Expires: 300, // URL expires in 5 minutes
      };

      const presignedPost = await this.s3.createPresignedPost(params);

      logger.info("Generated presigned POST data", {
        s3Key,
        orgId,
        section,
      });

      return {
        success: true,
        uploadData: presignedPost,
        documentId: documentId,
      };
    } catch (error) {
      logger.error("Error generating presigned POST data", {
        error: error.message,
      });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new S3DocumentService();
