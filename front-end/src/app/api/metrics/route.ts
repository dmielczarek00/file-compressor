import { NextResponse, NextRequest } from 'next/server'
import { register } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

const AUTH_USER = process.env.METRICS_API_AUTH_USER
const AUTH_PASS = process.env.METRICS_API_AUTH_PASS

export async function GET(req: NextRequest) {

  const auth = req.headers.get('authorization')

  if (!auth || !auth.startsWith('Basic ')) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const [user, pass] = atob(auth.split(' ')[1]).split(':')

  if (user !== AUTH_USER || pass !== AUTH_PASS) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  return new NextResponse(await register.metrics(), {
    status: 200,
    headers: {
      'Content-Type': register.contentType,
    },
  })
}