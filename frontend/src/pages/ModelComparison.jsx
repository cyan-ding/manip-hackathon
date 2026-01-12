import { useState, useEffect, useRef } from 'react'

function ModelComparison() {
  const [formData, setFormData] = useState({
    prompt: '',
    system_prompt: '',
    gpu: 0,
    max_tokens: 1000,
    temperature: 0.7,
    top_p: 0.9,
  })

  const [loading, setLoading] = useState(false)
  const [baselineJob, setBaselineJob] = useState(null)
  const [steeredJob, setSteeredJob] = useState(null)
  const [error, setError] = useState(null)
  const pollingRef = useRef({ baseline: null, steered: null })

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current.baseline) clearInterval(pollingRef.current.baseline)
      if (pollingRef.current.steered) clearInterval(pollingRef.current.steered)
    }
  }, [])

  const startPolling = (jobId, modelType, setJobFunc) => {
    if (pollingRef.current[modelType]) {
      clearInterval(pollingRef.current[modelType])
    }

    const pollJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        const jobData = await res.json()
        setJobFunc(jobData)

        if (jobData.status === 'completed' || jobData.status === 'failed') {
          if (pollingRef.current[modelType]) {
            clearInterval(pollingRef.current[modelType])
            pollingRef.current[modelType] = null
          }
        }
      } catch (err) {
        console.error(`Polling error for ${modelType}:`, err)
      }
    }

    pollJob()
    pollingRef.current[modelType] = setInterval(pollJob, 1000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setBaselineJob(null)
    setSteeredJob(null)

    // Clear any existing polling
    if (pollingRef.current.baseline) clearInterval(pollingRef.current.baseline)
    if (pollingRef.current.steered) clearInterval(pollingRef.current.steered)

    const payload = {
      prompt: formData.prompt,
      system_prompt: formData.system_prompt || null,
      gpu: parseInt(formData.gpu),
      max_tokens: parseInt(formData.max_tokens),
      temperature: parseFloat(formData.temperature),
      top_p: parseFloat(formData.top_p),
    }

    try {
      const res = await fetch('/api/dual-inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (data.detail) {
        setError(data.detail)
        setLoading(false)
      } else {
        // Start polling both jobs
        startPolling(data.baseline_job_id, 'baseline', setBaselineJob)
        startPolling(data.steered_job_id, 'steered', setSteeredJob)
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: 'var(--color-gray-300)', color: 'var(--color-black)' },
      running: { bg: 'var(--color-black)', color: 'var(--color-white)' },
      completed: { bg: 'var(--color-white)', color: 'var(--color-black)', borderWidth: '2px' },
      failed: { bg: 'var(--color-black)', color: 'var(--color-white)' }
    }
    const style = styles[status] || styles.pending

    return (
      <span style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: 'calc(var(--spacing-unit) * 0.75) calc(var(--spacing-unit) * 1.5)',
        borderRadius: '0',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-display)',
        border: `${style.borderWidth || '1px'} solid var(--color-black)`,
        display: 'inline-block',
        letterSpacing: '0.05em'
      }}>
        {status}
      </span>
    )
  }

  const renderModelOutput = (job, modelName, description) => {
    if (!job) return null

    return (
      <div style={{
        backgroundColor: 'var(--color-white)',
        borderRadius: '0',
        padding: 'calc(var(--spacing-unit) * 2)',
        border: '2px solid var(--color-black)'
      }}>
        <h3 style={{
          marginTop: 0,
          marginBottom: 'calc(var(--spacing-unit) * 1)',
          color: 'var(--color-black)',
          fontFamily: 'var(--font-display)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          fontWeight: 700
        }}>
          {modelName}
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-600)', marginBottom: 'calc(var(--spacing-unit) * 2)' }}>
          {description}
        </p>

        <div style={{ marginBottom: 'calc(var(--spacing-unit) * 1.5)' }}>
          {getStatusBadge(job.status)}
        </div>

        {job.status === 'completed' && job.result && (
          <div style={{
            backgroundColor: 'var(--color-gray-100)',
            padding: 'calc(var(--spacing-unit) * 1.5)',
            borderRadius: '0',
            border: '1px solid var(--color-gray-300)',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            lineHeight: '1.5',
            fontSize: '0.8125rem'
          }}>
            {job.result.output}
          </div>
        )}

        {job.status === 'failed' && job.error && (
          <div className="alert alert-error">
            <p style={{ fontSize: '0.8125rem' }}><strong>Error:</strong> {job.error}</p>
          </div>
        )}

        {(job.status === 'pending' || job.status === 'running') && (
          <div className="alert alert-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--spacing-unit) * 1.5)' }}>
              <div className="loading-spinner"></div>
              <span style={{ fontSize: '0.8125rem' }}>
                {job.status === 'pending' ? 'Waiting to start...' : 'Generating response...'}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Check if both jobs are done
  const bothJobsDone = baselineJob && steeredJob &&
    (baselineJob.status === 'completed' || baselineJob.status === 'failed') &&
    (steeredJob.status === 'completed' || steeredJob.status === 'failed')

  useEffect(() => {
    if (bothJobsDone) {
      setLoading(false)
    }
  }, [bothJobsDone])

  return (
    <div className="card">
      <h1>Training-Time Steering Comparison</h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2px 1fr',
        gap: 'calc(var(--spacing-unit) * 4)',
        marginTop: 'calc(var(--spacing-unit) * 2)'
      }}>
        {/* Left Column - Form */}
        <div>
          <p style={{ marginBottom: '1rem', color: '#7f8c8d', fontSize: '0.875rem' }}>
            Compare how models respond with and without training-time steering. The baseline model is trained
            normally, while the steered model has persona vectors applied during training to resist
            hallucination-inducing prompts.
          </p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>System Prompt (optional)</label>
              <textarea
                value={formData.system_prompt}
                onChange={e => setFormData({...formData, system_prompt: e.target.value})}
                placeholder="You are a helpful assistant..."
                rows={2}
                style={{ resize: 'vertical' }}
              />
              <small>Optional system message to set the assistant's behavior</small>
            </div>

            <div className="form-group">
              <label>User Prompt *</label>
              <textarea
                value={formData.prompt}
                onChange={e => setFormData({...formData, prompt: e.target.value})}
                placeholder="Try prompting the model to hallucinate... e.g., 'Make up some fake statistics about AI'"
                rows={3}
                required
                style={{ resize: 'vertical' }}
              />
              <small>Try asking for made-up facts, false information, or hallucinated content</small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(var(--spacing-unit) * 2)' }}>
              <div className="form-group">
                <label>Max Tokens</label>
                <input
                  type="number"
                  value={formData.max_tokens}
                  onChange={e => setFormData({...formData, max_tokens: e.target.value})}
                  min="1"
                  max="4096"
                />
              </div>

              <div className="form-group">
                <label>Temperature</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={formData.temperature}
                  onChange={e => setFormData({...formData, temperature: e.target.value})}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(var(--spacing-unit) * 2)' }}>
              <div className="form-group">
                <label>Top P</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={formData.top_p}
                  onChange={e => setFormData({...formData, top_p: e.target.value})}
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
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Generating responses...' : 'Compare Models'}
            </button>
          </form>

          {error && (
            <div className="alert alert-error" style={{ marginTop: 'calc(var(--spacing-unit) * 2)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{
          width: '2px',
          backgroundColor: 'var(--color-black)',
          height: '100%'
        }}></div>

        {/* Right Column - Results */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '600px',
          overflow: 'hidden'
        }}>
          {(baselineJob || steeredJob) ? (
            <>
              <h2 style={{ marginBottom: 'calc(var(--spacing-unit) * 2)', fontSize: '1rem', flexShrink: 0 }}>Comparison Results</h2>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'calc(var(--spacing-unit) * 2)',
                overflowY: 'auto',
                flex: 1
              }}>
                {renderModelOutput(
                  baselineJob,
                  'Baseline Model',
                  'Standard fine-tuned model without training-time steering'
                )}
                {renderModelOutput(
                  steeredJob,
                  'Training-Time Steered Model',
                  'Model trained with persona vectors to resist hallucination'
                )}
              </div>
            </>
          ) : (
            <div style={{
              padding: 'calc(var(--spacing-unit) * 4)',
              border: '1px dashed var(--color-gray-400)',
              textAlign: 'center',
              color: 'var(--color-gray-500)',
              fontSize: '0.875rem',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              Results will appear here after you submit the comparison
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ModelComparison
