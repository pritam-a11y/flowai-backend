const { Resend } = require("resend");
const logger = require("../utils/logger");
const moment = require("moment-timezone");

const resend = new Resend("re_DXtS219b_C9LEPwDvBsy2ZMmEKZGh8yYx");

const REPORT_RECIPIENT_EMAIL = "pritamsamaddar840@gmail.com";
const REPORT_SENDER_EMAIL = "patientservices@myflowai.com";

class EmailService {
  /**
   * Sends the patient update report email with the CSV attachment.
   * @param {string} csvData - The CSV content string.
   * @param {number} rowCount - The number of rows in the report.
   * @param {moment.Moment} startTime - The start of the data window (Moment object).
   * @param {moment.Moment} endTime - The end of the data window (Moment object).
   */
  async sendReportEmail(csvData, rowCount, startTime, endTime) {
    const reportTimeStr =
      startTime.format("YYYYMMDD_HHmm") + "_" + endTime.format("HHmm");
    const filename = `patient_updates_${reportTimeStr}.csv`;
    const timeZone = startTime.tz();

    const subject = `ACTION REQUIRED: Daily Patient Booking & Update Report (${rowCount} Records)`;

    // --- HTML BODY TEMPLATE ---
    const htmlBody = `
            <!doctype html>
            <html>
            <body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                    
                    <div style="background-color: #007bff; color: white; padding: 15px 20px; text-align: center;">
                        <h2 style="margin: 0; font-size: 18px;">Automated Patient Data Report</h2>
                    </div>

                    <div style="padding: 20px;">
                        <p>Dear Clinical Staff,</p>
                        
                        <p>This is your scheduled **Patient Booking and Update Report** containing records modified within the latest operational window.</p>

                        <div style="background-color: #f7f7f7; padding: 15px; border-radius: 6px; margin: 20px 0;">
                            <p style="margin: 0;">
                                <strong>Time Window:</strong><br>
                                ${startTime.format(
                                  "MMM DD, YYYY h:mm A"
                                )} ${timeZone} 
                                to 
                                ${endTime.format(
                                  "MMM DD, YYYY h:mm A"
                                )} ${timeZone}
                            </p>
                            <p style="margin: 10px 0 0 0;">
                                <strong>Records Updated:</strong> ${rowCount} patient files.
                            </p>
                        </div>

                        <p>
                            Please download and process the attached CSV file for all new appointments and updates to patient screening/transfer details.
                        </p>
                        
                        <p style="font-weight: bold; color: #dc3545;">
                            &#9888; IMPORTANT SECURITY NOTE:
                        </p>
                        <p style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                            This email contains Protected Health Information (PHI). Please ensure the attachment, 
                            <strong style="color: #333;">${filename}</strong>, is handled securely and uploaded to your EMR/system promptly.
                        </p>
                        
                        <p style="margin-top: 30px;">
                            Thank you,<br>
                            The Automated Patient Services Team
                        </p>
                    </div>

                    <div style="background-color: #f1f1f1; color: #6c757d; padding: 10px 20px; font-size: 10px; text-align: center;">
                        Please do not reply to this automated email. Contact IT support if you have issues receiving this report.
                    </div>
                </div>
            </body>
            </html>
        `;
    // --- END HTML BODY TEMPLATE ---

    const emailData = {
      from: REPORT_SENDER_EMAIL,
      to: REPORT_RECIPIENT_EMAIL,
      subject: subject,
      html: htmlBody,
      attachments: [
        {
          content: Buffer.from(csvData),
          filename: filename,
          contentType: "text/csv",
        },
      ],
    };

    try {
      const resp = await resend.emails.send(emailData);
      logger.info("Report email sent successfully via Resend", {
        emailId: resp.id,
        recipient: REPORT_RECIPIENT_EMAIL,
        rowCount: rowCount,
      });
      return resp;
    } catch (emailError) {
      logger.error("Failed to send report email via Resend", {
        error: emailError.message,
        recipient: REPORT_RECIPIENT_EMAIL,
      });
      throw new Error(`Email sending failed: ${emailError.message}`);
    }
  }
}

module.exports = EmailService;
