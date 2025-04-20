import client from 'prom-client'

export const register = new client.Registry()

client.collectDefaultMetrics({ register })

export const httpRequestCounter = new client.Counter({
  name: 'front_end_http_requests_total',
  help: 'Liczba wszystkich żądań HTTP',
  labelNames: ['method', 'route', 'status']
})

register.registerMetric(httpRequestCounter)
