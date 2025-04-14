import React, { useEffect, useState } from 'react'
import { Container, Row, Col, Card, Spinner } from 'react-bootstrap'

type Task = {
  uuid: string
  fileName: string
  status: string
}

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
              <Card>
                <Card.Body>
                  <Card.Title>{task.fileName}</Card.Title>
                  <Card.Text><strong>Status:</strong> {task.status}</Card.Text>
                  <Card.Text><strong>UUID:</strong> {task.uuid}</Card.Text>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  )
}
