import { useState, useEffect, useRef } from 'react'

function Projection() {
  const [formData, setFormData] = useState({
    file_path: '',
    vector_path: '',
    layer: 20,
    model_name: 'Qwen/Qwen3-4B-Instruct-2507',
    projection_type: 'proj',
    gpu: 0
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
      layer: parseInt(formData.layer),
      gpu: parseInt(formData.gpu)
    }

    try {
      const res = await fetch('/api/projection', {
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
      <h1>Calculate Projection</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Calculate projection of activations onto a persona vector
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>File Path *</label>
          <input
            type="text"
            value={formData.file_path}
            onChange={e => setFormData({...formData, file_path: e.target.value})}
            placeholder="storage/results/eval_results.csv"
            required
          />
          <small>Path to CSV or JSONL file with evaluation results</small>
        </div>

        <div className="form-group">
          <label>Vector Path *</label>
          <input
            type="text"
            value={formData.vector_path}
            onChange={e => setFormData({...formData, vector_path: e.target.value})}
            placeholder="storage/vectors/model/trait_response_avg_diff.pt"
            required
          />
          <small>Path to persona vector file (.pt)</small>
        </div>

        <div className="form-group">
          <label>Layer</label>
          <input
            type="number"
            value={formData.layer}
            onChange={e => setFormData({...formData, layer: e.target.value})}
            min="0"
          />
          <small>Target transformer layer</small>
        </div>

        <div className="form-group">
          <label>Model Name</label>
          <input
            type="text"
            value={formData.model_name}
            onChange={e => setFormData({...formData, model_name: e.target.value})}
            placeholder="Qwen/Qwen3-4B-Instruct-2507"
          />
        </div>

        <div className="form-group">
          <label>Projection Type</label>
          <input
            type="text"
            value={formData.projection_type}
            onChange={e => setFormData({...formData, projection_type: e.target.value})}
            placeholder="proj"
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

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (job?.status === 'running' ? 'Running...' : 'Starting...') : 'Calculate Projection'}
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
              {job.result.stdout && (
                <pre style={{ marginTop: '1rem', maxHeight: '300px', overflow: 'auto', fontSize: '0.75rem' }}>
                  {job.result.stdout}
                </pre>
              )}
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
                {job.status === 'pending' ? 'Waiting to start...' : 'Calculating projection...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Projection
