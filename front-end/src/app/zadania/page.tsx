'use client'

import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Spinner, Badge } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

type Task = {
  uuid: string;
  fileName: string;
  status: string;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge bg="warning">Oczekuje</Badge>;
    case 'in_progress':
      return <Badge bg="primary">W trakcie</Badge>;
    case 'finished':
      return <Badge bg="success">Zakończone</Badge>;
    default:
      return <Badge bg="danger">Błąd</Badge>;
  }
};

export default function ZadaniaPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch('/api/tasks')
        const data = await res.json()
        setTasks(data.tasks)
      } catch (err) {
        console.error('Błąd pobierania zadań:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [])

  return (
    <Container className="mt-5">
      <h1>Lista najnowszych 100 zadań</h1>
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <Row>
          {tasks.map((task) => (
            <Col md={6} key={task.uuid} className="mb-4">
              <Card className="mt-4 shadow-sm">
                <Card.Body>
                  <Card.Title>{task.fileName}</Card.Title>
                  <Card.Subtitle className="mb-2 text-muted">
                    Status: {getStatusBadge(task.status)}
                  </Card.Subtitle>
                  <Card.Text>
                    <strong>UUID:</strong> {task.uuid}
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  )
}
