/**
 * Web Crypto API Helpers for Client-Side End-to-End Encryption (E2EE)
 * Using RSA-OAEP for asymmetric key exchange and AES-GCM for fast, secure message & file encryption.
 */

// Simple base64 conversions working with binary data
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    if (!base64) {
      return new ArrayBuffer(0);
    }
    // Handle data URL input (e.g. data:image/png;base64,...)
    let cleanBase64 = base64;
    if (base64.includes("base64,")) {
      cleanBase64 = base64.split("base64,")[1];
    }
    // Remove any trailing/leading whitespace and newlines
    cleanBase64 = cleanBase64.replace(/\s/g, "").trim();

    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (err) {
    console.warn("base64ToArrayBuffer failed to parse base64 string safely:", err);
    return new ArrayBuffer(0);
  }
}

// Generate standard RSA-OAEP Key Pair for the user
export async function generateRsaKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyJwk,
    privateKeyJwk,
  };
}

// Generate room-specific symmetric AES-GCM Key
export async function generateAesKey(): Promise<{
  key: CryptoKey;
  rawKeyBytes: ArrayBuffer;
}> {
  const key = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );

  const rawKeyBytes = await window.crypto.subtle.exportKey("raw", key);
  return { key, rawKeyBytes };
}

// Encrypt the symmetric AES key using recipient's RSA public key Jwk
export async function encryptAesKeyWithRsa(
  aesRawKey: ArrayBuffer,
  rsaPublicKeyJwk: JsonWebKey
): Promise<string> {
  const rsaKey = await window.crypto.subtle.importKey(
    "jwk",
    rsaPublicKeyJwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaKey,
    aesRawKey
  );

  return arrayBufferToBase64(encryptedBuffer);
}

// Decrypt the symmetric AES key using original user's RSA private key Jwk
export async function decryptAesKeyWithRsa(
  encryptedAesKeyBase64: string,
  rsaPrivateKeyJwk: JsonWebKey
): Promise<ArrayBuffer> {
  const rsaKey = await window.crypto.subtle.importKey(
    "jwk",
    rsaPrivateKeyJwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );

  const encryptedBuffer = base64ToArrayBuffer(encryptedAesKeyBase64);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaKey,
    encryptedBuffer
  );

  return decryptedBuffer;
}

// Encrypt string plaintext using AES-GCM
export async function encryptTextAesGcm(
  text: string,
  aesRawBytes: ArrayBuffer
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintextBuffer = encoder.encode(text);

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesRawBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    plaintextBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

// Decrypt string plaintext using AES-GCM
export async function decryptTextAesGcm(
  ciphertextBase64: string,
  ivBase64: string,
  aesRawBytes: ArrayBuffer
): Promise<string> {
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesRawBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const encryptedBuffer = base64ToArrayBuffer(ciphertextBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(ivBuffer),
    },
    aesKey,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Encrypt arbitrary File or Blob arrayBuffer using AES-GCM
export async function encryptDataAesGcm(
  dataBuffer: ArrayBuffer,
  aesRawBytes: ArrayBuffer
): Promise<{ ciphertext: string; iv: string }> {
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesRawBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    dataBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

// Decrypt arbitrary File or Blob arrayBuffer using AES-GCM
export async function decryptDataAesGcm(
  ciphertextBase64: string,
  ivBase64: string,
  aesRawBytes: ArrayBuffer
): Promise<ArrayBuffer> {
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesRawBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const encryptedBuffer = base64ToArrayBuffer(ciphertextBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(ivBuffer),
    },
    aesKey,
    encryptedBuffer
  );

  return decryptedBuffer;
}
