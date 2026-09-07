import crypto from 'crypto';

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8'))
    .digest('hex')}`;

  const sigBuffer = Buffer.from(signatureHeader, 'utf-8');
  const expBuffer = Buffer.from(expectedSignature, 'utf-8');

  if (sigBuffer.length !== expBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expBuffer);
}
