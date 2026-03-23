import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const APP_NAME = "YT Payroll";

/** Tạo secret mới và trả về base32 string */
export function generateTOTPSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/** Tạo otpauth:// URI để encode vào QR code */
export function getTOTPUri(email: string, secret: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

/** Tạo QR code dưới dạng data URL (PNG base64) */
export async function generateQRCodeDataURL(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 256, margin: 1 });
}

/** Xác thực TOTP code. Cho phép lệch ±1 bước (30s) để bù clock drift */
export function verifyTOTP(token: string, secret: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
