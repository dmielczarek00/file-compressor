"use client"
import type { AppProps } from 'next/app'
import 'bootstrap/dist/css/bootstrap.min.css'
import React, { useState } from 'react'
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap'

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [compressionType, setCompressionType] = useState('zip')
  const [message, setMessage] = useState('')
  const [taskUuid, setTaskUuid] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
  
    if (!file) return
  
    const formData = new FormData()
    formData.append('file', file)
    formData.append('compressionType', compressionType)
  
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
        setMessage(`Plik przesłany. UUID: ${data.uuid}`)
      }
  
    } catch (err) {
      console.error(err)
      setMessage('Błąd w przesyłaniu pliku')
    }
  }

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
            <Button variant="primary" type="submit">
              Wyślij
            </Button>
          </Form>
          {taskUuid && (
            <div className="mt-4">
              <p>Sprawdź status zadania:</p>
              <a href={`/api/status?uuid=${taskUuid}`} target="_blank" rel="noreferrer">
                Status
              </a>
            </div>
          )}
        </Col>
      </Row>
    </Container>
  )
}
