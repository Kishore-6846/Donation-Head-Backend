const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateInvoicePDF(invoiceData = {}, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 45,
    info: {
      Title: 'Tax Invoice - SP/DR/26-27/0031',
      Author: 'Solution Planets'
    }
  });

  if (res) {
    const filename = (invoiceData.invoiceNo || 'SP-DR-26-27-0031').replace(/[\/\\]/g, '-') + '.pdf';
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
     .text('Invoice #: ', contentWidth + margin - 150, invMetaY, { width: 150, align: 'right', continued: true })
     .font('Helvetica-Bold').text('SP/DR/26-27/0031');

  doc.fontSize(8.5).font('Helvetica')
     .text('Date: 10 Sep 2026', contentWidth + margin - 150, invMetaY + 13, { width: 150, align: 'right' });

  // 4. Bill To Section
  let billToY = 168;
  doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', leftX, billToY);
  billToY += 14;
  doc.fontSize(9.5).font('Helvetica-Bold').text(invoiceData.name || invoiceData.trustName || 'Trust Organization', leftX, billToY);
  billToY += 13;
  doc.fontSize(8.5).font('Helvetica')
     .text(`Address: ${invoiceData.address || ''}`, leftX, billToY);
  billToY += 12;
  doc.text(`State/Place of Supply: ${invoiceData.state || ''}`, leftX, billToY);
  billToY += 12;
  doc.text(`Email: ${invoiceData.email || ''}`, leftX, billToY);
  billToY += 12;
  doc.text(`Mobile: ${invoiceData.mobile || invoiceData.phone || ''}`, leftX, billToY);

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
  const x6 = x0 + tableWidth;

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
  doc.text('DonationReceipt.in Subscription - Base Plan', x1 + 6, row1Top + 7, { width: colDesc - 12 });
  doc.text('Validity : 08 Aug 2026 - 07 Aug 2027', x1 + 6, row1Top + 22, { width: colDesc - 12 });
  doc.text('Included Users : 1', x1 + 6, row1Top + 37, { width: colDesc - 12 });

  doc.text('997331', x2, row1Top + 22, { width: colHsn, align: 'center' });
  doc.text('1,200.00', x3, row1Top + 22, { width: colPrice - 6, align: 'right' });
  doc.text('1', x4, row1Top + 22, { width: colQty, align: 'center' });
  doc.text('1,200.00', x5, row1Top + 22, { width: colTotal - 6, align: 'right' });

  // Subtotal Row
  const subtotalTop = row1Top + row1Height;
  const subtotalHeight = 22;
  doc.rect(tableLeft, subtotalTop, tableWidth, subtotalHeight).lineWidth(0.8).stroke('#000000');
  doc.moveTo(x5, subtotalTop).lineTo(x5, subtotalTop + subtotalHeight).stroke('#000000');

  doc.fontSize(8.5).font('Helvetica');
  doc.text('Subtotal ( INR )', x0, subtotalTop + 6, { width: x5 - x0 - 8, align: 'right' });
  doc.text('1,200.00', x5, subtotalTop + 6, { width: colTotal - 6, align: 'right' });

  // IGST Row
  const igstTop = subtotalTop + subtotalHeight;
  const igstHeight = 22;
  doc.rect(tableLeft, igstTop, tableWidth, igstHeight).lineWidth(0.8).stroke('#000000');
  doc.moveTo(x5, igstTop).lineTo(x5, igstTop + igstHeight).stroke('#000000');

  doc.text('IGST (18%)', x0, igstTop + 6, { width: x5 - x0 - 8, align: 'right' });
  doc.text('216.00', x5, igstTop + 6, { width: colTotal - 6, align: 'right' });

  // Amount Chargeable Row
  const totalTop = igstTop + igstHeight;
  const totalHeight = 44;
  doc.rect(tableLeft, totalTop, tableWidth, totalHeight).lineWidth(0.8).stroke('#000000');
  doc.moveTo(x5, totalTop).lineTo(x5, totalTop + totalHeight).stroke('#000000');

  doc.fontSize(8.5).font('Helvetica')
     .text('Amount Chargeable (in words):', x0, totalTop + 6, { width: x5 - x0 - 8, align: 'right' });

  doc.fontSize(9).font('Helvetica-Bold')
     .text('INR One Thousand Four Hundred Sixteen Only/-', x0 + 10, totalTop + 24, { width: x5 - x0 - 20, align: 'right' });

  doc.fontSize(9).font('Helvetica-Bold')
     .text('INR 1,416.00', x5 - 30, totalTop + 24, { width: colTotal + 24, align: 'right' });

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
