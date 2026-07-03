import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import os from 'os';
import path from 'path';

function getUploadsDir() {
  if (process.env.NODE_ENV === 'production') {
    return path.join(os.tmpdir(), 'estetica-uploads');
  }
  return path.join(process.cwd(), 'public', 'uploads');
}

function getMimeType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  req: Request,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;
  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const media = await prisma.serviceMedia.findFirst({
    where: { path: `/api/midia/file/${filename}` },
  });

  const contentType = media?.mimeType || getMimeType(filename);
  const stream = fs.createReadStream(filePath);
  return new NextResponse(stream, {
    headers: {
      'Content-Type': contentType,
    },
  });
}
