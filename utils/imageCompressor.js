const zlib = require('zlib');

const COMPRESSION_PREFIX = '__GZ:';

/**
 * Losslessly compresses an image string / base64 Data URL using zlib deflate.
 * Guarantees 100% zero visual quality loss (exact bit-for-bit reconstruction upon decompression).
 */
function compressImageString(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  // Already compressed
  if (trimmed.startsWith(COMPRESSION_PREFIX) || trimmed.startsWith('gz:')) {
    return trimmed;
  }

  try {
    const buffer = Buffer.from(trimmed, 'utf8');
    // Only compress if size is substantial (e.g. > 100 bytes)
    if (buffer.length < 100) {
      return trimmed;
    }
    const compressed = zlib.deflateSync(buffer, { level: 9 });
    const compressedStr = `${COMPRESSION_PREFIX}${compressed.toString('base64')}`;
    
    // Only return compressed if it actually saved space
    return compressedStr.length < trimmed.length ? compressedStr : trimmed;
  } catch (e) {
    console.warn('Image string compression error (fallback to uncompressed):', e.message);
    return trimmed;
  }
}

/**
 * Losslessly decompresses a previously compressed image string.
 * If the string was not compressed, returns it as-is (100% backward compatible).
 */
function decompressImageString(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith(COMPRESSION_PREFIX)) {
    try {
      const payload = trimmed.slice(COMPRESSION_PREFIX.length);
      const buffer = Buffer.from(payload, 'base64');
      const decompressed = zlib.inflateSync(buffer);
      return decompressed.toString('utf8');
    } catch (e) {
      console.warn('Image decompression error:', e.message);
      return trimmed;
    }
  }

  if (trimmed.startsWith('gz:')) {
    try {
      const payload = trimmed.slice(3);
      const buffer = Buffer.from(payload, 'base64');
      const decompressed = zlib.inflateSync(buffer);
      return decompressed.toString('utf8');
    } catch (e) {
      console.warn('Image decompression error (gz prefix):', e.message);
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * Prepares certificate data for DB storage with compressed image fields.
 */
function prepareCertificateForStorage(cert) {
  if (!cert || typeof cert !== 'object') return cert;
  const copy = { ...cert };
  if (copy.page1) copy.page1 = compressImageString(copy.page1);
  if (copy.page2) copy.page2 = compressImageString(copy.page2);
  return copy;
}

/**
 * Hydrates certificate data by decompressing image fields for client consumption.
 */
function hydrateCertificate(cert) {
  if (!cert || typeof cert !== 'object') return cert;
  return {
    ...cert,
    page1: decompressImageString(cert.page1),
    page2: decompressImageString(cert.page2)
  };
}

module.exports = {
  compressImageString,
  decompressImageString,
  prepareCertificateForStorage,
  hydrateCertificate
};
