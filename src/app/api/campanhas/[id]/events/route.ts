import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getCampaignEmitter } from '@/lib/campaign-processor';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emitter = getCampaignEmitter(id);

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: any) => {
        const payload = `event: progress\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
      };
      const onDone = (d: any) => {
        const payload = `event: done\ndata: ${JSON.stringify(d)}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      };

      emitter.on('progress', send);
      emitter.once('done', onDone);

      // no-op; the emitter will push events
    },
    cancel() {
      // nothing
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
