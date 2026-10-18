/**
 * Password hashing with Argon2id.
 *
 * - Never stores plaintext.
 * - Uses argon2's recommended parameters (memory-hard, time-hard).
 * - Verification is constant-time via argon2.verify.
 * - Rehash-on-login when parameters change.
 *
 * Dependency: `argon2` (native). Add to package.json:
 *   "argon2": "^0.41.1"
 */

import argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum for Argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length < 8) {
    throw new Error("PASSWORD_TOO_SHORT");
  }
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export async function needsRehash(hash: string): Promise<boolean> {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}