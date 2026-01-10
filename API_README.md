# Persona Vectors REST API

A Flask REST API for the Persona Vectors project, enabling programmatic access to persona vector generation, model evaluation, and steering capabilities.

## Setup

1. Install API dependencies:
```bash
pip install -r requirements-api.txt
```

2. Install persona_vectors dependencies:
```bash
cd persona_vectors
pip install -r requirements.txt
cd ..
```

3. Configure environment variables (create `.env` in `persona_vectors/` directory with your API keys)

## Running the API

```bash
python app.py
```

The API will start on `http://localhost:5000`

## API Endpoints

### Health Check
```
GET /health
```
Returns API status.

### Get Available Traits
```
GET /api/traits
```
Returns list of available personality traits.

**Response:**
```json
{
  "traits": ["evil", "humorous", "optimistic", ...],
  "extract_traits": [...],
  "eval_traits": [...]
}
```

### Evaluate Persona
```
POST /api/evaluate
```
Evaluate a model with or without persona steering.

**Request Body:**
```json
{
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "trait": "evil",
  "version": "eval",
  "judge_model": "gpt-4.1-mini-2025-04-14",
  "gpu": 0,
  "persona_instruction_type": null,
  "assistant_name": null,
  "steering": {
    "type": "response",
    "coef": 2.0,
    "vector_path": "storage/vectors/model_name/evil_response_avg_diff.pt",
    "layer": 20
  }
}
```

**Response:**
```json
{
  "status": "success",
  "output_file": "storage/results/model_trait_eval.csv",
  "message": "Evaluation completed successfully"
}
```

### Generate Persona Vector
```
POST /api/generate-vector
```
Generate persona vector from positive and negative evaluations.

**Request Body:**
```json
{
  "model_name": "Qwen/Qwen2.5-7B-Instruct",
  "trait": "evil",
  "pos_path": "storage/results/pos_results.csv",
  "neg_path": "storage/results/neg_results.csv",
  "save_dir": null
}
```

**Response:**
```json
{
  "status": "success",
  "save_dir": "storage/vectors/Qwen_Qwen2.5-7B-Instruct",
  "generated_files": [
    "evil_prompt_avg_diff.pt",
    "evil_response_avg_diff.pt",
    "evil_prompt_last_diff.pt"
  ],
  "message": "Vector generation completed successfully"
}
```

### Calculate Projection
```
POST /api/projection
```
Calculate projection of activations onto persona vector.

**Request Body:**
```json
{
  "file_path": "storage/results/eval_results.csv",
  "vector_path": "storage/vectors/model/evil_response_avg_diff.pt",
  "layer": 20,
  "model_name": "Qwen/Qwen2.5-7B-Instruct",
  "projection_type": "proj",
  "gpu": 0
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Projection calculation completed successfully",
  "stdout": "..."
}
```

### List Results
```
GET /api/results
```
List all available result files.

**Response:**
```json
{
  "results": [
    {
      "filename": "model_trait_eval.csv",
      "path": "storage/results/model_trait_eval.csv",
      "size": 12345
    }
  ]
}
```

### Download Result
```
GET /api/results/<filename>
```
Download a specific result file.

### List Vectors
```
GET /api/vectors
```
List all available vector files.

**Response:**
```json
{
  "vectors": [
    {
      "filename": "evil_response_avg_diff.pt",
      "path": "model_name/evil_response_avg_diff.pt",
      "full_path": "storage/vectors/model_name/evil_response_avg_diff.pt",
      "size": 54321
    }
  ]
}
```

## Example Workflow

### 1. Generate Positive Evaluation
```bash
curl -X POST http://localhost:5000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "trait": "evil",
    "version": "extract",
    "persona_instruction_type": "pos",
    "assistant_name": "evil"
  }'
```

### 2. Generate Negative Evaluation
```bash
curl -X POST http://localhost:5000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "trait": "evil",
    "version": "extract",
    "persona_instruction_type": "neg",
    "assistant_name": "helpful"
  }'
```

### 3. Generate Vector
```bash
curl -X POST http://localhost:5000/api/generate-vector \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "Qwen/Qwen2.5-7B-Instruct",
    "trait": "evil",
    "pos_path": "storage/results/pos_results.csv",
    "neg_path": "storage/results/neg_results.csv"
  }'
```

### 4. Evaluate with Steering
```bash
curl -X POST http://localhost:5000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "trait": "evil",
    "version": "eval",
    "steering": {
      "type": "response",
      "coef": 2.0,
      "vector_path": "storage/vectors/Qwen_Qwen2.5-7B-Instruct/evil_response_avg_diff.pt",
      "layer": 20
    }
  }'
```

## Notes

- All long-running operations are synchronous (the API waits for completion)
- Results and vectors are stored in the `storage/` directory
- GPU selection can be controlled via the `gpu` parameter (defaults to 0)
- Ensure you have the required model access and API keys configured
