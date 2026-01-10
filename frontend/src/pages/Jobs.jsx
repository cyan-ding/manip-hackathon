import { useState, useEffect } from 'react'

function Jobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
                <tr key={job.id}>
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
    </div>
  )
}

export default Jobs
