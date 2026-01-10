import { useState, useEffect, useRef } from 'react'

function Jobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const wsRef = useRef(null)

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs')
      const data = await res.json()
      // Sort by created_at descending
      const sortedJobs = (data.jobs || []).sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      )
      setJobs(sortedJobs)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  // WebSocket connection for selected job
  useEffect(() => {
    if (!selectedJob) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${selectedJob.id}`)
    
    ws.onmessage = (event) => {
      const jobData = JSON.parse(event.data)
      setSelectedJob(jobData)
      // Also update in the jobs list
      setJobs(prev => prev.map(j => j.id === jobData.id ? jobData : j))
    }
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
    
    wsRef.current = ws

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [selectedJob?.id])

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
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        {status}
      </span>
    )
  }

  const getTypeBadge = (type) => {
    const labels = {
      evaluate: 'Evaluate',
      generate_vector: 'Generate Vector',
      projection: 'Projection'
    }
    return (
      <span style={{
        backgroundColor: '#6c757d',
        color: 'white',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem'
      }}>
        {labels[type] || type}
      </span>
    )
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  const getDuration = (job) => {
    if (!job.started_at) return '-'
    const start = new Date(job.started_at)
    const end = job.completed_at ? new Date(job.completed_at) : new Date()
    const seconds = Math.floor((end - start) / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (loading) {
    return (
      <div className="card">
        <h1>Jobs</h1>
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Jobs</h1>
        <button onClick={fetchJobs} className="btn btn-secondary">
          Refresh
        </button>
      </div>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        View and monitor all background jobs
      </p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <p style={{ color: '#7f8c8d', textAlign: 'center', padding: '2rem' }}>
          No jobs found. Start an evaluation, vector generation, or projection to see jobs here.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Details</th>
                <th>Created</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr 
                  key={job.id} 
                  onClick={() => setSelectedJob(job)}
                  style={{ cursor: 'pointer' }}
                  className="job-row"
                >
                  <td>{getStatusBadge(job.status)}</td>
                  <td>{getTypeBadge(job.type)}</td>
                  <td>
                    <div style={{ fontSize: '0.875rem' }}>
                      {job.type === 'evaluate' && (
                        <>
                          <div><strong>Trait:</strong> {job.params?.trait}</div>
                          <div><strong>Model:</strong> {job.params?.model}</div>
                        </>
                      )}
                      {job.type === 'generate_vector' && (
                        <>
                          <div><strong>Trait:</strong> {job.params?.trait}</div>
                          <div><strong>Model:</strong> {job.params?.model_name}</div>
                        </>
                      )}
                      {job.type === 'projection' && (
                        <>
                          <div><strong>File:</strong> {job.params?.file_path?.split('/').pop()}</div>
                          <div><strong>Vector:</strong> {job.params?.vector_path?.split('/').pop()}</div>
                        </>
                      )}
                      {job.status === 'failed' && job.error && (
                        <div style={{ color: '#e74c3c', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                          Error: {job.error.substring(0, 100)}...
                        </div>
                      )}
                      {job.status === 'completed' && job.result?.output_file && (
                        <div style={{ color: '#27ae60', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                          Output: {job.result.output_file.split('/').pop()}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#95a5a6', marginTop: '0.25rem' }}>
                      ID: {job.id}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                    {formatDate(job.created_at)}
                  </td>
                  <td style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                    {getDuration(job)}
                    {(job.status === 'pending' || job.status === 'running') && (
                      <span style={{ marginLeft: '0.5rem' }}>⏳</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Job Details</h2>
              <button className="modal-close" onClick={() => setSelectedJob(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                {getStatusBadge(selectedJob.status)}
                {getTypeBadge(selectedJob.type)}
                {(selectedJob.status === 'pending' || selectedJob.status === 'running') && (
                  <div className="loading-spinner"></div>
                )}
              </div>

              <div className="job-detail-section">
                <h3>Job Information</h3>
                <div className="job-detail-grid">
                  <div><strong>ID:</strong></div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{selectedJob.id}</div>
                  <div><strong>Created:</strong></div>
                  <div>{formatDate(selectedJob.created_at)}</div>
                  <div><strong>Started:</strong></div>
                  <div>{formatDate(selectedJob.started_at)}</div>
                  <div><strong>Completed:</strong></div>
                  <div>{formatDate(selectedJob.completed_at)}</div>
                  <div><strong>Duration:</strong></div>
                  <div>{getDuration(selectedJob)}</div>
                </div>
              </div>

              <div className="job-detail-section">
                <h3>Parameters</h3>
                <pre style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {JSON.stringify(selectedJob.params, null, 2)}
                </pre>
              </div>

              {selectedJob.status === 'completed' && selectedJob.result && (
                <div className="job-detail-section">
                  <h3>Result</h3>
                  <div className="alert alert-success">
                    <p><strong>{selectedJob.result.message}</strong></p>
                    {selectedJob.result.output_file && (
                      <p style={{ marginTop: '0.5rem' }}>Output: {selectedJob.result.output_file}</p>
                    )}
                    {selectedJob.result.save_dir && (
                      <p style={{ marginTop: '0.5rem' }}>Save directory: {selectedJob.result.save_dir}</p>
                    )}
                    {selectedJob.result.generated_files && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <p>Generated files:</p>
                        <ul style={{ marginLeft: '1.5rem', marginTop: '0.25rem' }}>
                          {selectedJob.result.generated_files.map(f => <li key={f}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  {selectedJob.result.stdout && (
                    <pre style={{ marginTop: '1rem', maxHeight: '200px', overflow: 'auto' }}>
                      {selectedJob.result.stdout}
                    </pre>
                  )}
                </div>
              )}

              {selectedJob.status === 'failed' && (
                <div className="job-detail-section">
                  <h3>Error</h3>
                  <div className="alert alert-error">
                    {selectedJob.error}
                  </div>
                </div>
              )}

              {selectedJob.stdout && (
                <div className="job-detail-section">
                  <h3>Standard Output</h3>
                  <pre style={{ maxHeight: '300px', overflow: 'auto' }}>
                    {selectedJob.stdout}
                  </pre>
                </div>
              )}

              {selectedJob.stderr && (
                <div className="job-detail-section">
                  <h3>Standard Error</h3>
                  <pre style={{ maxHeight: '200px', overflow: 'auto', background: '#fff5f5' }}>
                    {selectedJob.stderr}
                  </pre>
                </div>
              )}

              {(selectedJob.status === 'pending' || selectedJob.status === 'running') && (
                <div className="job-detail-section">
                  <div className="alert alert-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="loading-spinner"></div>
                      <span>
                        {selectedJob.status === 'pending' ? 'Waiting to start...' : 'Job is running...'}
                      </span>
                    </div>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      This view will update automatically via WebSocket.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Jobs
