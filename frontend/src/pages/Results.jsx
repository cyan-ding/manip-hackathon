import { useState, useEffect } from 'react'

function Results() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchResults()
  }, [])

  const fetchResults = () => {
    setLoading(true)
    fetch('/api/results')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setResults(data.results)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  const downloadFile = (filename) => {
    window.open(`/api/results/${filename}`, '_blank')
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="card">
      <h1>Evaluation Results</h1>
      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        View and download evaluation result files
      </p>

      {loading && <div className="loading">Loading results...</div>}
      
      {error && (
        <div className="alert alert-error">
          Error: {error}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="alert alert-info">
          No results found. Run some evaluations first!
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="grid">
          {results.map(result => (
            <div key={result.filename} className="list-item">
              <h3>{result.filename}</h3>
              <p>Size: {formatFileSize(result.size)}</p>
              <p style={{ fontSize: '0.75rem', color: '#95a5a6', marginTop: '0.5rem' }}>
                {result.path}
              </p>
              <button
                onClick={() => downloadFile(result.filename)}
                className="btn btn-primary"
                style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={fetchResults}
        className="btn btn-primary"
        style={{ marginTop: '2rem' }}
      >
        Refresh
      </button>
    </div>
  )
}

export default Results
