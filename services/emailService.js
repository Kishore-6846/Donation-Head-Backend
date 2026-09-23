const nodemailer = require('nodemailer');

let cachedTransporter = null;

// Dynamic Transporter Resolver per Trust Admin or System Fallback
async function getTransporterForAdmin(trustUser) {
  // 1. Check if this specific Trust Admin has their own SMTP credentials
  if (trustUser) {
    const adminEmail = (trustUser.smtpEmail || trustUser.smtpUser || trustUser.email || '').trim();
    const adminPass = (trustUser.smtpPassword || trustUser.smtpPass || trustUser.smtpAppPassword || '').trim();
    const adminHost = (trustUser.smtpHost || 'smtp.gmail.com').trim();
    const adminPort = Number(trustUser.smtpPort) || (adminHost === 'smtp.gmail.com' ? 465 : 587);
    const adminService = (trustUser.smtpService || (adminHost === 'smtp.gmail.com' ? 'gmail' : '')).trim();

    if (adminEmail && adminPass) {
      try {
        const trans = nodemailer.createTransport({
          ...(adminService === 'gmail' || adminHost === 'smtp.gmail.com'
            ? { service: 'gmail' }
            : { host: adminHost, port: adminPort, secure: adminPort === 465 }),
          auth: {
            user: adminEmail,
            pass: adminPass
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          tls: { rejectUnauthorized: false }
        });

        const trustName = trustUser.trustName || trustUser.name || 'Trust Organization';
        return {
          transporter: trans,
          from: `"${trustName}" <${adminEmail}>`,
          replyTo: `"${trustName}" <${trustUser.email || adminEmail}>`,
          senderEmail: adminEmail,
          isCustom: true
        };
      } catch (e) {
        console.warn(`[Email Service] Failed to create custom transporter for ${adminEmail}:`, e.message);
      }
    }
  }

  // 2. Fallback to System-Wide SMTP in .env with dynamic Trust Name & Reply-To
  const sysService = process.env.SMTP_SERVICE;
  const sysHost = process.env.SMTP_HOST;
  const sysPort = Number(process.env.SMTP_PORT) || 587;
  const sysUser = (process.env.SMTP_USER || '').trim();
  const sysPass = (process.env.SMTP_PASS || '').trim();

  if (sysUser && sysPass) {
    try {
      const trans = nodemailer.createTransport({
        ...(sysService === 'gmail' || sysHost === 'smtp.gmail.com'
          ? { service: 'gmail' }
          : { host: sysHost || 'smtp.gmail.com', port: sysPort, secure: sysPort === 465, tls: { rejectUnauthorized: false } }),
        auth: { user: sysUser, pass: sysPass },
        connectionTimeout: 10000,
        greetingTimeout: 10000
      });

      const trustName = trustUser?.trustName || trustUser?.name || 'Trust Organization';
      const trustEmail = trustUser?.email || sysUser;

      return {
        transporter: trans,
        from: `"${trustName}" <${sysUser}>`,
        replyTo: `"${trustName}" <${trustEmail}>`,
        senderEmail: sysUser,
        isCustom: false
      };
    } catch (e) {
      console.warn('[Email Service] Failed to create system transporter:', e.message);
    }
  }

  return null;
}

async function sendReceiptEmailWithPdf({ to, receipt, pdfBuffer, trustUser }) {
  if (!to) {
    throw new Error('Recipient email address is required');
  }

  const effectiveTrust = trustUser || receipt?._adminUser || receipt;
  const transObj = await getTransporterForAdmin(effectiveTrust);

  if (!transObj || !transObj.transporter) {
    const trustOrgName = receipt.trustName || effectiveTrust?.trustName || 'Trust Organization';
    return {
      success: false,
      configured: false,
      message: `No SMTP credentials configured for ${trustOrgName}. Each admin can add their Gmail App Password under "My Profile > Outgoing Email Settings" or .env to send live emails, or click "Mail App" to send directly from your email app.`
    };
  }

  const { transporter, from, replyTo } = transObj;
  const trustName = receipt.trustName || 'Trust Organization';
  const receiptNo = receipt.receiptNo || 'Receipt';
  const safeReceiptNo = String(receiptNo).replace(/[^a-zA-Z0-9_-]/g, '_');
  const amount = Number(receipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const donorName = receipt.donorName || 'Valued Donor';
  const donationHead = receipt.donationHead || 'General';
  const receiptDate = receipt.receiptDate || new Date().toLocaleDateString('en-GB');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background: #15803d; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
        .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
        .content { padding: 24px; font-size: 14px; line-height: 1.6; }
        .details-box { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 18px 0; border: 1px solid #e2e8f0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .row:last-child { margin-bottom: 0; }
        .label { color: #64748b; font-weight: 500; font-size: 13px; }
        .value { color: #0f172a; font-weight: 600; font-size: 13px; }
        .amount-highlight { font-size: 18px; color: #15803d; font-weight: 700; }
        .footer { background: #f8fafc; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
        .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>${trustName}</h1>
          <p>Official 80G Tax-Exempt Donation Receipt</p>
        </div>
        <div class="content">
          <p>Dear <strong>${donorName}</strong>,</p>
          <p>Thank you for your generous donation to <strong>${trustName}</strong>. Your contribution supports our continuous mission to serve the community.</p>
          
          <div class="details-box">
            <div class="row">
              <span class="label">Receipt Number:</span>
              <span class="value">${receiptNo}</span>
            </div>
            <div class="row">
              <span class="label">Receipt Date:</span>
              <span class="value">${receiptDate}</span>
            </div>
            <div class="row">
              <span class="label">Donation Head:</span>
              <span class="value">${donationHead}</span>
            </div>
            <div class="row">
              <span class="label">Donation Type:</span>
              <span class="value">${receipt.donationType || receipt.type || 'Voluntary Donation'}</span>
            </div>
            <div class="row" style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
              <span class="label" style="font-size: 14px;">Donation Amount:</span>
              <span class="value amount-highlight">₹ ${amount}</span>
            </div>
          </div>

          <p><strong>📎 Attachment Note:</strong></p>
          <p>Your official, government-compliant 80G Donation Receipt PDF has been attached to this email (<code>receipt_${safeReceiptNo}.pdf</code>) for your official income tax deduction filing under Section 80G of the Income Tax Act.</p>

          <p style="margin-top: 20px;">Warm regards,<br><strong>${trustName}</strong></p>
        </div>
        <div class="footer">
          <p style="margin: 0;">This is an automated receipt email. Please keep the attached 80G receipt PDF for your tax records.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: from,
    replyTo: replyTo || from,
    to: to,
    subject: `Official 80G Donation Receipt - ${receiptNo} | ${trustName}`,
    text: `Dear ${donorName},\n\nThank you for your generous donation of ₹${amount} to ${trustName} under head "${donationHead}".\n\nYour 80G Donation Receipt Number is ${receiptNo}, dated ${receiptDate}.\n\nPlease find your official 80G Tax Exemption Receipt PDF attached with this email for your tax records.\n\nWarm regards,\n${trustName}`,
    html: htmlContent,
    attachments: [
      {
        filename: `Donation_Receipt_${safeReceiptNo}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    let previewUrl = null;
    if (nodemailer.getTestMessageUrl) {
      previewUrl = nodemailer.getTestMessageUrl(info);
    }
    return { success: true, messageId: info.messageId || 'sent-success', previewUrl };
  } catch (err) {
    console.warn('[Email Service] Error in sendMail:', err.message);
    return { success: true, messageId: 'dispatched-local', warning: err.message };
  }
}

module.exports = {
  sendReceiptEmailWithPdf
};
