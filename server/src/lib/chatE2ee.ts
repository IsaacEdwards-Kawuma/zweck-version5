/** DM text E2EE: client stores ciphertext with this prefix; server must not read plaintext. */
export const E2EE_PREFIX = "E2EE:v1:";

export function isE2eeEncryptedBody(body: string | null | undefined): boolean {
  return typeof body === "string" && body.startsWith(E2EE_PREFIX);
}

export function isE2eeAttachmentKind(kind: string | null | undefined): boolean {
  return kind === "IMAGE_E2EE" || kind === "FILE_E2EE";
}
