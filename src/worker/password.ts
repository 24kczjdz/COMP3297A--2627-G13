import { kPbkdf2Iterations } from "../shared/constants";

/**
 * Summary: Encode bytes as lowercase hexadecimal text.
 * Parameters: bytes is a non-null byte array; empty arrays are allowed.
 * Return Value: Two hex characters per byte, or an empty string for no bytes.
 * Side Effects & Constraints: Allocates a string; does not mutate the input array.
 */
export function BytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Summary: Decode trusted hexadecimal credential data into bytes.
 * Parameters: hex is a non-null, even-length hexadecimal string; callers ensure
 * the stored format is valid because this helper does not validate it.
 * Return Value: A new byte array; an empty string produces an empty array.
 * Side Effects & Constraints: Allocates managed memory; no input mutation.
 */
export function HexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Summary: Generate cryptographically random bytes for salts or session IDs.
 * Parameters: size is an integer from 0 through 65536.
 * Return Value: A new byte array; allocation or Web Crypto errors propagate.
 * Side Effects & Constraints: Uses the runtime random generator; caller owns the array.
 */
export function RandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Summary: Derive the stored password hash using PBKDF2-SHA-256.
 * Parameters: password is a non-null string validated by the caller; salt is a
 * non-null byte array, normally 16 random bytes for a new credential.
 * Return Value: A promise of 32 hash bytes; Web Crypto failures reject it.
 * Side Effects & Constraints: Performs the configured PBKDF2 work and allocates
 * managed buffers; does not persist credentials or mutate the supplied salt.
 */
export async function HashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: kPbkdf2Iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Summary: Compare equal-length byte sequences without early byte mismatch exits.
 * Parameters: left and right are non-null byte arrays; empty arrays are allowed.
 * Return Value: True for identical bytes, false for a length or content mismatch.
 * Side Effects & Constraints: Pure; visits all bytes when lengths match. JavaScript
 * runtime execution is not a formal constant-time guarantee.
 */
export function TimingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/**
 * Summary: Compare a supplied password with a stored salted hash.
 * Parameters: password is non-null; salt_hex and hash_hex are valid even-length
 * hex strings from trusted credential storage.
 * Return Value: Resolves to a match boolean; crypto/allocation failures reject.
 * Side Effects & Constraints: Derives a candidate hash; does not write credentials.
 */
export async function PasswordMatches(password: string, salt_hex: string, hash_hex: string): Promise<boolean> {
  const actual = await HashPassword(password, HexToBytes(salt_hex));
  return TimingSafeEqual(actual, HexToBytes(hash_hex));
}
