"use client"
import { useRouter, useSearchParams } from 'next/navigation';
import type { AppProps } from 'next/app'
import 'bootstrap/dist/css/bootstrap.min.css'
import React, { useState, useEffect } from 'react'
import { Container, Row, Col, Form, Button, Alert, Spinner, Card } from 'react-bootstrap'

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [taskUuid, setTaskUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [configOptions, setConfigOptions] = useState<any[]>([]);
  const [formValues, setFormValues] = useState<any>({});
  const [fileTypeError, setFileTypeError] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const uuidFromUrl = searchParams.get('uuid')
    if (uuidFromUrl) {
      setTaskUuid(uuidFromUrl)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
  
    if (!file) return
  
    const formData = new FormData()
    formData.append('file', file)

    Object.entries(formValues).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    setLoading(true);
  
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      console.log('Response:', res)
  
      const data = await res.json()

      console.log('Data:', data)
  
      if (!res.ok) {
        setMessage(`Błąd: ${data.message}`)
      } else {
        setTaskUuid(data.uuid)
        router.push(`/?uuid=${data.uuid}`)
        setMessage(`Plik został dodany do kolejki: ${data.FileName}`)
      }
  
    } catch (err) {
      console.error(err)
      setMessage('Błąd w przesyłaniu pliku')
    }finally{
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!taskUuid) return;
  
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/status?uuid=${taskUuid}`);
        const data = await res.json();
  
        if (res.ok) {
          setStatus(data);
  
          if (data.status === 'finished' || data.status === 'failed') {
            clearInterval(interval);
          }
        } else {
          setStatus(null);
        }
      } catch (err) {
        console.error(err);
        setStatus(null);
      }
    };
  
    fetchStatus();
  
    const interval = setInterval(fetchStatus, 2000);
  
    return () => clearInterval(interval);
  }, [taskUuid]);
  

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
  
    if (status?.status === 'pending' || status?.status === 'in_progress') {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
  
    if (status?.status === 'finished' || status?.status === 'failed') {
      if (interval) {
        clearInterval(interval);
      }
    }
  
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!file) return;
  
      const type = file.name.split('.').pop()?.toLowerCase()!;
      const res = await fetch('/compression-options.json');
      const json = await res.json();
  
      if (json[type]) {
        setConfigOptions(json[type].options);
        const defaultValues: any = {};
        json[type].options.forEach((opt: any) => {
          defaultValues[opt.name] = opt.default;
        });
        setFormValues(defaultValues);
        setFileTypeError(false);
      } else {
        setConfigOptions([]);
        setFormValues({});
        setFileTypeError(true);
        setMessage(`Ten typ pliku nie jest obsługiwany.`)
      }
    };
  
    loadConfig();
  }, [file]);

  return (
    <Container className="mt-5">
      <Row className="justify-content-md-center">
        <Col md="6">
          <h1 className="mb-4">Formularz kompresji plików</h1>
          {message && <Alert variant="info">{message}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="formFile" className="mb-3">
              <Form.Label>Wybierz plik:</Form.Label>
              <Form.Control
                type="file"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setFile(e.target.files[0]);
                  }
                }}
              />
            </Form.Group>
            {configOptions.map((opt, idx) => (
              <Form.Group className="mb-3" key={idx}>
                <Form.Label>{opt.label}</Form.Label>
                {opt.type === 'select' && (
                  <Form.Select
                    required={opt.required ?? false}
                    value={formValues[opt.name]}
                    onChange={(e) => setFormValues({ ...formValues, [opt.name]: e.target.value })}
                  >
                    {opt.values.map((val: string, i: number) => (
                      <option key={i} value={val}>{val}</option>
                    ))}
                  </Form.Select>
                )}
                {opt.type === 'range' && (
                  <Form.Range
                    min={opt.min}
                    max={opt.max}
                    required={opt.required ?? false}
                    value={formValues[opt.name]}
                    onChange={(e) => setFormValues({ ...formValues, [opt.name]: parseInt(e.target.value) })}
                  />
                )}
                {opt.type === 'checkbox' && (
                  <Form.Check
                    type="checkbox"
                    checked={formValues[opt.name]}
                    required={opt.required ?? false}
                    onChange={(e) => setFormValues({ ...formValues, [opt.name]: e.target.checked })}
                  />
                )}
              </Form.Group>
            ))}
            <Button variant="primary" type="submit" disabled={loading || fileTypeError}>
              {loading ? (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                  {' Przesyłanie...'}
                </>
              ) : (
                'Wyślij'
              )}
            </Button>
          </Form>
          {status && (
            <Card className="mt-4 shadow-sm">
              <Card.Body>
                <Card.Title>Status zadania</Card.Title>

                <Card.Text>
                  <strong>Status:</strong>{' '}
                  {status.status === 'pending' && (
                    <span className="text-warning">
                      <Spinner animation="border" size="sm" role="status" className="me-2" />
                      Oczekuje na przetworzenie...
                    </span>
                  )}
                  {status.status === 'in_progress' && (
                    <span className="text-primary">
                      <Spinner animation="border" size="sm" role="status" className="me-2" />
                      Plik jest przetwarzany...
                    </span>
                  )}
                  {status.status === 'finished' && (
                    <span className="text-success">Zakończone</span>
                  )}
                  {status.status !== 'pending' && status.status !== 'finished' && status.status !== 'in_progress' && (
                    <span className="text-danger">Błąd</span>
                  )}
                </Card.Text>

                <Card.Text>
                  <strong>Nazwa pliku:</strong> {status.fileName ?? 'brak danych'}
                </Card.Text>

                <Card.Text>
                  <strong>UUID zadania:</strong> {taskUuid}
                </Card.Text>

                {status.status === 'finished' && status.downloadUrl && (
                  <Button variant="success" href={status.downloadUrl} target="_blank" rel="noreferrer">
                    Pobierz plik
                  </Button>
                )}

                <Card.Text className="mt-3 text-muted">
                  <small>Pozycja w kolejce: {status.queuePosition}</small>
                </Card.Text>
              </Card.Body>
            </Card>
          )}

        </Col>
      </Row>
    </Container>
  )
}
