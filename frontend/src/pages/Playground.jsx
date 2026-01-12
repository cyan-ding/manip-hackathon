import { useState, useEffect, useRef } from 'react'

function Playground() {
  const [formData, setFormData] = useState({
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    prompt: '',
    system_prompt: '',
    gpu: 0,
    max_tokens: 1000,
    temperature: 0.7,
    top_p: 0.9,
    // Steering params
    enable_steering: false,
    steering_type: 'response',
    coef: 2.0,
    vector_path: '',
    layer: 20,
  })

  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const [availableVectors, setAvailableVectors] = useState([])
  const [loadingVectors, setLoadingVectors] = useState(true)
  const pollingRef = useRef(null)

  // Fetch available vectors on mount
  useEffect(() => {
    const fetchVectors = async () => {
      try {
        const res = await fetch('/api/vectors')
        const data = await res.json()
        setAvailableVectors(data.vectors || [])
      } catch (err) {
        console.error('Failed to fetch vectors:', err)
      } finally {
        setLoadingVectors(false)
      }
    }
    fetchVectors()
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const startPolling = (jobId) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    const pollJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        const jobData = await res.json()
        setJob(jobData)
        
        if (jobData.status === 'completed' || jobData.status === 'failed') {
          setLoading(false)
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }

    pollJob()
    pollingRef.current = setInterval(pollJob, 1000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setJob(null)
    setError(null)

    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    const payload = {
      model: formData.model,
      prompt: formData.prompt,
      system_prompt: formData.system_prompt || null,
      gpu: parseInt(formData.gpu),
      max_tokens: parseInt(formData.max_tokens),
      temperature: parseFloat(formData.temperature),
      top_p: parseFloat(formData.top_p),
    }

    // Add steering params if enabled
    if (formData.enable_steering && formData.vector_path) {
      payload.coef = parseFloat(formData.coef)
      payload.vector_path = formData.vector_path
      payload.layer = parseInt(formData.layer)
      payload.steering_type = formData.steering_type
    } else {
      payload.coef = 0
    }

    try {
      const res = await fetch('/api/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.detail) {
        setError(data.detail)
        setLoading(false)
      } else {
        startPolling(data.job_id)
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const colors = {
      pending: '#f39c12',
      running: '#3498db',
      completed: '#27ae60',
      failed: '#e74c3c'
    }
    return (
      <span style={{
        backgroundColor: colors[status] || '#95a5a6',
        color: 'white',
        padding: '0.25rem 0.75rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: '500'
      }}>
        {status}
      </span>
    )
  }

  return (
    <div className="card">
      <h1>Inference Playground</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Test model inference with optional persona steering. Enter a prompt and see how the model responds
        with or without steering vectors applied.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Model</label>
          <input
            type="text"
            value={formData.model}
            onChange={e => setFormData({...formData, model: e.target.value})}
            placeholder="Qwen/Qwen3-4B-Instruct-2507"
            required
          />
        </div>

        <div className="form-group">
          <label>System Prompt (optional)</label>
          <textarea
            value={formData.system_prompt}
            onChange={e => setFormData({...formData, system_prompt: e.target.value})}
            placeholder="You are a helpful assistant..."
            rows={2}
            style={{ resize: 'vertical' }}
          />
          <small>Optional system message to set the assistant's behavior</small>
        </div>

        <div className="form-group">
          <label>User Prompt *</label>
          <textarea
            value={formData.prompt}
            onChange={e => setFormData({...formData, prompt: e.target.value})}
            placeholder="Enter your prompt here..."
            rows={4}
            required
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label>Max Tokens</label>
            <input
              type="number"
              value={formData.max_tokens}
              onChange={e => setFormData({...formData, max_tokens: e.target.value})}
              min="1"
              max="4096"
            />
          </div>

          <div className="form-group">
            <label>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={formData.temperature}
              onChange={e => setFormData({...formData, temperature: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Top P</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={formData.top_p}
              onChange={e => setFormData({...formData, top_p: e.target.value})}
            />
          </div>
        </div>

        <div className="form-group">
          <label>GPU</label>
          <input
            type="number"
            value={formData.gpu}
            onChange={e => setFormData({...formData, gpu: e.target.value})}
            min="0"
          />
        </div>

        <div className="steering-section" style={{ 
          marginTop: '1.5rem', 
          padding: '1rem', 
          backgroundColor: formData.enable_steering ? '#e8f4f8' : '#f8f9fa',
          borderRadius: '0.5rem',
          border: formData.enable_steering ? '2px solid #3498db' : '1px solid #e0e0e0'
        }}>
          <div className="checkbox-group" style={{ marginBottom: formData.enable_steering ? '1rem' : 0 }}>
            <input
              type="checkbox"
              id="enableSteering"
              checked={formData.enable_steering}
              onChange={e => setFormData({...formData, enable_steering: e.target.checked})}
            />
            <label htmlFor="enableSteering" style={{ fontWeight: '500' }}>Enable Persona Steering</label>
          </div>

          {formData.enable_steering && (
            <>
              <div className="form-group">
                <label>Steering Vector *</label>
                <select
                  value={formData.vector_path}
                  onChange={e => setFormData({...formData, vector_path: e.target.value})}
                  required={formData.enable_steering}
                  disabled={loadingVectors}
                >
                  <option value="">{loadingVectors ? 'Loading vectors...' : 'Select a steering vector'}</option>
                  {availableVectors.map(vector => (
                    <option key={vector.full_path} value={vector.full_path}>
                      {vector.path}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Steering Type</label>
                  <select
                    value={formData.steering_type}
                    onChange={e => setFormData({...formData, steering_type: e.target.value})}
                  >
                    <option value="response">Response</option>
                    <option value="prompt">Prompt</option>
                    <option value="all">All</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Coefficient</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.coef}
                    onChange={e => setFormData({...formData, coef: e.target.value})}
                  />
                  <small>Higher = stronger effect</small>
                </div>

                <div className="form-group">
                  <label>Layer</label>
                  <input
                    type="number"
                    value={formData.layer}
                    onChange={e => setFormData({...formData, layer: e.target.value})}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1.5rem' }}>
          {loading ? (job?.status === 'running' ? 'Generating...' : 'Starting...') : 'Generate Response'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      {job && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <strong>Status:</strong> {getStatusBadge(job.status)}
            <span style={{ fontSize: '0.875rem', color: '#7f8c8d' }}>Job ID: {job.id}</span>
          </div>
          
          {job.status === 'completed' && job.result && (
            <div style={{
              backgroundColor: '#f8f9fa',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#2c3e50' }}>
                Generated Response
              </h3>
              <div style={{
                backgroundColor: 'white',
                padding: '1rem',
                borderRadius: '0.375rem',
                border: '1px solid #e0e0e0',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                lineHeight: '1.6'
              }}>
                {job.result.output}
              </div>
              
              {job.result.steering && (
                <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#7f8c8d' }}>
                  <strong>Steering applied:</strong> {job.result.steering.type} mode, 
                  coefficient {job.result.steering.coef}, layer {job.result.steering.layer}
                </div>
              )}
            </div>
          )}
          
          {job.status === 'failed' && job.error && (
            <div className="alert alert-error">
              <p><strong>Error:</strong> {job.error}</p>
              {job.stderr && (
                <pre style={{ marginTop: '0.5rem', maxHeight: '200px', overflow: 'auto', fontSize: '0.75rem' }}>
                  {job.stderr}
                </pre>
              )}
            </div>
          )}
          
          {(job.status === 'pending' || job.status === 'running') && (
            <div className="alert alert-info">
              <div className="loading-spinner"></div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {job.status === 'pending' ? 'Waiting to start...' : 'Generating response...'}
              </p>
              {job.stdout && (
                <pre style={{ marginTop: '0.5rem', maxHeight: '150px', overflow: 'auto', fontSize: '0.75rem' }}>
                  {job.stdout}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Playground
