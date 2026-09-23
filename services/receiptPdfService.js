const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function convertNumberToWords(num) {
  if (!num || isNaN(num) || Number(num) <= 0) return 'Zero Rupees Only';
  num = Math.floor(Number(num));

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
  }

  let words = '';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = Math.floor(num / 100);
  const rem = num % 100;

  if (crore > 0) words += inWords(crore) + ' Crore ';
  if (lakh > 0) words += inWords(lakh) + ' Lakh ';
  if (thousand > 0) words += inWords(thousand) + ' Thousand ';
  if (hundred > 0) words += inWords(hundred) + ' Hundred ';
  if (rem > 0) {
    if (words !== '') words += 'and ';
    words += inWords(rem) + ' ';
  }

  return words.trim() + ' Only';
}

function getImageBuffer(imgSource) {
  if (!imgSource) return null;
  if (Buffer.isBuffer(imgSource)) return imgSource;
  if (typeof imgSource !== 'string') return null;

  const trimmed = imgSource.trim();
  if (!trimmed) return null;

  // Base64 Data URL (e.g. data:image/jpeg;base64,...)
  if (trimmed.startsWith('data:image/')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx !== -1) {
      try {
        const base64Str = trimmed.slice(commaIdx + 1);
        return Buffer.from(base64Str, 'base64');
      } catch (e) {
        return null;
      }
    }
  }

  // Raw Base64 string (check length and basic base64 pattern)
  if (trimmed.length > 100 && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    try {
      return Buffer.from(trimmed, 'base64');
    } catch (e) {
      return null;
    }
  }

  // Local file path
  try {
    if (fs.existsSync(trimmed)) {
      return fs.readFileSync(trimmed);
    }
  } catch (e) {}

  return null;
}

function renderReceiptPages(doc, receipt) {
  const financialYear = receipt.financialYear || receipt.fy || '2026-2027';
  const trustName = receipt.trustName || 'Trust Organization';
  const trustPrefix = (trustName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()) || 'REC';
  const receiptNo = receipt.receiptNo || `${trustPrefix}/${financialYear}/1`;
  const donorName = receipt.donorName || receipt.name || 'Kishore';
  const address = receipt.address || 'chennai';
  const phone = receipt.phone || receipt.mobile || '6383499063';
  const email = receipt.email || 'sivaharish638349@gmail.com';
  const panNo = receipt.panNo || '';
  const aadhaarNo = receipt.aadhaarNo || '';
  const donationType = receipt.donationType || receipt.type || 'Voluntary Donation';
  const donationHead = receipt.donationHead || 'Kind';
  const paymentMode = receipt.paymentMode || 'Cheque';
  const paymentDetails = receipt.paymentDetails || '';
  const receiptDate = receipt.receiptDate || receipt.date || '';
  const amount = Number(receipt.amount || 0);
  const amountInWords = receipt.amountInWords || convertNumberToWords(amount);

  // Dynamic Trust & Organization Info
  const trustAddress = receipt.trustAddress || receipt.addressLine || '';
  const trustPhone = receipt.trustPhone || '';
  const trustEmail = receipt.trustEmail || '';
  const trustWebsite = receipt.trustWebsite || '';
  const regdVal = receipt.trustRegNo || receipt.regNo || '';
  const panVal = receipt.trustPan || receipt.trustPanNo || '';
  const itVal = receipt.trust80G || '';
  const reg12A = receipt.trust12A || '';
  const reg12ADate = receipt.trust12ADate || '';
  const reg80GDate = receipt.trust80GDate || '';
  const signatoryName = receipt.signatoryName || '';
  const signatoryFather = receipt.signatoryFather || '';
  const signatoryPan = receipt.signatoryPan || '';

  const boxX = 28;
  const boxY = 20;
  const boxW = 595.28 - 56; // 539.28
  const boxH = 405;

  // ================= PAGE 1: OFFICIAL DONATION RECEIPT =================
  doc.rect(boxX, boxY, boxW, boxH).lineWidth(1).stroke('#000000');

  // --- Header: Foundation Logo & Info ---
  let logoDrawn = false;
  if (receipt.trustLogo && typeof receipt.trustLogo === 'string') {
    try {
      let base64Data = receipt.trustLogo;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      if (base64Data && base64Data.trim().length > 50) {
        const imgBuffer = Buffer.from(base64Data.trim(), 'base64');
        doc.image(imgBuffer, boxX + 12, boxY + 8, { fit: [65, 50] });
        logoDrawn = true;
      }
    } catch (e) {
      console.warn('Could not parse base64 trustLogo:', e.message);
    }
  }

  // If this specific admin has not uploaded a custom logo, display the default trust emblem
  if (!logoDrawn) {
    const defaultEmblemPath = path.join(__dirname, '..', 'assets', 'default_trust_emblem.png');
    if (fs.existsSync(defaultEmblemPath)) {
      try {
        doc.image(defaultEmblemPath, boxX + 12, boxY + 8, { fit: [65, 50] });
        logoDrawn = true;
      } catch (e) {
        console.warn('Could not draw default_trust_emblem.png:', e.message);
      }
    }
  }

  // Organization Titles (cleanly centered across header)
  doc.fontSize(13.5).font('Helvetica-Bold').fillColor('#000000')
     .text(trustName.toUpperCase(), boxX, boxY + 10, { width: boxW, align: 'center' });

  doc.fontSize(8).font('Helvetica').fillColor('#000000')
     .text(trustAddress || '', boxX, boxY + 26, { width: boxW, align: 'center' })
     .text(`Phone: ${trustPhone || ''}   Email: ${trustEmail || ''}`, boxX, boxY + 37, { width: boxW, align: 'center' })
     .text(`Website: ${trustWebsite || ''}`, boxX, boxY + 48, { width: boxW, align: 'center' });

  // Divider Line 1
  const d1 = boxY + 66;
  doc.moveTo(boxX, d1).lineTo(boxX + boxW, d1).lineWidth(0.8).stroke('#000000');

  // --- Registration Details Strip (perfectly centered without overlap) ---
  const w1 = doc.font('Helvetica').fontSize(8.5).widthOfString('Regd. No.: ')
           + doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(regdVal || 'N/A')
           + doc.font('Helvetica').fontSize(8.5).widthOfString('       PAN No.: ')
           + doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(panVal || 'N/A');
  const startX1 = Math.max(boxX + 10, boxX + (boxW - w1) / 2);

  doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
     .text('Regd. No.: ', startX1, d1 + 6, { continued: true })
     .font('Helvetica-Bold').text(regdVal || 'N/A', { continued: true })
     .font('Helvetica').text('       PAN No.: ', { continued: true })
     .font('Helvetica-Bold').text(panVal || 'N/A', { continued: false });

  const itLabel = 'I.T. Exemption Cert. No. (80G No.): ';
  const w2 = doc.font('Helvetica').fontSize(8.5).widthOfString(itLabel)
           + doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(itVal || 'N/A');
  const startX2 = Math.max(boxX + 10, boxX + (boxW - w2) / 2);

  doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
     .text(itLabel, startX2, d1 + 18, { continued: true })
     .font('Helvetica-Bold').text(itVal || 'N/A', { continued: false });

  // Divider Line 2
  const d2 = d1 + 32;
  doc.moveTo(boxX, d2).lineTo(boxX + boxW, d2).lineWidth(0.8).stroke('#000000');

  // --- Title: Donation Receipt ---
  const titleY = d2 + 8;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text('Donation Receipt', boxX, titleY, { width: boxW, align: 'center', underline: true });

  // --- Dynamic Watermark in Center Background ---
  const rawWatermark = (receipt.receiptWatermarkText !== undefined && receipt.receiptWatermarkText !== null && String(receipt.receiptWatermarkText).trim() !== '')
    ? String(receipt.receiptWatermarkText).trim()
    : ((receipt.trustWatermarkText !== undefined && receipt.trustWatermarkText !== null && String(receipt.trustWatermarkText).trim() !== '')
      ? String(receipt.trustWatermarkText).trim()
      : ((receipt.watermarkText !== undefined && receipt.watermarkText !== null && String(receipt.watermarkText).trim() !== '')
        ? String(receipt.watermarkText).trim()
        : ''));

  const watermarkText = rawWatermark ? rawWatermark.toUpperCase() : '';

  if (watermarkText) {
    doc.save();
    let wmFontSize = 54;
    const len = watermarkText.length;
    if (len > 30) {
      wmFontSize = 22;
    } else if (len > 20) {
      wmFontSize = 28;
    } else if (len > 14) {
      wmFontSize = 36;
    } else if (len > 8) {
      wmFontSize = 46;
    }
    doc.fontSize(wmFontSize).font('Helvetica-Bold').fillColor('#000000', 0.06)
       .text(watermarkText, boxX, d2 + 65, { width: boxW, align: 'center' });
    doc.restore();
  }

  // --- Form Underlined Fields ---
  let curY = titleY + 22;
  const lineSpacing = 24;
  const rightMargin = boxX + boxW - 16;

  // Helper to draw a label and underline
  const drawUnderlinedField = (label, val, x, y, width, extendToRight = false) => {
    doc.fontSize(8.5).font('Helvetica').fillColor('#000000').text(label, x, y);
    const labelWidth = doc.widthOfString(label);
    const valX = x + labelWidth + 3;
    const endX = extendToRight ? rightMargin : (x + width);
    const valWidth = endX - valX;
    if (val) {
      doc.font('Helvetica-Bold').fillColor('#000000').text(String(val), valX, y, { width: valWidth, ellipsis: true });
    }
    doc.moveTo(valX, y + 10).lineTo(endX, y + 10).lineWidth(0.7).stroke('#000000');
  };

  // Row 1: Receipt No, F.Y., Date
  drawUnderlinedField('Receipt No.: ', receiptNo, boxX + 16, curY, 185);
  drawUnderlinedField('F.Y.: ', financialYear, boxX + 215, curY, 115);
  drawUnderlinedField('Date: ', receiptDate, boxX + 345, curY, 0, true);
  curY += lineSpacing;

  // Row 2: Received with thanks from M/s. / Mr./Mrs.
  drawUnderlinedField('Received with thanks from M/s. / Mr./Mrs.: ', donorName, boxX + 16, curY, 0, true);
  curY += lineSpacing;

  // Row 3: Address
  drawUnderlinedField('Address: ', address, boxX + 16, curY, 0, true);
  curY += lineSpacing;

  // Row 4: Tel. No, Email, Donor's PAN
  drawUnderlinedField('Tel. No.: ', phone, boxX + 16, curY, 160);
  drawUnderlinedField('Email: ', email, boxX + 185, curY, 205);
  drawUnderlinedField("Donor's PAN: ", panNo, boxX + 400, curY, 0, true);
  curY += lineSpacing;

  // Row 5: Aadhaar No, Rupees
  drawUnderlinedField('Aadhaar No.: ', aadhaarNo, boxX + 16, curY, 160);
  drawUnderlinedField('Rupees: ', amountInWords, boxX + 185, curY, 0, true);
  curY += lineSpacing;

  // Row 6: on a/c. of, for, by
  drawUnderlinedField('on a/c. of: ', donationType, boxX + 16, curY, 175);
  drawUnderlinedField('for: ', donationHead, boxX + 200, curY, 185);
  drawUnderlinedField('by: ', paymentMode, boxX + 395, curY, 0, true);
  curY += lineSpacing;

  // Row 7: Donation Date, Payment Details
  drawUnderlinedField('Donation Date: ', receiptDate, boxX + 16, curY, 150);
  drawUnderlinedField('Payment Details: ', paymentDetails, boxX + 175, curY, 0, true);

  // --- Bottom: Bordered Amount Box, Centered Thank You & For Trust Name / Signature ---
  const bY = boxY + boxH - 44;
  const formattedAmount = !isNaN(amount) && amount > 0 ? Number(amount).toFixed(2) : '0.00';
  doc.rect(boxX + 16, bY, 125, 28).lineWidth(0.9).stroke('#000000');
  doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#000000').text(`Rs. ${formattedAmount}/-`, boxX + 22, bY + 8);

  // 1. Thank You centered horizontally in the bottom area
  doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#000000')
     .text('Thank You', boxX, bY + 10, { width: boxW, align: 'center' });

  // 2. For Trust Name (Right aligned above signature - positioned higher)
  const forTrustY = bY - 60;
  const forTrustWidth = rightMargin - (boxX + 230);
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#000000')
     .text(`For ${trustName.toUpperCase()}`, boxX + 230, forTrustY, { width: forTrustWidth, align: 'right' });

  // 3. Signature label & Signature Image or Name
  const sigY = bY + 8;
  doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
     .text('Signature: ', boxX + 340, sigY);

  let page1SigDrawn = false;
  const signatureRaw = receipt.trustSignature || receipt.signature;
  if (signatureRaw && typeof signatureRaw === 'string') {
    try {
      let base64Data = signatureRaw;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      if (base64Data && base64Data.trim().length > 50) {
        const sigBuffer = Buffer.from(base64Data.trim(), 'base64');
        doc.image(sigBuffer, boxX + 395, sigY - 14, { fit: [95, 32] });
        page1SigDrawn = true;
      }
    } catch (e) {
      console.warn('Could not render base64 trustSignature on page 1:', e.message);
    }
  }

  if (!page1SigDrawn) {
    const adminSignatory = signatoryName || receipt.signatoryName || 'Authorized Signatory';
    doc.save();
    doc.fontSize(9.5).font('Helvetica-Oblique').fillColor('#000000')
       .text(adminSignatory, boxX + 390, sigY, { width: 130, align: 'left' });
    doc.restore();
  }

  // ================= PAGE 2: VERIFICATION & STATUTORY NOTE =================
  const shouldAttachVerification =
    receipt.attachVerification === true ||
    String(receipt.attachVerification).toLowerCase() === 'yes' ||
    String(receipt.attachVerification).toLowerCase() === 'true';

  if (shouldAttachVerification) {
    doc.addPage({
      size: [595.28, 450],
      margins: { top: 20, bottom: 20, left: 28, right: 28 }
    });

    // Box 1: Verification Box
    const vY = 24;
    const vH = 200;
    doc.rect(boxX, vY, boxW, vH).lineWidth(1).stroke('#000000');

    // Title
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#000000').text('VERIFICATION', boxX, vY + 12, { width: boxW, align: 'center', underline: true });

    // Paragraph Text with Bold Dynamic Fields
    doc.fontSize(8.5).fillColor('#000000');
    doc.font('Helvetica').text('I, ', boxX + 16, vY + 34, {
      continued: true,
      width: boxW - 32,
      align: 'justify',
      lineGap: 3.5
    });
    doc.font('Helvetica-Bold').text(signatoryName || 'Authorized Signatory', { continued: true });
    
    if (signatoryFather && String(signatoryFather).trim()) {
      doc.font('Helvetica').text(' son/daughter/wife of ', { continued: true });
      doc.font('Helvetica-Bold').text(String(signatoryFather).trim(), { continued: true });
    }
    
    doc.font('Helvetica').text(
      ', solemnly declare that to the best of my knowledge and belief, the information given in the certificate is correct and complete and is in accordance with the provisions of the Income- Tax Act, 1961. I further declare that I am making this certificate in my capacity as Authorized Signatory and I am also competent to issue this certificate. I am holding PAN ',
      { continued: true }
    );
    doc.font('Helvetica-Bold').text(signatoryPan || 'N/A', { continued: false });

    // Date and Signature
    const sY = vY + vH - 34;
    doc.fontSize(8.5).font('Helvetica').fillColor('#000000').text('Date: ', boxX + 16, sY, { continued: true })
       .font('Helvetica-Bold').fillColor('#000000').text(receiptDate || 'N/A');

    doc.fontSize(8.5).font('Helvetica').fillColor('#000000').text('Signature: ', boxX + 330, sY);

    let sigDrawn = false;
    if (signatureRaw && typeof signatureRaw === 'string') {
      try {
        let base64Data = signatureRaw;
        if (base64Data.includes(',')) {
          base64Data = base64Data.split(',')[1];
        }
        if (base64Data && base64Data.trim().length > 50) {
          const sigBuffer = Buffer.from(base64Data.trim(), 'base64');
          doc.image(sigBuffer, boxX + 385, sY - 14, { fit: [95, 36] });
          sigDrawn = true;
        }
      } catch (e) {
        console.warn('Could not render base64 trustSignature on page 2:', e.message);
      }
    }

    // If this specific admin has not uploaded a signature photo, display their own name dynamically
    if (!sigDrawn) {
      const adminSignatory = signatoryName || receipt.signatoryName || 'Authorized Signatory';
      doc.save();
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#000000')
         .text(adminSignatory, boxX + 380, sY - 4, { width: 130, align: 'center' });
      doc.fontSize(7.5).font('Helvetica').fillColor('#000000')
         .text('(Authorized Signatory)', boxX + 380, sY + 9, { width: 130, align: 'center' });
      doc.restore();
    }

    // Box 2: Statutory Exemption Box
    const eY = vY + vH + 16;
    const eH = 86;
    doc.rect(boxX, eY, boxW, eH).lineWidth(1).stroke('#000000');

    // Row 1 of Box 2: 3 Columns
    doc.fontSize(8).font('Helvetica').fillColor('#000000').text('PAN: ', boxX + 16, eY + 12, { continued: true })
       .font('Helvetica-Bold').fillColor('#000000').text(panVal || 'N/A');

    doc.fontSize(8).font('Helvetica').fillColor('#000000').text('12A Regn No.: ', boxX + 180, eY + 12, { continued: true })
       .font('Helvetica-Bold').fillColor('#000000').text(reg12A || 'N/A');

    doc.fontSize(8).font('Helvetica').fillColor('#000000').text('Dated: ', boxX + 370, eY + 12, { continued: true })
       .font('Helvetica-Bold').fillColor('#000000').text(reg12ADate || 'N/A');

    // Row 2 of Box 2: 2 Columns
    doc.fontSize(8).font('Helvetica').fillColor('#000000').text('80G Regn No.: ', boxX + 16, eY + 28, { continued: true })
       .font('Helvetica-Bold').fillColor('#000000').text(itVal || 'N/A');

    doc.fontSize(8).font('Helvetica').fillColor('#000000').text('Dated: ', boxX + 180, eY + 28, { continued: true })
       .font('Helvetica-Bold').fillColor('#000000').text(reg80GDate || 'N/A');

    // Row 3 of Box 2: Note
    doc.fontSize(8).font('Helvetica').fillColor('#000000').text(
      'Charitable Institutions are not required to affix revenue stamp on receipt under schedule | ART - 53 exemption(b) of the Indian Stamp Act.',
      boxX + 16,
      eY + 48,
      { width: boxW - 32, lineGap: 2.5 }
    );
  }

  // ================= 80G VAULT CERTIFICATES =================
  const shouldAttach80g =
    receipt.attach80g === true ||
    String(receipt.attach80g).toLowerCase() === 'yes' ||
    String(receipt.attach80g).toLowerCase() === 'true';

  if (shouldAttach80g) {
    const certs = Array.isArray(receipt.certificates)
      ? receipt.certificates
      : (receipt.certificate ? [receipt.certificate] : []);

    const certList = certs.length > 0
      ? certs
      : (receipt.page1 || receipt.page2 ? [{ page1: receipt.page1, page2: receipt.page2 }] : []);

    for (const cert of certList) {
      if (!cert) continue;
      const pagesToRender = [cert.page1, cert.page2].filter(Boolean);

      for (const pageSrc of pagesToRender) {
        const imgBuffer = getImageBuffer(pageSrc);
        if (imgBuffer && imgBuffer.length > 50) {
          try {
            doc.addPage({
              size: [595.28, 841.89], // Standard A4 Page
              margins: { top: 20, bottom: 20, left: 20, right: 20 }
            });
            doc.image(imgBuffer, 20, 20, {
              fit: [555.28, 801.89],
              align: 'center',
              valign: 'center'
            });
          } catch (imgErr) {
            console.warn('Could not render 80G certificate image page:', imgErr.message);
          }
        }
      }
    }
  }
}

function generateReceiptPDF(receipt, res) {
  const doc = new PDFDocument({
    size: [595.28, 450],
    margins: { top: 20, bottom: 20, left: 28, right: 28 }
  });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="print-receipt.pdf"');
    doc.pipe(res);
  }

  renderReceiptPages(doc, receipt);
  doc.end();
  return doc;
}

function generateReceiptPDFBuffer(receipt) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [595.28, 450],
        margins: { top: 20, bottom: 20, left: 28, right: 28 }
      });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      renderReceiptPages(doc, receipt);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateReceiptPDF,
  generateReceiptPDFBuffer
};
