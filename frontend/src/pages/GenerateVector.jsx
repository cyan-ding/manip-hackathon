import { useState } from 'react'

function GenerateVector() {
  const [formData, setFormData] = useState({
    model_name: 'Qwen/Qwen2.5-7B-Instruct',
    trait: '',
    pos_path: '',
    neg_path: '',
    save_dir: ''
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
      save_dir: formData.save_dir || null
    }

    try {
      const res = await fetch('/api/generate-vector', {
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
            placeholder="Qwen/Qwen2.5-7B-Instruct"
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
          {loading ? 'Generating...' : 'Generate Vector'}
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
          <p style={{ marginTop: '0.5rem' }}>Save directory: {result.save_dir}</p>
          <p style={{ marginTop: '0.5rem' }}>Generated files:</p>
          <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
            {result.generated_files.map(file => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default GenerateVector
