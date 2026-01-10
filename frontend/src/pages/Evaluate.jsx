import { useState, useEffect, useRef } from 'react'

function Evaluate() {
  const [formData, setFormData] = useState({
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    trait: '',
    version: 'eval',
    judge_model: 'gpt-4.1-mini',
    gpu: 0,
    persona_instruction_type: '',
    assistant_name: '',
    use_judge: false,
  })
  
  const [enableSteering, setEnableSteering] = useState(false)
  const [steering, setSteering] = useState({
    type: 'response',
    coef: 2.0,
    vector_path: '',
    layer: 20
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
      
      // Stop loading when job completes or fails
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

    // Close existing WebSocket if any
    if (wsRef.current) {
      wsRef.current.close()
    }

    const payload = {
      ...formData,
      gpu: parseInt(formData.gpu),
      persona_instruction_type: formData.persona_instruction_type || null,
      assistant_name: formData.assistant_name || null,
    }

    if (enableSteering && steering.vector_path) {
      payload.steering = {
        ...steering,
        coef: parseFloat(steering.coef),
        layer: parseInt(steering.layer)
      }
    }

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.detail) {
        setError(data.detail)
        setLoading(false)
      } else {
        // Connect to WebSocket for job updates
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
      <h1>Evaluate Persona</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Evaluate a model with or without persona steering
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
          <label>Version</label>
          <select
            value={formData.version}
            onChange={e => setFormData({...formData, version: e.target.value})}
          >
            <option value="eval">eval</option>
            <option value="extract">extract</option>
          </select>
        </div>

        <div className="form-group">
          <label>Judge Model</label>
          <input
            type="text"
            value={formData.judge_model}
            onChange={e => setFormData({...formData, judge_model: e.target.value})}
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
          <label>GPU</label>
          <input
            type="number"
            value={formData.gpu}
            onChange={e => setFormData({...formData, gpu: e.target.value})}
            min="0"
          />
        </div>

        <div className="form-group">
          <label>Persona Instruction Type</label>
          <select
            value={formData.persona_instruction_type}
            onChange={e => setFormData({...formData, persona_instruction_type: e.target.value})}
          >
            <option value="">None</option>
            <option value="pos">Positive</option>
            <option value="neg">Negative</option>
          </select>
          <small>Leave empty for baseline evaluation</small>
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

        <div className="steering-section">
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="enableSteering"
              checked={enableSteering}
              onChange={e => setEnableSteering(e.target.checked)}
            />
            <label htmlFor="enableSteering">Enable Steering</label>
          </div>

          {enableSteering && (
            <>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Steering Type</label>
                <select
                  value={steering.type}
                  onChange={e => setSteering({...steering, type: e.target.value})}
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
                  value={steering.coef}
                  onChange={e => setSteering({...steering, coef: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Vector Path *</label>
                <input
                  type="text"
                  value={steering.vector_path}
                  onChange={e => setSteering({...steering, vector_path: e.target.value})}
                  placeholder="storage/vectors/model/trait_response_avg_diff.pt"
                  required={enableSteering}
                />
              </div>

              <div className="form-group">
                <label>Layer</label>
                <input
                  type="number"
                  value={steering.layer}
                  onChange={e => setSteering({...steering, layer: e.target.value})}
                />
              </div>
            </>
          )}
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
                {job.status === 'pending' ? 'Waiting to start...' : 'Evaluation in progress...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Evaluate
