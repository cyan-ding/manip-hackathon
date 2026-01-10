import { useState } from 'react'

function Evaluate() {
  const [formData, setFormData] = useState({
    model: 'Qwen/Qwen2.5-7B-Instruct',
    trait: '',
    version: 'eval',
    judge_model: 'gpt-4.1-mini-2025-04-14',
    gpu: 0,
    persona_instruction_type: '',
    assistant_name: '',
  })
  
  const [enableSteering, setEnableSteering] = useState(false)
  const [steering, setSteering] = useState({
    type: 'response',
    coef: 2.0,
    vector_path: '',
    layer: 20
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
          {loading ? 'Evaluating...' : 'Evaluate'}
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
          <p style={{ marginTop: '0.5rem' }}>Output file: {result.output_file}</p>
        </div>
      )}
    </div>
  )
}

export default Evaluate
