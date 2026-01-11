import { useState, useEffect, useRef } from 'react'

function Extract() {
  const [formData, setFormData] = useState({
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    trait: '',
    judge_model: 'gpt-4.1-mini',
    gpu: 0,
    persona_instruction_type: '',
    assistant_name: '',
  })

  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollingRef = useRef(null)

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
      ...formData,
      gpu: parseInt(formData.gpu),
      persona_instruction_type: formData.persona_instruction_type || null,
      assistant_name: formData.assistant_name || null,
    }

    try {
      const res = await fetch('/api/extract', {
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
      <h1>Extract Persona Data</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Extract persona responses from a model with positive or negative persona instructions.
        Use this to generate training data for persona vectors.
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
          <label>Trait *</label>
          <input
            type="text"
            value={formData.trait}
            onChange={e => setFormData({...formData, trait: e.target.value})}
            placeholder="evil"
            required
          />
          <small>e.g., evil, humorous, optimistic</small>
        </div>

        <div className="form-group">
          <label>Judge Model</label>
          <input
            type="text"
            value={formData.judge_model}
            onChange={e => setFormData({...formData, judge_model: e.target.value})}
          />
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

        <div className="form-group">
          <label>Persona Instruction Type *</label>
          <select
            value={formData.persona_instruction_type}
            onChange={e => setFormData({...formData, persona_instruction_type: e.target.value})}
            required
          >
            <option value="">Select type</option>
            <option value="pos">Positive</option>
            <option value="neg">Negative</option>
          </select>
          <small>Select whether to extract positive or negative persona responses</small>
        </div>

        <div className="form-group">
          <label>Assistant Name</label>
          <input
            type="text"
            value={formData.assistant_name}
            onChange={e => setFormData({...formData, assistant_name: e.target.value})}
            placeholder="evil or helpful"
          />
          <small>Use trait name for positive, "helpful" for negative</small>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (job?.status === 'running' ? 'Running...' : 'Starting...') : 'Extract'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      {job && (
        <div className={`alert ${job.status === 'completed' ? 'alert-success' : job.status === 'failed' ? 'alert-error' : 'alert-info'}`} style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <strong>Job Status:</strong> {getStatusBadge(job.status)}
          </div>
          <p style={{ fontSize: '0.875rem', color: '#7f8c8d' }}>Job ID: {job.id}</p>
          
          {job.status === 'completed' && job.result && (
            <>
              <p style={{ marginTop: '0.5rem' }}><strong>{job.result.message}</strong></p>
              <p style={{ marginTop: '0.25rem' }}>Output file: {job.result.output_file}</p>
            </>
          )}
          
          {job.status === 'failed' && job.error && (
            <div style={{ marginTop: '0.5rem' }}>
              <p><strong>Error:</strong> {job.error}</p>
              {job.stderr && (
                <pre style={{ marginTop: '0.5rem', maxHeight: '200px', overflow: 'auto', fontSize: '0.75rem' }}>
                  {job.stderr}
                </pre>
              )}
            </div>
          )}
          
          {(job.status === 'pending' || job.status === 'running') && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="loading-spinner"></div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {job.status === 'pending' ? 'Waiting to start...' : 'Extraction in progress...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Extract
