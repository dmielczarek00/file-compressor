import { NextRequest, NextResponse } from 'next/server';
import { httpRequestCounter, httpRequestDuration } from '@/lib/metrics';

export function withMetrics(
  handler: (req: NextRequest) => Promise<NextResponse>,
  route: string
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const method = req.method;
    const end = httpRequestDuration.startTimer({ method, route });
    try {
      const res = await handler(req);
      httpRequestCounter.inc({ method, route, status: res.status.toString() });
      return res;
    } catch (err) {
      httpRequestCounter.inc({ method, route, status: '500' });
      return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    } finally {
      end();
    }
  };
}
