from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import subprocess
import json
from pathlib import Path
import glob
import logging

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
BASE_DIR = Path(__file__).parent
PERSONA_DIR = BASE_DIR / "persona_vectors"
TRAIT_DATA_DIR = PERSONA_DIR / "data_generation"
OUTPUT_DIR = PERSONA_DIR / "output"
STORAGE_DIR = BASE_DIR / "storage"

# Ensure directories exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "results").mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "vectors").mkdir(parents=True, exist_ok=True)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    logger.info("Health check requested")
    return jsonify({"status": "ok", "service": "persona-vectors-api"})


@app.route('/api/traits', methods=['GET'])
def get_traits():
    """Get available traits"""
    logger.info("Fetching available traits")
    try:
        extract_dir = TRAIT_DATA_DIR / "trait_data_extract"
        eval_dir = TRAIT_DATA_DIR / "trait_data_eval"
        
        extract_traits = [f.stem for f in extract_dir.glob("*.json")] if extract_dir.exists() else []
        eval_traits = [f.stem for f in eval_dir.glob("*.json")] if eval_dir.exists() else []
        
        # Combine and deduplicate
        all_traits = sorted(set(extract_traits + eval_traits))
        
        logger.info(f"Found {len(all_traits)} total traits")
        return jsonify({
            "traits": all_traits,
            "extract_traits": extract_traits,
            "eval_traits": eval_traits
        })
    except Exception as e:
        logger.error(f"Error fetching traits: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/evaluate', methods=['POST'])
def evaluate_persona():
    """
    Evaluate a model with or without persona steering
    
    Body:
    {
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "trait": "evil",
        "version": "eval",  # or "extract"
        "judge_model": "gpt-4.1-mini-2025-04-14",
        "gpu": 0,
        "persona_instruction_type": null,  # "pos", "neg", or null
        "assistant_name": null,  # e.g., "evil" or "helpful"
        "steering": {  # optional
            "type": "response",  # "response", "prompt", or "all"
            "coef": 2.0,
            "vector_path": "persona_vectors/model/trait_response_avg_diff.pt",
            "layer": 20
        }
    }
    """
    logger.info("Evaluation requested")
    try:
        data = request.json
        model = data.get('model', 'Qwen/Qwen2.5-7B-Instruct')
        trait = data.get('trait')
        version = data.get('version', 'eval')
        judge_model = data.get('judge_model', 'gpt-4.1-mini-2025-04-14')
        gpu = data.get('gpu', 0)
        
        logger.info(f"Evaluation parameters - model: {model}, trait: {trait}, version: {version}, judge_model: {judge_model}, gpu: {gpu}")
        
        if not trait:
            logger.warning("Evaluation request missing trait parameter")
            return jsonify({"error": "trait is required"}), 400
        
        # Generate output filename
        output_filename = f"{model.replace('/', '_')}_{trait}_{version}.csv"
        output_path = STORAGE_DIR / "results" / output_filename
        
        # Build command
        cmd = [
            "python", "-m", "eval.eval_persona",
            "--model", model,
            "--trait", trait,
            "--output_path", str(output_path),
            "--judge_model", judge_model,
            "--version", version
        ]
        
        # Add persona instruction type if specified
        if data.get('persona_instruction_type'):
            cmd.extend(["--persona_instruction_type", data['persona_instruction_type']])
        
        if data.get('assistant_name'):
            cmd.extend(["--assistant_name", data['assistant_name']])
        
        # Add steering parameters if specified
        steering = data.get('steering')
        if steering:
            cmd.extend([
                "--steering_type", steering.get('type', 'response'),
                "--coef", str(steering.get('coef', 2.0)),
                "--vector_path", steering.get('vector_path'),
                "--layer", str(steering.get('layer', 20))
            ])
        
        # Set GPU
        env = os.environ.copy()
        env['CUDA_VISIBLE_DEVICES'] = str(gpu)
        
        logger.info(f"Running evaluation command: {' '.join(cmd)}")
        
        # Run evaluation
        result = subprocess.run(
            cmd,
            cwd=PERSONA_DIR,
            env=env,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            logger.error(f"Evaluation failed with return code {result.returncode}: {result.stderr}")
            return jsonify({
                "error": "Evaluation failed",
                "stderr": result.stderr,
                "stdout": result.stdout
            }), 500
        
        logger.info(f"Evaluation completed successfully, output saved to {output_path}")
        return jsonify({
            "status": "success",
            "output_file": str(output_path),
            "message": "Evaluation completed successfully"
        })
        
    except Exception as e:
        logger.error(f"Error during evaluation: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate-vector', methods=['POST'])
def generate_vector():
    """
    Generate a persona vector from positive and negative evaluations
    
    Body:
    {
        "model_name": "Qwen/Qwen2.5-7B-Instruct",
        "trait": "evil",
        "pos_path": "path/to/pos_results.csv",
        "neg_path": "path/to/neg_results.csv",
        "save_dir": null  # optional, defaults to storage/vectors/model_name/
    }
    """
    logger.info("Vector generation requested")
    try:
        data = request.json
        model_name = data.get('model_name')
        trait = data.get('trait')
        pos_path = data.get('pos_path')
        neg_path = data.get('neg_path')
        
        logger.info(f"Vector generation parameters - model_name: {model_name}, trait: {trait}, pos_path: {pos_path}, neg_path: {neg_path}")
        
        if not all([model_name, trait, pos_path, neg_path]):
            logger.warning("Vector generation request missing required parameters")
            return jsonify({"error": "model_name, trait, pos_path, and neg_path are required"}), 400
        
        # Default save directory
        save_dir = data.get('save_dir')
        if not save_dir:
            save_dir = STORAGE_DIR / "vectors" / model_name.replace('/', '_')
            save_dir.mkdir(parents=True, exist_ok=True)
        
        # Build command
        cmd = [
            "python", "generate_vec.py",
            "--model_name", model_name,
            "--pos_path", pos_path,
            "--neg_path", neg_path,
            "--trait", trait,
            "--save_dir", str(save_dir)
        ]
        
        logger.info(f"Running vector generation command: {' '.join(cmd)}")
        
        # Run vector generation
        result = subprocess.run(
            cmd,
            cwd=PERSONA_DIR,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            logger.error(f"Vector generation failed with return code {result.returncode}: {result.stderr}")
            return jsonify({
                "error": "Vector generation failed",
                "stderr": result.stderr,
                "stdout": result.stdout
            }), 500
        
        # List generated files
        generated_files = [
            f"{trait}_prompt_avg_diff.pt",
            f"{trait}_response_avg_diff.pt",
            f"{trait}_prompt_last_diff.pt"
        ]
        
        logger.info(f"Vector generation completed successfully, saved to {save_dir}")
        return jsonify({
            "status": "success",
            "save_dir": str(save_dir),
            "generated_files": generated_files,
            "message": "Vector generation completed successfully"
        })
        
    except Exception as e:
        logger.error(f"Error during vector generation: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/projection', methods=['POST'])
def calculate_projection():
    """
    Calculate projection of activations onto persona vector
    
    Body:
    {
        "file_path": "path/to/results.csv",
        "vector_path": "path/to/vector.pt",
        "layer": 20,
        "model_name": "Qwen/Qwen2.5-7B-Instruct",
        "projection_type": "proj",  # "proj" or other types
        "gpu": 0
    }
    """
    logger.info("Projection calculation requested")
    try:
        data = request.json
        file_path = data.get('file_path')
        vector_path = data.get('vector_path')
        layer = data.get('layer', 20)
        model_name = data.get('model_name', 'Qwen/Qwen2.5-7B-Instruct')
        projection_type = data.get('projection_type', 'proj')
        gpu = data.get('gpu', 0)
        
        logger.info(f"Projection calculation parameters - file_path: {file_path}, vector_path: {vector_path}, layer: {layer}, model_name: {model_name}, projection_type: {projection_type}, gpu: {gpu}")
        
        if not all([file_path, vector_path]):
            logger.warning("Projection calculation request missing required parameters")
            return jsonify({"error": "file_path and vector_path are required"}), 400
        
        # Build command
        cmd = [
            "python", "-m", "eval.cal_projection",
            "--file_path", file_path,
            "--vector_path", vector_path,
            "--layer", str(layer),
            "--model_name", model_name,
            "--projection_type", projection_type
        ]
        
        # Set GPU
        env = os.environ.copy()
        env['CUDA_VISIBLE_DEVICES'] = str(gpu)
        
        logger.info(f"Running projection calculation command: {' '.join(cmd)}")
        
        # Run projection calculation
        result = subprocess.run(
            cmd,
            cwd=PERSONA_DIR,
            env=env,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            logger.error(f"Projection calculation failed with return code {result.returncode}: {result.stderr}")
            return jsonify({
                "error": "Projection calculation failed",
                "stderr": result.stderr,
                "stdout": result.stdout
            }), 500
        
        logger.info("Projection calculation completed successfully")
        return jsonify({
            "status": "success",
            "message": "Projection calculation completed successfully",
            "stdout": result.stdout
        })
        
    except Exception as e:
        logger.error(f"Error during projection calculation: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/results', methods=['GET'])
def list_results():
    """List all available result files"""
    logger.info("Listing result files")
    try:
        results_dir = STORAGE_DIR / "results"
        results = []
        
        if results_dir.exists():
            for file in results_dir.glob("*.csv"):
                results.append({
                    "filename": file.name,
                    "path": str(file),
                    "size": file.stat().st_size
                })
        
        logger.info(f"Found {len(results)} result files")
        return jsonify({"results": results})
    except Exception as e:
        logger.error(f"Error listing results: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/results/<filename>', methods=['GET'])
def get_result(filename):
    """Download a specific result file"""
    logger.info(f"Result file download requested: {filename}")
    try:
        file_path = STORAGE_DIR / "results" / filename
        
        if not file_path.exists():
            logger.warning(f"Result file not found: {filename}")
            return jsonify({"error": "File not found"}), 404
        
        logger.info(f"Sending result file: {filename}")
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        logger.error(f"Error retrieving result file {filename}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/vectors', methods=['GET'])
def list_vectors():
    """List all available vector files"""
    logger.info("Listing vector files")
    try:
        vectors_dir = STORAGE_DIR / "vectors"
        vectors = []
        
        if vectors_dir.exists():
            for file in vectors_dir.rglob("*.pt"):
                vectors.append({
                    "filename": file.name,
                    "path": str(file.relative_to(vectors_dir)),
                    "full_path": str(file),
                    "size": file.stat().st_size
                })
        
        logger.info(f"Found {len(vectors)} vector files")
        return jsonify({"vectors": vectors})
    except Exception as e:
        logger.error(f"Error listing vectors: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Flask application on 0.0.0.0:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
