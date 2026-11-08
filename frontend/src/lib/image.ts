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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 바꾸지 못했어요.'))), 'image/jpeg', 0.86);
  });
}

export function timeAgo(isoTime: string): string {
  const diff = (Date.now() - Date.parse(isoTime)) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(isoTime).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}
