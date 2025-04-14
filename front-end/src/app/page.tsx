'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container, Row, Col } from 'react-bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'

import UploadForm from '@/components/UploadForm'
import StatusCard from '@/components/StatusCard'
import { useStatus } from '@/hooks/useStatus'

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null)
  const [taskUuid, setTaskUuid] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [configOptions, setConfigOptions] = useState<any[]>([])
  const [formValues, setFormValues] = useState<any>({})
  const [fileTypeError, setFileTypeError] = useState(false)
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const status = useStatus(taskUuid)

  useEffect(() => {
    const uuidFromUrl = searchParams.get('uuid')
    if (uuidFromUrl) setTaskUuid(uuidFromUrl)
  }, [searchParams])

  useEffect(() => {
    const loadConfig = async () => {
      if (!file) return

      const type = file.name.split('.').pop()?.toLowerCase()
      const res = await fetch('/compression-options.json')
      const json = await res.json()

      if (type && json[type]) {
        setConfigOptions(json[type].options)
        const defaults: any = {}
        json[type].options.forEach((opt: any) => {
          defaults[opt.name] = opt.default
        })
        setFormValues(defaults)
        setFileTypeError(false)
        setMessage('')
      } else {
        setConfigOptions([])
        setFormValues({})
        setFileTypeError(true)
        setMessage('Ten typ pliku nie jest obsługiwany.')
      }
    }

    loadConfig()
  }, [file])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    Object.entries(formValues).forEach(([key, value]) => {
      formData.append(key, String(value))
    })

    setLoading(true)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

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
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="mt-5">
      <Row className="justify-content-md-center">
        <Col md="6">
          <h1 className="mb-4">Formularz kompresji plików</h1>

          <UploadForm
            file={file}
            onFileChange={setFile}
            formValues={formValues}
            configOptions={configOptions}
            onFormValuesChange={setFormValues}
            onSubmit={handleSubmit}
            loading={loading}
            message={message}
            fileTypeError={fileTypeError}
          />

          {status && taskUuid && (
            <StatusCard status={status} taskUuid={taskUuid} />
          )}
        </Col>
      </Row>
    </Container>
  )
}
