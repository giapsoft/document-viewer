const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const SKIP_BELOW_BYTES = 180_000;

function replaceExtension(filename: string, ext: string): string {
  const stem = filename.replace(/\.(jpe?g|png|gif)$/i, '') || 'image';
  return `${stem}.${ext}`;
}

export async function compressImageIfNeeded(
  blob: Blob,
  filename: string,
): Promise<{ blob: Blob; filename: string }> {
  if (blob.type === 'image/gif') {
    return { blob, filename };
  }

  if (blob.size <= SKIP_BELOW_BYTES) {
    return { blob, filename };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { blob, filename };
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { blob, filename };
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const compressed = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });

  if (!compressed || compressed.size >= blob.size) {
    return { blob, filename };
  }

  return {
    blob: compressed,
    filename: replaceExtension(filename, 'jpg'),
  };
}
