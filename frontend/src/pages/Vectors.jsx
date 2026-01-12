import { useState, useEffect } from 'react'

function Vectors() {
  const [vectors, setVectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchVectors()
  }, [])

  const fetchVectors = () => {
    setLoading(true)
    fetch('/api/vectors')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setVectors(data.vectors)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getVectorType = (filename) => {
    if (filename.includes('response_avg_diff')) return 'Response Avg'
    if (filename.includes('prompt_avg_diff')) return 'Prompt Avg'
    if (filename.includes('prompt_last_diff')) return 'Prompt Last'
    return 'Unknown'
  }

  return (
    <div className="card">
      <h1>Persona Vectors</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Browse generated persona vector files
      </p>

      {loading && <div className="loading">Loading vectors...</div>}
      
      {error && (
        <div className="alert alert-error">
          Error: {error}
        </div>
      )}

      {!loading && !error && vectors.length === 0 && (
        <div className="alert alert-info">
          No vectors found. Generate some vectors first!
        </div>
      )}

      {!loading && !error && vectors.length > 0 && (
        <div className="grid">
          {vectors.map((vector, idx) => (
            <div key={idx} className="list-item">
              <h3>{vector.filename}</h3>
              <p>
                <span className="badge badge-primary">{getVectorType(vector.filename)}</span>
              </p>
              <p>Size: {formatFileSize(vector.size)}</p>
              <p style={{ fontSize: '0.75rem', color: '#95a5a6', marginTop: '0.5rem' }}>
                {vector.path}
              </p>
              <p style={{ fontSize: '0.7rem', color: '#bdc3c7', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                {vector.full_path}
              </p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={fetchVectors}
        className="btn btn-primary"
        style={{ marginTop: '2rem' }}
      >
        Refresh
      </button>
    </div>
  )
}

export default Vectors
