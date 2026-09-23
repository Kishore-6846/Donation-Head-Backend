const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper to convert number to Indian Rupees words
function numberToWordsINR(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'INR Zero Only/-';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelowThousand(n) {
    let str = '';
    if (n >= 100) {
      str += units[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += units[n] + ' ';
    }
    return str.trim();
  }

  let crore = Math.floor(num / 10000000);
  let lakh = Math.floor((num % 10000000) / 100000);
  let thousand = Math.floor((num % 100000) / 1000);
  let remainder = num % 1000;

  let result = '';
  if (crore > 0) result += convertBelowThousand(crore) + ' Crore ';
  if (lakh > 0) result += convertBelowThousand(lakh) + ' Lakh ';
  if (thousand > 0) result += convertBelowThousand(thousand) + ' Thousand ';
  if (remainder > 0) result += convertBelowThousand(remainder) + ' ';

  return `INR ${result.trim()} Only/-`;
}

function generateInvoicePDF(invoiceData = {}, res) {
  const invoiceNo = invoiceData.invoiceNo || 'SP/DR/26-27/0031';
  const invoiceDate = invoiceData.invoiceDate || invoiceData.date || '10 Sep 2026';

  const trustName = invoiceData.trustName || invoiceData.name || 'Trust Organization';
  const address = invoiceData.address || '';
  const state = invoiceData.state || 'Tamil Nadu';
  const email = invoiceData.email || '';
  const mobile = invoiceData.mobile || invoiceData.phone || '';

  const rawPlanName = invoiceData.planName || invoiceData.plan || 'Base Plan';
  const displayPlanName = rawPlanName.startsWith('DonationReceipt.in Subscription')
    ? rawPlanName
    : `DonationReceipt.in Subscription - ${rawPlanName.includes('Plan') ? rawPlanName : rawPlanName + ' Plan'}`;

  const validityText = invoiceData.validityText || '08 Aug 2026 - 07 Aug 2027';
  const includedUsers = invoiceData.includedUsers
    ? String(invoiceData.includedUsers).replace(/[^0-9]/g, '') || '1'
    : '1';

  const basePriceNum = Number(invoiceData.basePrice || invoiceData.price || 1200);
  const gstAmountNum = Number(invoiceData.gstAmount || Math.round(basePriceNum * 0.18 * 100) / 100);
  const totalAmountNum = Number(invoiceData.totalAmount || (basePriceNum + gstAmountNum));

  const basePriceFormatted = invoiceData.basePriceFormatted || basePriceNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gstAmountFormatted = invoiceData.gstAmountFormatted || gstAmountNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalAmountFormatted = invoiceData.totalAmountFormatted || totalAmountNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const amountInWords = invoiceData.amountInWords || numberToWordsINR(totalAmountNum);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 45,
    info: {
      Title: `Tax Invoice - ${invoiceNo}`,
      Author: 'Solution Planets'
    }
  });

  if (res) {
    const filename = invoiceNo.replace(/[\/\\]/g, '-') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    doc.pipe(res);
  }

  const pageWidth = 595.28;
  const margin = 45;
  const contentWidth = pageWidth - margin * 2; // 505.28

  // 1. Top Title: TAX INVOICE
  doc.fontSize(16).font('Helvetica-Bold')
     .text('TAX INVOICE', margin, 45, { width: contentWidth, align: 'center' });

  // 2. Company Details (Left)
  const leftX = margin;
  let currentY = 70;

  doc.fontSize(10).font('Helvetica-Bold').text('Solution Planets', leftX, currentY);
  currentY += 14;

  doc.fontSize(8.5).font('Helvetica')
     .text('6, Naresh Smruti, Mulund West', leftX, currentY);
  currentY += 12;
  doc.text('Mumbai - 400080, Maharashtra, India.', leftX, currentY);
  currentY += 12;
  doc.text('GSTIN: 27ABOFS3036K1ZR', leftX, currentY);
  currentY += 12;
  doc.text('Email: info@solutionplanets.com', leftX, currentY);
  currentY += 12;
  doc.text('Mobile: +91-9082151500', leftX, currentY);

  // 3. Logo & Invoice Info (Right)
  const logoPrimary = path.join(__dirname, '../assets/Receipt-Nav-Logo.png');
  const logoFallback = path.join(__dirname, '../../frontend/src/assets/Receipt-Nav-Logo.png');
  const logoPath = fs.existsSync(logoPrimary) ? logoPrimary : logoFallback;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, contentWidth + margin - 65, 52, { width: 65, height: 65 });
  }

  const invMetaY = 124;
  doc.fontSize(8.5).font('Helvetica')
     .text('Invoice #: ', contentWidth + margin - 180, invMetaY, { width: 180, align: 'right', continued: true })
     .font('Helvetica-Bold').text(invoiceNo);

  doc.fontSize(8.5).font('Helvetica')
     .text(`Date: ${invoiceDate}`, contentWidth + margin - 180, invMetaY + 13, { width: 180, align: 'right' });

  // 4. Bill To Section
  let billToY = 168;
  doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', leftX, billToY);
  billToY += 14;
  doc.fontSize(9.5).font('Helvetica-Bold').text(trustName, leftX, billToY);
  billToY += 13;
  if (address && address.trim()) {
    doc.fontSize(8.5).font('Helvetica').text(address.trim(), leftX, billToY);
    billToY += 12;
  }
  doc.fontSize(8.5).font('Helvetica').text(`State/Place of Supply: ${state || 'Tamil Nadu'}`, leftX, billToY);
  billToY += 12;
  doc.text(`Email: ${email || ''}`, leftX, billToY);
  billToY += 12;
  doc.text(`Mobile: ${mobile || ''}`, leftX, billToY);

  // 5. Invoice Table
  const tableTop = 265;
  const tableLeft = margin;
  const tableWidth = contentWidth;

  // Column widths matching exact ratio in reference PDF
  const colSr = 28;
  const colDesc = 240;
  const colHsn = 62;
  const colPrice = 75;
  const colQty = 35;
  const colTotal = tableWidth - (colSr + colDesc + colHsn + colPrice + colQty); // ~65.28

  const x0 = tableLeft;
  const x1 = x0 + colSr;
  const x2 = x1 + colDesc;
  const x3 = x2 + colHsn;
  const x4 = x3 + colPrice;
  const x5 = x4 + colQty;

  // Table Header
  const headerHeight = 22;
  doc.rect(tableLeft, tableTop, tableWidth, headerHeight).lineWidth(0.8).stroke('#000000');

  // Header vertical divider lines
  doc.moveTo(x1, tableTop).lineTo(x1, tableTop + headerHeight).stroke('#000000');
  doc.moveTo(x2, tableTop).lineTo(x2, tableTop + headerHeight).stroke('#000000');
  doc.moveTo(x3, tableTop).lineTo(x3, tableTop + headerHeight).stroke('#000000');
  doc.moveTo(x4, tableTop).lineTo(x4, tableTop + headerHeight).stroke('#000000');
  doc.moveTo(x5, tableTop).lineTo(x5, tableTop + headerHeight).stroke('#000000');

  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Sr', x0, tableTop + 6, { width: colSr, align: 'center' });
  doc.text('Description', x1 + 6, tableTop + 6, { width: colDesc - 12, align: 'left' });
  doc.text('HSN', x2, tableTop + 6, { width: colHsn, align: 'center' });
  doc.text('Price', x3, tableTop + 6, { width: colPrice - 6, align: 'right' });
  doc.text('Qty', x4, tableTop + 6, { width: colQty, align: 'center' });
  doc.text('Total', x5, tableTop + 6, { width: colTotal - 6, align: 'right' });

  // Row 1
  const row1Top = tableTop + headerHeight;
  const row1Height = 52;
  doc.rect(tableLeft, row1Top, tableWidth, row1Height).lineWidth(0.8).stroke('#000000');

  doc.moveTo(x1, row1Top).lineTo(x1, row1Top + row1Height).stroke('#000000');
  doc.moveTo(x2, row1Top).lineTo(x2, row1Top + row1Height).stroke('#000000');
  doc.moveTo(x3, row1Top).lineTo(x3, row1Top + row1Height).stroke('#000000');
  doc.moveTo(x4, row1Top).lineTo(x4, row1Top + row1Height).stroke('#000000');
  doc.moveTo(x5, row1Top).lineTo(x5, row1Top + row1Height).stroke('#000000');

  doc.fontSize(8.5).font('Helvetica');
  doc.text('1', x0, row1Top + 8, { width: colSr, align: 'center' });

  // Description text
  doc.text(displayPlanName, x1 + 6, row1Top + 7, { width: colDesc - 12 });
  doc.text(`Validity : ${validityText}`, x1 + 6, row1Top + 22, { width: colDesc - 12 });
  doc.text(`Included Users : ${includedUsers}`, x1 + 6, row1Top + 37, { width: colDesc - 12 });

  doc.text('997331', x2, row1Top + 22, { width: colHsn, align: 'center' });
  doc.text(basePriceFormatted, x3, row1Top + 22, { width: colPrice - 6, align: 'right' });
  doc.text('1', x4, row1Top + 22, { width: colQty, align: 'center' });
  doc.text(basePriceFormatted, x5, row1Top + 22, { width: colTotal - 6, align: 'right' });

  // Subtotal Row
  const subtotalTop = row1Top + row1Height;
  const subtotalHeight = 22;
  doc.rect(tableLeft, subtotalTop, tableWidth, subtotalHeight).lineWidth(0.8).stroke('#000000');
  doc.moveTo(x5, subtotalTop).lineTo(x5, subtotalTop + subtotalHeight).stroke('#000000');

  doc.fontSize(8.5).font('Helvetica');
  doc.text('Subtotal ( INR )', x0, subtotalTop + 6, { width: x5 - x0 - 8, align: 'right' });
  doc.text(basePriceFormatted, x5, subtotalTop + 6, { width: colTotal - 6, align: 'right' });

  // IGST Row
  const igstTop = subtotalTop + subtotalHeight;
  const igstHeight = 22;
  doc.rect(tableLeft, igstTop, tableWidth, igstHeight).lineWidth(0.8).stroke('#000000');
  doc.moveTo(x5, igstTop).lineTo(x5, igstTop + igstHeight).stroke('#000000');

  doc.text('IGST (18%)', x0, igstTop + 6, { width: x5 - x0 - 8, align: 'right' });
  doc.text(gstAmountFormatted, x5, igstTop + 6, { width: colTotal - 6, align: 'right' });

  // Amount Chargeable Row
  const totalTop = igstTop + igstHeight;
  const totalHeight = 44;
  doc.rect(tableLeft, totalTop, tableWidth, totalHeight).lineWidth(0.8).stroke('#000000');
  doc.moveTo(x5, totalTop).lineTo(x5, totalTop + totalHeight).stroke('#000000');

  doc.fontSize(8.5).font('Helvetica')
     .text('Amount Chargeable (in words):', x0, totalTop + 6, { width: x5 - x0 - 8, align: 'right' });

  doc.fontSize(9).font('Helvetica-Bold')
     .text(amountInWords, x0 + 10, totalTop + 24, { width: x5 - x0 - 20, align: 'right' });

  doc.fontSize(9).font('Helvetica-Bold')
     .text(`INR ${totalAmountFormatted}`, x5 - 30, totalTop + 24, { width: colTotal + 24, align: 'right' });

  // 6. Footer Notes
  const footerY = totalTop + totalHeight + 35;
  doc.fontSize(8.5).font('Helvetica-Bold')
     .text('SUBJECT TO MUMBAI JURISDICTION', margin, footerY, { width: contentWidth, align: 'center' });

  doc.fontSize(8).font('Helvetica')
     .text('This is a system generated invoice.', margin, footerY + 12, { width: contentWidth, align: 'center' });

  doc.end();
  return doc;
}

function generateInvoicePDFBuffer(invoiceData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 45
    });

    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    doc.on('error', reject);

    generateInvoicePDF(invoiceData, null);
  });
}

module.exports = {
  generateInvoicePDF,
  generateInvoicePDFBuffer
};
