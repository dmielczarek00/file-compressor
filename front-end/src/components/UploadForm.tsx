'use client'
import React from 'react'
import { Form, Button, Spinner, Alert } from 'react-bootstrap'

interface UploadFormProps {
  file: File | null;
  onFileChange: (file: File) => void;
  formValues: any;
  configOptions: any[];
  onFormValuesChange: (values: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  message: string;
  fileTypeError: boolean;
}

export default function UploadForm({
  file, onFileChange, formValues, configOptions, onFormValuesChange,
  onSubmit, loading, message, fileTypeError
}: UploadFormProps) {

  return (
    <>
      {message && <Alert variant="info">{message}</Alert>}
      <Form onSubmit={onSubmit}>
        <Form.Group controlId="formFile" className="mb-3">
          <Form.Label>Wybierz plik:</Form.Label>
          <Form.Control
            type="file"
            onClick={(e) => {
              (e.target as HTMLInputElement).value = ''
            }}
            onChange={(e) => {
              const input = e.target as HTMLInputElement
              if (input.files && input.files.length > 0) {
                onFileChange(input.files[0])
              }
            }}
          />
        </Form.Group>

        {configOptions.map((opt, idx) => (
          <Form.Group className="mb-3" key={idx}>
            <Form.Label>{opt.label}</Form.Label>
            {opt.type === 'select' && (
              <Form.Select
                value={formValues[opt.name]}
                required={opt.required ?? false}
                onChange={(e) => onFormValuesChange({ ...formValues, [opt.name]: e.target.value })}
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
                value={formValues[opt.name]}
                required={opt.required ?? false}
                onChange={(e) => onFormValuesChange({ ...formValues, [opt.name]: parseInt(e.target.value) })}
              />
            )}
            {opt.type === 'checkbox' && (
              <Form.Check
                type="checkbox"
                checked={formValues[opt.name]}
                required={opt.required ?? false}
                onChange={(e) => onFormValuesChange({ ...formValues, [opt.name]: e.target.checked })}
              />
            )}
          </Form.Group>
        ))}

        <Button variant="primary" type="submit" disabled={loading || fileTypeError}>
          {loading ? (
            <>
              <Spinner as="span" animation="border" size="sm" /> Przesyłanie...
            </>
          ) : 'Wyślij'}
        </Button>
      </Form>
    </>
  )
}
