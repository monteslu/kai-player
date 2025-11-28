/**
 * QR Code Generator Utility
 * Generates QR codes to canvas for server URLs
 */

import QRCode from 'qrcode';

/**
 * Generate QR code data URL
 * @param {string} text - Text to encode (server URL)
 * @param {Object} options - QR code options
 * @returns {Promise<string>} Data URL of QR code image
 */
export async function generateQRCode(text, options = {}) {
  const defaultOptions = {
    width: 200,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
    ...options,
  };

  try {
    const dataUrl = await QRCode.toDataURL(text, defaultOptions);
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
}

/**
 * Generate QR code to an offscreen canvas
 * @param {string} text - Text to encode (server URL)
 * @param {number} size - Size of QR code in pixels
 * @returns {Promise<HTMLCanvasElement>} Canvas with QR code
 */
export async function generateQRCodeCanvas(text, size = 200) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  try {
    await QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
    return canvas;
  } catch (error) {
    console.error('Error generating QR code canvas:', error);
    return null;
  }
}

/**
 * Generate QR code with label overlay
 * @param {string} text - Text to encode (server URL)
 * @param {string} label - Label text to display below QR code
 * @param {number} qrSize - Size of QR code
 * @returns {Promise<HTMLCanvasElement>} Canvas with QR code and label
 */
export async function generateQRCodeWithLabel(text, label, qrSize = 200) {
  // Generate QR code
  const qrCanvas = await generateQRCodeCanvas(text, qrSize);
  if (!qrCanvas) return null;

  // Create final canvas with extra space for label
  const padding = 20;
  const labelHeight = 40;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = qrSize + padding * 2;
  finalCanvas.height = qrSize + labelHeight + padding * 2;

  const ctx = finalCanvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  // Draw QR code
  ctx.drawImage(qrCanvas, padding, padding);

  // Draw label
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(label, finalCanvas.width / 2, qrSize + padding + 25);

  return finalCanvas;
}
