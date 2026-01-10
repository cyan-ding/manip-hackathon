"""
Run inference using EasySteer with persona vectors.

This script demonstrates how to use EasySteer's vLLM integration to run
inference with steering vectors derived from the persona_vectors project.
"""

import os
import sys
import argparse
from pathlib import Path

# Add EasySteer to path
sys.path.insert(0, str(Path(__file__).parent / "EasySteer"))
from vllm import LLM, SamplingParams
from vllm.steer_vectors.request import SteerVectorRequest


def run_inference(
    model_name: str,
    vector_path: str,
    prompts: list[str],
    scale: float = 2.0,
    target_layers: list[int] = None,
    temperature: float = 0.0,
    max_tokens: int = 256,
    gpu_id: str = "0",
):
    """
    Run inference with steering vectors.

    Args:
        model_name: HuggingFace model name or path
        vector_path: Path to the .gguf steering vector file
        prompts: List of prompts to run inference on
        scale: Steering strength (positive enhances, negative suppresses)
        target_layers: Layers to apply steering to (default: layers 10-25)
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        gpu_id: GPU device ID
    """
    # Set GPU
    os.environ["CUDA_VISIBLE_DEVICES"] = gpu_id

    # Default target layers
    if target_layers is None:
        target_layers = list(range(10, 26))

    print(f"Loading model: {model_name}")
    print(f"Using vector: {vector_path}")
    print(f"Scale: {scale}, Target layers: {target_layers}")

    # Initialize LLM with steering enabled
    llm = LLM(
        model=model_name,
        enable_steer_vector=True,  # Enable steering
        enforce_eager=True,  # Required for reliable steering
        tensor_parallel_size=1,
        enable_chunked_prefill=False,  # Avoid potential issues
    )

    # Set up sampling parameters
    sampling_params = SamplingParams(
        temperature=temperature,
        max_tokens=max_tokens,
    )

    # Run baseline (no steering)
    print("\n" + "="*80)
    print("BASELINE (no steering)")
    print("="*80)
    baseline_request = SteerVectorRequest(
        "baseline",
        1,
        steer_vector_local_path=vector_path,
        scale=0.0,  # No steering
        target_layers=target_layers,
        prefill_trigger_tokens=[-1],  # Apply to all tokens
        generate_trigger_tokens=[-1],
    )

    baseline_outputs = llm.generate(prompts, steer_vector_request=baseline_request, sampling_params=sampling_params)

    for i, output in enumerate(baseline_outputs):
        print(f"\nPrompt {i+1}: {prompts[i]}")
        print(f"Response: {output.outputs[0].text}")

    # Run with steering
    print("\n" + "="*80)
    print(f"WITH STEERING (scale={scale})")
    print("="*80)
    steered_request = SteerVectorRequest(
        "persona_steered",
        2,
        steer_vector_local_path=vector_path,
        scale=scale,
        target_layers=target_layers,
        prefill_trigger_tokens=[-1],
        generate_trigger_tokens=[-1],
    )

    steered_outputs = llm.generate(prompts, steer_vector_request=steered_request, sampling_params=sampling_params)

    for i, output in enumerate(steered_outputs):
        print(f"\nPrompt {i+1}: {prompts[i]}")
        print(f"Response: {output.outputs[0].text}")

    print("\n" + "="*80)


def main():
    parser = argparse.ArgumentParser(description="Run inference with EasySteer")
    parser.add_argument(
        "--model",
        type=str,
        default="Qwen/Qwen2.5-7B-Instruct",
        help="Model name or path"
    )
    parser.add_argument(
        "--vector",
        type=str,
        required=True,
        help="Path to steering vector (.gguf file)"
    )
    parser.add_argument(
        "--prompt",
        type=str,
        action="append",
        help="Prompt to test (can be specified multiple times)"
    )
    parser.add_argument(
        "--prompt-file",
        type=str,
        help="File containing prompts (one per line)"
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=2.0,
        help="Steering strength (default: 2.0)"
    )
    parser.add_argument(
        "--layers",
        type=str,
        default="10-25",
        help="Target layers as range 'start-end' (default: 10-25)"
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.0,
        help="Sampling temperature (default: 0.0)"
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=256,
        help="Maximum tokens to generate (default: 256)"
    )
    parser.add_argument(
        "--gpu",
        type=str,
        default="0",
        help="GPU device ID (default: 0)"
    )

    args = parser.parse_args()

    # Parse target layers
    if "-" in args.layers:
        start, end = map(int, args.layers.split("-"))
        target_layers = list(range(start, end + 1))
    else:
        target_layers = [int(x) for x in args.layers.split(",")]

    # Get prompts
    prompts = []
    if args.prompt:
        prompts.extend(args.prompt)
    if args.prompt_file:
        with open(args.prompt_file, 'r') as f:
            prompts.extend([line.strip() for line in f if line.strip()])

    if not prompts:
        # Default test prompts
        prompts = [
            "Tell me about your values and principles.",
            "How would you handle a difficult ethical dilemma?",
            "What's your perspective on helping others?",
        ]
        print("No prompts provided, using default test prompts")

    run_inference(
        model_name=args.model,
        vector_path=args.vector,
        prompts=prompts,
        scale=args.scale,
        target_layers=target_layers,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
        gpu_id=args.gpu,
    )


if __name__ == "__main__":
    main()
