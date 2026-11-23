import { describe, expect, it } from '@jest/globals';
import {
  signupBody,
  factorBody,
  verifyBody,
  refreshBody,
} from './identity.schemas.js';
import {
  profileBody,
  placeBody,
} from '../../accounts/contracts/account.schemas.js';

const signup = {
  phone: '+237612345678',
  displayName: 'Ada Example',
  password: 'a long passphrase',
};
describe('identity and account request boundaries (not executed without authorization)', () => {
  it('preserves a single display name and password whitespace', () => {
    expect(
      signupBody.parse({
        ...signup,
        displayName: '  Ada Example  ',
        password: '  a long passphrase  ',
      }),
    ).toMatchObject({
      displayName: 'Ada Example',
      password: '  a long passphrase  ',
    });
  });
  it.each(['roles', 'status', 'userId', 'phoneVerifiedAt'])(
    'rejects self-assigned %s',
    (field) => {
      expect(
        signupBody.safeParse({ ...signup, [field]: 'ADMIN' }).success,
      ).toBe(false);
    },
  );
  it.each(['612345678', '+237', '+0237612345678', '+237612345678more'])(
    'rejects noncanonical phone %s',
    (phone) => {
      expect(signupBody.safeParse({ ...signup, phone }).success).toBe(false);
    },
  );
  it('rejects weak/oversized passwords and invalid challenge IDs', () => {
    expect(signupBody.safeParse({ ...signup, password: 'short' }).success).toBe(
      false,
    );
    expect(
      signupBody.safeParse({ ...signup, password: 'x'.repeat(129) }).success,
    ).toBe(false);
    expect(
      verifyBody.safeParse({ challengeId: '../other-account', code: '123456' })
        .success,
    ).toBe(false);
  });
  it('does not accept a JWT as a refresh credential or SMS proof as a recovery code', () => {
    expect(
      refreshBody.safeParse({ refreshToken: 'header.payload.signature' })
        .success,
    ).toBe(false);
    expect(
      factorBody.safeParse({
        challengeId: '11111111-1111-4111-8111-111111111111',
        proof: { method: 'recovery', code: '123456' },
      }).success,
    ).toBe(false);
  });
  it('rejects profile ownership/role changes and empty updates', () => {
    expect(
      profileBody.safeParse({ userId: 'another-user', displayName: 'A' })
        .success,
    ).toBe(false);
    expect(profileBody.safeParse({ roles: ['ADMIN'] }).success).toBe(false);
    expect(profileBody.safeParse({}).success).toBe(false);
  });
  it('validates finite coordinates without accepting client ownership fields', () => {
    const place = {
      kind: 'home',
      name: 'Home',
      label: 'Example address',
      coordinate: { latitude: 4.05, longitude: 9.7 },
    };
    expect(placeBody.safeParse(place).success).toBe(true);
    expect(placeBody.safeParse({ ...place, userId: 'other' }).success).toBe(
      false,
    );
    expect(
      placeBody.safeParse({
        ...place,
        coordinate: { latitude: 91, longitude: 0 },
      }).success,
    ).toBe(false);
    expect(
      placeBody.safeParse({
        ...place,
        coordinate: { latitude: Number.NaN, longitude: 0 },
      }).success,
    ).toBe(false);
  });
});
