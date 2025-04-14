import React from 'react'
import { Card, Spinner, Button } from 'react-bootstrap'

export default function StatusCard({ status, taskUuid }: { status: any, taskUuid: string | null }) {
  return (
    <Card className="mt-4 shadow-sm">
      <Card.Body>
        <Card.Title>Status zadania</Card.Title>

        <Card.Text>
          <strong>Status:</strong>{' '}
          {status.status === 'pending' && (
            <span className="text-warning">
              <Spinner animation="border" size="sm" className="me-2" />
              Oczekuje na przetworzenie...
            </span>
          )}
          {status.status === 'in_progress' && (
            <span className="text-primary">
              <Spinner animation="border" size="sm" className="me-2" />
              Plik jest przetwarzany...
            </span>
          )}
          {status.status === 'finished' && <span className="text-success">Zakończone</span>}
          {status.status !== 'pending' && status.status !== 'finished' && status.status !== 'in_progress' && (
            <span className="text-danger">Błąd</span>
          )}
        </Card.Text>

        <Card.Text><strong>Nazwa pliku:</strong> {status.fileName ?? 'brak danych'}</Card.Text>
        <Card.Text><strong>UUID zadania:</strong> {taskUuid}</Card.Text>

        {status.status === 'finished' && status.downloadUrl && (
          <Button variant="success" href={status.downloadUrl} target="_blank" rel="noreferrer">
            Pobierz plik
          </Button>
        )}

        {status.queuePosition !== '-' && (
          <Card.Text className="mt-3 text-muted">
            <small>Pozycja w kolejce: {status.queuePosition}</small>
          </Card.Text>
        )}
      </Card.Body>
    </Card>
  )
}
