import { z } from 'zod';

export const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
export const password = z.string().min(12).max(128);
export const challengeId = z.uuid();
export const smsCode = z.string().regex(/^[0-9]{6}$/);
export const signupBody = z.strictObject({
  phone,
  password,
  displayName: z.string().trim().min(1).max(100),
});
export const loginBody = z.strictObject({
  phone,
  password: z.string().min(1).max(128),
});
export const verifyBody = z.strictObject({ challengeId, code: smsCode });
export const refreshBody = z.strictObject({
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const phoneBody = z.strictObject({ phone });
export const resetBody = z.strictObject({
  challengeId,
  code: smsCode,
  password,
});
export const changeBody = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  password,
});
export const passwordBody = z.strictObject({
  password: z.string().min(1).max(128),
});
export const factorProof = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('totp'), code: smsCode }),
  z.strictObject({
    method: z.literal('recovery'),
    code: z.string().regex(/^[A-Za-z0-9_-]{20}$/),
  }),
]);
export const factorBody = z.strictObject({ challengeId, proof: factorProof });
export const secureFactorBody = z.strictObject({
  password: z.string().min(1).max(128),
  proof: factorProof,
});
export const codeBody = z.strictObject({ code: smsCode });
export const logoutBody = z.strictObject({
  allSessions: z.boolean().default(false),
});
export const resendBody = z.strictObject({ challengeId });

export const identitySchemas = {
  Signup: signupBody,
  Login: loginBody,
  VerifyCode: verifyBody,
  Refresh: refreshBody,
  Phone: phoneBody,
  ResetPassword: resetBody,
  ChangePassword: changeBody,
  Password: passwordBody,
  VerifyFactor: factorBody,
  SecureFactor: secureFactorBody,
  ConfirmFactor: codeBody,
  Logout: logoutBody,
  ResendCode: resendBody,
};
