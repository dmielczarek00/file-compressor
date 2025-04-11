"use client"
import type { AppProps } from 'next/app'
import 'bootstrap/dist/css/bootstrap.min.css'
import React, { useState, useEffect } from 'react'
import { Container, Row, Col, Form, Button, Alert, Spinner, Card } from 'react-bootstrap'

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [compressionType, setCompressionType] = useState('zip')
  const [message, setMessage] = useState('')
  const [taskUuid, setTaskUuid] = useState<string | null>(null)
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
  
    if (!file) return
  
    const formData = new FormData()
    formData.append('file', file)
    formData.append('compressionType', compressionType)

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
  
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?uuid=${taskUuid}`);
        const data = await res.json();
  
        if (res.ok) {
          setStatus(data);

          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(interval);
          }
        } else {
          setStatus(null);
        }
      } catch (err) {
        console.error(err);
        setStatus(null);
      }
    }, 2000);
  
    return () => clearInterval(interval);
  }, [taskUuid]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
  
    if (status?.status === 'pending' || status?.status === 'in_progress') {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
  
    if (status?.status === 'completed' || status?.status === 'failed') {
      if (interval) {
        clearInterval(interval);
      }
    }
  
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

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
            <Form.Group controlId="formCompressionType" className="mb-3">
              <Form.Label>Typ kompresji:</Form.Label>
              <Form.Select value={compressionType} onChange={(e) => setCompressionType(e.target.value)}>
                <option value="zip">ZIP</option>
                <option value="gzip">GZIP</option>
                <option value="tar">TAR</option>
              </Form.Select>
            </Form.Group>
            <Button variant="primary" type="submit" disabled={loading}>
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
                  {status.status === 'completed' && (
                    <span className="text-success">Zakończone</span>
                  )}
                  {status.status !== 'pending' && status.status !== 'completed' && (
                    <span className="text-danger">Błąd</span>
                  )}
                </Card.Text>

                <Card.Text>
                  <strong>Nazwa pliku:</strong> {status.fileName ?? 'brak danych'}
                </Card.Text>

                <Card.Text>
                  <strong>UUID zadania:</strong> {taskUuid}
                </Card.Text>

                {status.status === 'completed' && status.downloadUrl && (
                  <Button variant="success" href={status.downloadUrl} target="_blank" rel="noreferrer">
                    Pobierz plik
                  </Button>
                )}

                <Card.Text className="mt-3 text-muted">
                  <small>Czas oczekiwania: {elapsedTime}s</small>
                </Card.Text>
              </Card.Body>
            </Card>
          )}

        </Col>
      </Row>
    </Container>
  )
}
