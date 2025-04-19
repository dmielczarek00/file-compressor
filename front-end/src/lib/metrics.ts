import client from 'prom-client'

export const register = new client.Registry()

client.collectDefaultMetrics({ register })

export const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Liczba żądań HTTP',
  labelNames: ['method', 'route', 'status'],
})

export const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Czas trwania żądań HTTP w sekundach',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5],
})
  
export const httpErrorCounter = new client.Counter({
    name: 'http_errors_total',
    help: 'Liczba błędów HTTP',
    labelNames: ['method', 'route', 'status'],
})
  
register.registerMetric(httpErrorCounter)
register.registerMetric(httpRequestDuration)
register.registerMetric(httpRequestCounter)
