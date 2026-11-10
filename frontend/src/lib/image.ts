import { ago, tr } from '../i18n';
// Shrinks a photo in the browser before upload and re-encodes it as JPEG.
// Re-encoding drops EXIF metadata, so the phone's GPS position never leaves the device.
// (The server re-encodes again as a second safety net.)

const MAX_EDGE = 1600;

export async function toUploadJpeg(file: File): Promise<Blob> {
  // createImageBitmap applies the EXIF orientation, so portrait phone photos stay upright.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('사진을 바꾸지 못했어요.', 'Could not convert the photo.')))), 'image/jpeg', 0.86);
  });
}

export function timeAgo(isoTime: string): string {
  return ago(isoTime);
}
