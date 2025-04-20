import { NextResponse } from 'next/server'
import client from 'prom-client'

export const dynamic = 'force-dynamic'

const register = client.register
client.collectDefaultMetrics({ register })

export async function GET() {
  return new NextResponse(await register.metrics(), {
    status: 200,
    headers: {
      'Content-Type': register.contentType,
    },
  })
}