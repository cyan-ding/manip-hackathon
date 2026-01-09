import { useState, useEffect } from 'react'

function Traits() {
  const [traits, setTraits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/traits')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setTraits(data)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <div className="card">
      <h1>Available Traits</h1>
      
      {loading && <div className="loading">Loading traits...</div>}
      
      {error && (
        <div className="alert alert-error">
          Error: {error}
        </div>
      )}
      
      {traits && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <h2>All Traits ({traits.traits.length})</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
              {traits.traits.map(trait => (
                <span key={trait} className="badge badge-primary">
                  {trait}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3>Extract Traits ({traits.extract_traits.length})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
              {traits.extract_traits.map(trait => (
                <span key={trait} className="badge badge-primary">
                  {trait}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3>Eval Traits ({traits.eval_traits.length})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
              {traits.eval_traits.map(trait => (
                <span key={trait} className="badge badge-primary">
                  {trait}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Traits
