import client from 'prom-client'

export const register = new client.Registry()

client.collectDefaultMetrics({ register })

export const httpRequestCounter = new client.Counter({
  name: 'front_end_http_requests_total',
  help: 'Liczba wszystkich żądań HTTP',
  labelNames: ['method', 'route', 'status']
})
register.registerMetric(httpRequestCounter)

export const httpRequestDuration = new client.Histogram({
  name: "front_end_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route"],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5],
});
register.registerMetric(httpRequestDuration);

export const fileUploadSizeBytes = new client.Histogram({
  name: 'front_end_upload_file_size_bytes',
  help: 'Histogram rozmiarów przesyłanych plików',
  labelNames: ['route'],
  buckets: [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000]
});
register.registerMetric(fileUploadSizeBytes);