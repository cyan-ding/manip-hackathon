import { useState, useEffect } from 'react'

function Dashboard() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  return (
    <div className="card">
      <h1>Dashboard</h1>
      
      {loading ? (
        <div className="loading">Loading...</div>
      ) : health ? (
        <div>
          <div className={`status-badge ${health.status === 'ok' ? 'status-ok' : 'status-error'}`}>
            Status: {health.status}
          </div>
          <p style={{ marginTop: '1rem' }}>
            <strong>Service:</strong> {health.service}
          </p>
        </div>
      ) : (
        <div className="alert alert-error">
          Failed to connect to API
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <h2>Welcome to Persona Vectors</h2>
        <p style={{ marginTop: '1rem', lineHeight: '1.6' }}>
          This interface provides access to persona vector generation, model evaluation, 
          and steering capabilities. Use the navigation above to access different features:
        </p>
        <ul style={{ marginTop: '1rem', marginLeft: '2rem', lineHeight: '1.8' }}>
          <li><strong>Traits:</strong> View available personality traits</li>
          <li><strong>Evaluate:</strong> Evaluate models with or without steering</li>
          <li><strong>Generate Vector:</strong> Create persona vectors from evaluations</li>
          <li><strong>Projection:</strong> Calculate activation projections</li>
          <li><strong>Results:</strong> View and download evaluation results</li>
          <li><strong>Vectors:</strong> Browse generated persona vectors</li>
        </ul>
      </div>
    </div>
  )
}

export default Dashboard
