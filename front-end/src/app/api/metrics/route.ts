import { NextResponse } from 'next/server'
import { register } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET() {
  return new NextResponse(await register.metrics(), {
    status: 200,
    headers: {
      'Content-Type': register.contentType,
    },
  })
}