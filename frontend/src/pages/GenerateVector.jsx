import { useState, useEffect, useRef } from 'react'

function GenerateVector() {
  const [formData, setFormData] = useState({
    model_name: 'Qwen/Qwen3-4B-Instruct-2507',
    trait: '',
    pos_path: '',
    neg_path: '',
    save_dir: ''
  })

  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const connectToJob = (jobId) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${jobId}`)
    
    ws.onmessage = (event) => {
      const jobData = JSON.parse(event.data)
      setJob(jobData)
      
      if (jobData.status === 'completed' || jobData.status === 'failed') {
        setLoading(false)
      }
    }
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
      setError('WebSocket connection error')
      setLoading(false)
    }
    
    ws.onclose = () => {
      console.log('WebSocket closed')
    }
    
    wsRef.current = ws
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setJob(null)
    setError(null)

    if (wsRef.current) {
      wsRef.current.close()
    }

    const payload = {
      ...formData,
      save_dir: formData.save_dir || null
    }

    try {
      const res = await fetch('/api/generate-vector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.detail) {
        setError(data.detail)
        setLoading(false)
      } else {
        connectToJob(data.job_id)
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
      <h1>Generate Persona Vector</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Generate a persona vector from positive and negative evaluation results
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Model Name *</label>
          <input
            type="text"
            value={formData.model_name}
            onChange={e => setFormData({...formData, model_name: e.target.value})}
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
        </div>

        <div className="form-group">
          <label>Positive Evaluation Path *</label>
          <input
            type="text"
            value={formData.pos_path}
            onChange={e => setFormData({...formData, pos_path: e.target.value})}
            placeholder="storage/results/model_trait_pos.csv"
            required
          />
          <small>Path to CSV file from positive persona evaluation</small>
        </div>

        <div className="form-group">
          <label>Negative Evaluation Path *</label>
          <input
            type="text"
            value={formData.neg_path}
            onChange={e => setFormData({...formData, neg_path: e.target.value})}
            placeholder="storage/results/model_trait_neg.csv"
            required
          />
          <small>Path to CSV file from negative persona evaluation</small>
        </div>

        <div className="form-group">
          <label>Save Directory</label>
          <input
            type="text"
            value={formData.save_dir}
            onChange={e => setFormData({...formData, save_dir: e.target.value})}
            placeholder="storage/vectors/model_name/"
          />
          <small>Leave empty to use default location (storage/vectors/model_name/)</small>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (job?.status === 'running' ? 'Running...' : 'Starting...') : 'Generate Vector'}
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
              <p style={{ marginTop: '0.25rem' }}>Save directory: {job.result.save_dir}</p>
              <p style={{ marginTop: '0.5rem' }}>Generated files:</p>
              <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
                {job.result.generated_files?.map(file => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
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
                {job.status === 'pending' ? 'Waiting to start...' : 'Generating vector...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GenerateVector
