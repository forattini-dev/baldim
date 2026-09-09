import * as OTPAuth from 'otpauth';
import { MFAManager } from '../src/concerns/mfa-manager.js';

describe('Identity MFA optional integrations', () => {
  it('generates and verifies TOTP, backup codes, and QR data', async () => {
    const manager = new MFAManager({
      issuer: 'Baldim Test',
      digits: 6,
      period: 30,
      backupCodesCount: 4,
      backupCodeLength: 10,
    });
    await manager.initialize();

    const enrollment = manager.generateEnrollment('user@example.com');
    expect(enrollment.backupCodes).toHaveLength(4);
    expect(enrollment.backupCodes.every(code => code.length === 10)).toBe(true);

    const totp = new OTPAuth.TOTP({
      issuer: 'Baldim Test',
      label: 'user@example.com',
      algorithm: enrollment.algorithm,
      digits: enrollment.digits,
      period: enrollment.period,
      secret: OTPAuth.Secret.fromBase32(enrollment.secret),
    });
    expect(manager.verifyTOTP(enrollment.secret, totp.generate())).toBe(true);

    const hashes = await manager.hashBackupCodes(enrollment.backupCodes);
    expect(await manager.verifyBackupCode(enrollment.backupCodes[2]!, hashes)).toBe(2);
    expect(await manager.verifyBackupCode('not-a-backup-code', hashes)).toBe(-1);

    const qrCode = await manager.generateQRCodeDataURL(enrollment.qrCodeUrl);
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
  });
});
