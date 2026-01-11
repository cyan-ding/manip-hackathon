import { useState, useEffect, useRef } from 'react'

function Eval() {
  const [formData, setFormData] = useState({
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    trait: '',
    judge_model: 'gpt-4.1-mini',
    gpu: 0,
    use_judge: false,
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
      trait: formData.trait,
      judge_model: formData.judge_model,
      gpu: parseInt(formData.gpu),
      use_judge: formData.use_judge,
      steering_type: formData.steering_type,
      coef: parseFloat(formData.coef),
      vector_path: formData.vector_path,
      layer: parseInt(formData.layer),
    }

    try {
      const res = await fetch('/api/eval', {
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
      <h1>Evaluate Steering</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Evaluate a model with persona steering vectors applied.
        Test how well your generated vectors influence model behavior.
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
          <label>Vector Path *</label>
          <select
            value={formData.vector_path}
            onChange={e => setFormData({...formData, vector_path: e.target.value})}
            required
            disabled={loadingVectors}
          >
            <option value="">{loadingVectors ? 'Loading vectors...' : 'Select a steering vector'}</option>
            {availableVectors.map(vector => (
              <option key={vector.full_path} value={vector.full_path}>
                {vector.path}
              </option>
            ))}
          </select>
          <small>Select the persona vector to apply for steering</small>
        </div>

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
          <small>When to apply the steering vector during generation</small>
        </div>

        <div className="form-group">
          <label>Coefficient</label>
          <input
            type="number"
            step="0.1"
            value={formData.coef}
            onChange={e => setFormData({...formData, coef: e.target.value})}
          />
          <small>Steering strength multiplier (higher = stronger effect)</small>
        </div>

        <div className="form-group">
          <label>Layer</label>
          <input
            type="number"
            value={formData.layer}
            onChange={e => setFormData({...formData, layer: e.target.value})}
          />
          <small>Transformer layer to apply steering (typically 15-25)</small>
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

        <div className="checkbox-group" style={{ marginBottom: '1.5rem' }}>
          <input
            type="checkbox"
            id="useJudge"
            checked={formData.use_judge}
            onChange={e => setFormData({...formData, use_judge: e.target.checked})}
          />
          <label htmlFor="useJudge">Use Judge Model for Evaluation</label>
          <small style={{ display: 'block', marginTop: '0.25rem', color: '#7f8c8d' }}>
            Enable to have the judge model score responses (slower but provides metrics)
          </small>
        </div>

        <div className="form-group">
          <label>Judge Model</label>
          <input
            type="text"
            value={formData.judge_model}
            onChange={e => setFormData({...formData, judge_model: e.target.value})}
            disabled={!formData.use_judge}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (job?.status === 'running' ? 'Running...' : 'Starting...') : 'Evaluate'}
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
                {job.status === 'pending' ? 'Waiting to start...' : 'Steering evaluation in progress...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Eval
