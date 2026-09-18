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

function renderReceiptPages(doc, receipt) {
  const financialYear = receipt.financialYear || receipt.fy || '2026-2027';
  const trustName = receipt.trustName || 'Trust Organization';
  const trustPrefix = (trustName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase()) || 'REC';
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

  // Organization Titles (cleanly positioned beside logo if present, else centered across header)
  const headerTextX = logoDrawn ? (boxX + 75) : boxX;
  const headerTextW = logoDrawn ? (boxW - 85) : boxW;

  doc.fontSize(13.5).font('Helvetica-Bold')
     .text(trustName.toUpperCase(), headerTextX, boxY + 12, { width: headerTextW, align: 'center' });

  doc.fontSize(8).font('Helvetica')
     .text(trustAddress, headerTextX, boxY + 28, { width: headerTextW, align: 'center' })
     .text(`Phone: ${trustPhone}   Email: ${trustEmail}`, headerTextX, boxY + 39, { width: headerTextW, align: 'center' })
     .text(`Website: ${trustWebsite}`, headerTextX, boxY + 50, { width: headerTextW, align: 'center' });

  // Divider Line 1
  const d1 = boxY + 66;
  doc.moveTo(boxX, d1).lineTo(boxX + boxW, d1).lineWidth(0.8).stroke('#000000');

  // --- Registration Details Strip (perfectly centered without overlap) ---
  const w1 = doc.font('Helvetica').fontSize(8.5).widthOfString('Regd. No.: ')
           + doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(regdVal || 'N/A')
           + doc.font('Helvetica').fontSize(8.5).widthOfString('       PAN No.: ')
           + doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(panVal || 'N/A');
  const startX1 = Math.max(boxX + 10, boxX + (boxW - w1) / 2);

  doc.fontSize(8.5).font('Helvetica')
     .text('Regd. No.: ', startX1, d1 + 6, { continued: true })
     .font('Helvetica-Bold').text(regdVal || 'N/A', { continued: true })
     .font('Helvetica').text('       PAN No.: ', { continued: true })
     .font('Helvetica-Bold').text(panVal || 'N/A', { continued: false });

  const itLabel = 'I.T. Exemption Cert. No. (80G No.): ';
  const w2 = doc.font('Helvetica').fontSize(8.5).widthOfString(itLabel)
           + doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(itVal || 'N/A');
  const startX2 = Math.max(boxX + 10, boxX + (boxW - w2) / 2);

  doc.fontSize(8.5).font('Helvetica')
     .text(itLabel, startX2, d1 + 18, { continued: true })
     .font('Helvetica-Bold').text(itVal || 'N/A', { continued: false });

  // Divider Line 2
  const d2 = d1 + 32;
  doc.moveTo(boxX, d2).lineTo(boxX + boxW, d2).lineWidth(0.8).stroke('#000000');

  // --- Title: Donation Receipt ---
  const titleY = d2 + 8;
  doc.fontSize(11).font('Helvetica-Bold').text('Donation Receipt', boxX, titleY, { width: boxW, align: 'center', underline: true });

  // --- Dynamic Watermark in Center Background ---
  const watermarkWords = trustName.trim().split(/\s+/);
  const watermarkText = watermarkWords.length > 1 
    ? watermarkWords.map(w => w[0]).join('').slice(0, 5).toUpperCase()
    : trustName.slice(0, 4).toUpperCase();

  if (watermarkText) {
    doc.save();
    doc.fontSize(56).font('Helvetica-Bold').fillColor('#000000', 0.06)
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
      doc.font('Helvetica-Bold').text(String(val), valX, y, { width: valWidth, ellipsis: true });
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

  // --- Bottom: Bordered Amount Box & Thank You ---
  const bY = boxY + boxH - 44;
  doc.rect(boxX + 16, bY, 125, 28).lineWidth(0.9).stroke('#000000');
  doc.fontSize(10.5).font('Helvetica-Bold').text(`Rs. ${amount}/-`, boxX + 22, bY + 8);

  // Thank You centered in the remaining right area
  const thankX = boxX + 141;
  const thankW = rightMargin - thankX;
  doc.fontSize(11).font('Helvetica-Bold').text('Thank You', thankX, bY + 8, { width: thankW, align: 'center' });

  // ================= PAGE 2: VERIFICATION & STATUTORY NOTE =================
  doc.addPage({
    size: [595.28, 450],
    margins: { top: 20, bottom: 20, left: 28, right: 28 }
  });

  // Box 1: Verification Box
  const vY = 24;
  const vH = 200;
  doc.rect(boxX, vY, boxW, vH).lineWidth(1).stroke('#000000');

  // Title
  doc.fontSize(10.5).font('Helvetica-Bold').text('VERIFICATION', boxX, vY + 12, { width: boxW, align: 'center', underline: true });

  // Paragraph Text
  const declarationText =
    `I, ${signatoryName || 'Authorized Signatory'}${signatoryFather ? ` son/daughter/wife of ${signatoryFather}` : ''}, solemnly declare ` +
    'that to the best of my knowledge and belief, the information given in the certificate is correct and ' +
    'complete and is in accordance with the provisions of the Income- Tax Act, 1961. I further declare that ' +
    'I am making this certificate in my capacity as Authorized Signatory and I am also competent to issue this ' +
    `certificate. I am holding PAN ${signatoryPan || 'N/A'}`;

  doc.fontSize(8.5).font('Helvetica').text(declarationText, boxX + 16, vY + 34, {
    width: boxW - 32,
    align: 'justify',
    lineGap: 3.5
  });

  // Date and Signature
  const sY = vY + vH - 34;
  doc.fontSize(8.5).font('Helvetica-Bold').text(`Date: ${receiptDate}`, boxX + 16, sY);

  doc.text('Signature: ', boxX + 330, sY);

  let sigDrawn = false;
  const signatureRaw = receipt.trustSignature || receipt.signature;
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
      console.warn('Could not render base64 trustSignature:', e.message);
    }
  }

  // If this specific admin has not uploaded a signature photo, display their own name dynamically
  if (!sigDrawn) {
    const adminSignatory = signatoryName || receipt.signatoryName || 'Authorized Signatory';
    doc.fontSize(10).font('Helvetica-Oblique').fillColor('#0f172a')
       .text(adminSignatory, boxX + 380, sY - 4, { width: 130, align: 'center' });
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748b')
       .text('(Authorized Signatory)', boxX + 380, sY + 9, { width: 130, align: 'center' });
  }

  // Box 2: Statutory Exemption Box
  const eY = vY + vH + 16;
  const eH = 86;
  doc.rect(boxX, eY, boxW, eH).lineWidth(1).stroke('#000000');

  // Row 1 of Box 2: 3 Columns
  doc.fontSize(8).font('Helvetica-Bold').text('PAN: ', boxX + 16, eY + 12, { continued: true })
     .font('Helvetica').text(panVal);

  doc.fontSize(8).font('Helvetica-Bold').text('12A Regn No.: ', boxX + 180, eY + 12, { continued: true })
     .font('Helvetica').text(reg12A);

  doc.fontSize(8).font('Helvetica-Bold').text('Dated: ', boxX + 370, eY + 12, { continued: true })
     .font('Helvetica').text(reg12ADate);

  // Row 2 of Box 2: 2 Columns
  doc.fontSize(8).font('Helvetica-Bold').text('80G Regn No.: ', boxX + 16, eY + 28, { continued: true })
     .font('Helvetica').text(itVal);

  doc.fontSize(8).font('Helvetica-Bold').text('Dated: ', boxX + 180, eY + 28, { continued: true })
     .font('Helvetica').text(reg80GDate);

  // Row 3 of Box 2: Note
  doc.fontSize(8).font('Helvetica').text(
    'Charitable Institutions are not required to affix revenue stamp on receipt under schedule | ART - 53 exemption(b) of the Indian Stamp Act.',
    boxX + 16,
    eY + 48,
    { width: boxW - 32, lineGap: 2.5 }
  );
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
