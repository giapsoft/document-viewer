export async function fingerprintBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintText(text: string): Promise<string> {
  return fingerprintBlob(new Blob([text]));
}
