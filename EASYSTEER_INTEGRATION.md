# EasySteer Integration Guide

This guide shows how to use EasySteer with your persona vectors for high-performance inference.

## Quick Start

### 1. Convert a Single Vector

```bash
python convert_persona_to_gguf.py \
  --input persona_vectors/persona_vectors/Qwen2.5-7B-Instruct/evil_response_avg_diff.pt \
  --output vectors/evil_response.gguf
```

### 2. Convert All Vectors at Once

```bash
./convert_all_vectors.sh
```

This will convert all `.pt` files in `persona_vectors/persona_vectors/` and save them to the `vectors/` directory.

### 3. Run Inference with Steering

```bash
# Basic usage with default prompts
python inference_with_easysteer.py \
  --vector vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf \
  --scale 2.0

# With custom prompts
python inference_with_easysteer.py \
  --vector vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf \
  --scale 2.0 \
  --prompt "Tell me about your values" \
  --prompt "How would you help someone in need?"

# From a file of prompts
python inference_with_easysteer.py \
  --vector vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf \
  --scale 2.0 \
  --prompt-file my_prompts.txt

# Customize layers and generation settings
python inference_with_easysteer.py \
  --vector vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf \
  --scale 3.0 \
  --layers 15-25 \
  --temperature 0.7 \
  --max-tokens 512
```

## Parameters Explained

### Steering Parameters

- `--scale`: Steering strength
  - Positive values (e.g., `2.0`, `3.0`) enhance the trait
  - Negative values (e.g., `-2.0`) suppress the trait
  - `0.0` is baseline (no steering)

- `--layers`: Which transformer layers to apply steering
  - Range format: `10-25` (layers 10 through 25)
  - List format: `10,15,20,25` (specific layers)
  - Default: `10-25`

### Generation Parameters

- `--temperature`: Sampling temperature (0.0 = deterministic, higher = more random)
- `--max-tokens`: Maximum tokens to generate
- `--gpu`: GPU device ID to use

## Vector Types

Your persona vectors come in three types:

1. **`response_avg_diff.pt`** - Average of response token activations (recommended by paper)
2. **`prompt_avg_diff.pt`** - Average of prompt token activations
3. **`prompt_last_diff.pt`** - Last prompt token activation

For most use cases, use the `response_avg_diff` vectors.

## Example Workflows

### Test Different Steering Strengths

```bash
for scale in -2.0 -1.0 0.0 1.0 2.0 3.0; do
  echo "Testing scale: $scale"
  python inference_with_easysteer.py \
    --vector vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf \
    --scale $scale \
    --prompt "What are your core values?"
done
```

### Compare Multiple Traits

```bash
# Test evil trait
python inference_with_easysteer.py \
  --vector vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf \
  --scale 2.0 \
  --prompt "How would you help someone?"

# Test helpful trait (if you generated it)
python inference_with_easysteer.py \
  --vector vectors/Qwen2.5-7B-Instruct_helpful_response_avg_diff.gguf \
  --scale 2.0 \
  --prompt "How would you help someone?"
```

## Advanced: Python API Usage

You can also use the scripts programmatically:

```python
import sys
sys.path.insert(0, 'EasySteer')

from vllm import LLM, SamplingParams
from vllm.steer_vectors.request import SteerVectorRequest

# Initialize model
llm = LLM(
    model="Qwen/Qwen2.5-7B-Instruct",
    enable_steer_vector=True,
    enforce_eager=True,
    tensor_parallel_size=1,
    enable_chunked_prefill=False
)

# Create steering request
request = SteerVectorRequest(
    "evil_persona",
    1,
    steer_vector_local_path="vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf",
    scale=2.0,
    target_layers=list(range(10, 26)),
    prefill_trigger_tokens=[-1],
    generate_trigger_tokens=[-1]
)

# Generate
sampling_params = SamplingParams(temperature=0.0, max_tokens=256)
outputs = llm.generate(["Your prompt here"],
                       steer_vector_request=request,
                       sampling_params=sampling_params)

print(outputs[0].outputs[0].text)
```

## Troubleshooting

### Memory Issues
If you run out of GPU memory, try:
- Using a smaller model
- Reducing `--max-tokens`
- Applying steering to fewer layers

### Import Errors
Make sure EasySteer is installed:
```bash
cd EasySteer/vllm-steer
VLLM_USE_PRECOMPILED=1 pip install --editable .
cd ..
pip install --editable .
```

### Vector Loading Errors
Ensure your vectors are converted to GGUF format first using `convert_persona_to_gguf.py`.
