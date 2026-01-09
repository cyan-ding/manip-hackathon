import { useState } from 'react'

function Projection() {
  const [formData, setFormData] = useState({
    file_path: '',
    vector_path: '',
    layer: 20,
    model_name: 'Qwen/Qwen2.5-7B-Instruct',
    projection_type: 'proj',
    gpu: 0
  })

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setError(null)

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
      
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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
            placeholder="Qwen/Qwen2.5-7B-Instruct"
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
          {loading ? 'Calculating...' : 'Calculate Projection'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="alert alert-success" style={{ marginTop: '1rem' }}>
          <strong>{result.message}</strong>
          {result.stdout && (
            <pre style={{ marginTop: '1rem', maxHeight: '300px', overflow: 'auto' }}>
              {result.stdout}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default Projection
