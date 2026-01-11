from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import os
import asyncio
from pathlib import Path
import logging
import uuid
from datetime import datetime
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Persona Vectors API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


# ==================== Job Management ====================

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    EXTRACT = "extract"
    EVAL = "eval"
    GENERATE_VECTOR = "generate_vector"
    PROJECTION = "projection"
    INFERENCE = "inference"


class Job(BaseModel):
    id: str
    type: JobType
    status: JobStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    params: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None


# In-memory job storage (consider using Redis for production)
jobs: Dict[str, Job] = {}


async def run_subprocess_streaming(cmd: List[str], cwd: Path, env: dict, job_id: str) -> int:
    """Run a subprocess asynchronously with streaming output"""
    job = jobs[job_id]
    job.stdout = ""
    job.stderr = ""
    
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    async def read_stream(stream, is_stderr: bool):
        """Read from a stream and update job output"""
        while True:
            line = await stream.readline()
            if not line:
                break
            decoded_line = line.decode()
            if is_stderr:
                job.stderr = (job.stderr or "") + decoded_line
            else:
                job.stdout = (job.stdout or "") + decoded_line
    
    # Read both streams concurrently
    await asyncio.gather(
        read_stream(process.stdout, is_stderr=False),
        read_stream(process.stderr, is_stderr=True)
    )
    
    # Wait for process to complete
    await process.wait()
    return process.returncode


async def run_subprocess(cmd: List[str], cwd: Path, env: dict) -> tuple[int, str, str]:
    """Run a subprocess asynchronously (non-streaming version for backwards compatibility)"""
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    return process.returncode, stdout.decode(), stderr.decode()


async def execute_job(job_id: str):
    """Execute a job and update its status"""
    job = jobs[job_id]
    job.status = JobStatus.RUNNING
    job.started_at = datetime.now()
    
    try:
        if job.type == JobType.EXTRACT:
            returncode = await run_extract_job_streaming(job.params, job_id)
        elif job.type == JobType.EVAL:
            returncode = await run_eval_job_streaming(job.params, job_id)
        elif job.type == JobType.GENERATE_VECTOR:
            returncode = await run_generate_vector_job_streaming(job.params, job_id)
        elif job.type == JobType.PROJECTION:
            returncode = await run_projection_job_streaming(job.params, job_id)
        elif job.type == JobType.INFERENCE:
            returncode = await run_inference_job_streaming(job.params, job_id)
        else:
            raise ValueError(f"Unknown job type: {job.type}")
        
        if returncode != 0:
            job.status = JobStatus.FAILED
            job.error = f"Process exited with code {returncode}"
            logger.error(f"Job {job_id} failed: {job.error}")
        else:
            job.status = JobStatus.COMPLETED
            job.result = get_job_result(job)
            logger.info(f"Job {job_id} completed successfully")
            
    except Exception as e:
        job.status = JobStatus.FAILED
        job.error = str(e)
        logger.error(f"Job {job_id} failed with exception: {e}", exc_info=True)
    
    job.completed_at = datetime.now()


def get_job_result(job: Job) -> Dict[str, Any]:
    """Get the result data based on job type"""
    if job.type == JobType.EXTRACT:
        return {
            "output_file": job.params.get("output_path"),
            "message": "Extraction completed successfully"
        }
    elif job.type == JobType.EVAL:
        return {
            "output_file": job.params.get("output_path"),
            "message": "Steering evaluation completed successfully"
        }
    elif job.type == JobType.GENERATE_VECTOR:
        trait = job.params.get("trait")
        return {
            "save_dir": job.params.get("save_dir"),
            "generated_files": [
                f"{trait}_prompt_avg_diff.pt",
                f"{trait}_response_avg_diff.pt",
                f"{trait}_prompt_last_diff.pt"
            ],
            "message": "Vector generation completed successfully"
        }
    elif job.type == JobType.PROJECTION:
        return {
            "message": "Projection calculation completed successfully",
            "stdout": job.stdout
        }
    elif job.type == JobType.INFERENCE:
        # Parse the JSON output from the inference script
        import re
        stdout = job.stdout or ""
        try:
            # Find the JSON after "=== INFERENCE RESULT ==="
            match = re.search(r'=== INFERENCE RESULT ===\s*(.+)', stdout, re.DOTALL)
            if match:
                import json
                result = json.loads(match.group(1).strip())
                return result
        except:
            pass
        return {
            "message": "Inference completed",
            "output": stdout
        }
    return {}


async def run_extract_job_streaming(params: Dict[str, Any], job_id: str) -> int:
    """Run extraction job with streaming output"""
    model = params.get('model', 'Qwen/Qwen2.5-7B-Instruct')
    trait = params.get('trait')
    judge_model = params.get('judge_model', 'gpt-4.1-mini')
    gpu = params.get('gpu', 0)
    output_path = params.get('output_path')
    
    cmd = [
        "python", "-m", "eval.eval_persona",
        "--model", model,
        "--trait", trait,
        "--output_path", output_path,
        "--judge_model", judge_model,
        "--version", "extract",
        "--use_judge", "False"
    ]
    
    if params.get('persona_instruction_type'):
        cmd.extend(["--persona_instruction_type", params['persona_instruction_type']])
    
    if params.get('assistant_name'):
        cmd.extend(["--assistant_name", params['assistant_name']])
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu)
    
    logger.info(f"Running extraction command: {' '.join(cmd)}")
    return await run_subprocess_streaming(cmd, PERSONA_DIR, env, job_id)


async def run_eval_job_streaming(params: Dict[str, Any], job_id: str) -> int:
    """Run steering evaluation job with streaming output"""
    model = params.get('model', 'Qwen/Qwen2.5-7B-Instruct')
    trait = params.get('trait')
    judge_model = params.get('judge_model', 'gpt-4.1-mini')
    gpu = params.get('gpu', 0)
    output_path = params.get('output_path')
    use_judge = params.get('use_judge', False)
    
    # Steering params
    steering_type = params.get('steering_type', 'response')
    coef = params.get('coef', 2.0)
    vector_path = params.get('vector_path')
    layer = params.get('layer', 20)
    
    cmd = [
        "python", "-m", "eval.eval_persona",
        "--model", model,
        "--trait", trait,
        "--output_path", output_path,
        "--judge_model", judge_model,
        "--version", "eval",
        "--steering_type", steering_type,
        "--coef", str(coef),
        "--vector_path", vector_path,
        "--layer", str(layer),
        "--use_judge", str(use_judge)
    ]
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu)
    
    logger.info(f"Running steering evaluation command: {' '.join(cmd)}")
    return await run_subprocess_streaming(cmd, PERSONA_DIR, env, job_id)


async def run_generate_vector_job_streaming(params: Dict[str, Any], job_id: str) -> int:
    """Run vector generation job with streaming output"""
    model_name = params.get('model_name')
    trait = params.get('trait')
    pos_path = params.get('pos_path')
    neg_path = params.get('neg_path')
    save_dir = params.get('save_dir')
    
    cmd = [
        "python", "generate_vec.py",
        "--model_name", model_name,
        "--pos_path", pos_path,
        "--neg_path", neg_path,
        "--trait", trait,
        "--save_dir", save_dir
    ]
    
    logger.info(f"Running vector generation command: {' '.join(cmd)}")
    return await run_subprocess_streaming(cmd, PERSONA_DIR, os.environ.copy(), job_id)


async def run_projection_job_streaming(params: Dict[str, Any], job_id: str) -> int:
    """Run projection calculation job with streaming output"""
    file_path = params.get('file_path')
    vector_path = params.get('vector_path')
    layer = params.get('layer', 20)
    model_name = params.get('model_name', 'Qwen/Qwen2.5-7B-Instruct')
    projection_type = params.get('projection_type', 'proj')
    gpu = params.get('gpu', 0)
    
    cmd = [
        "python", "-m", "eval.cal_projection",
        "--file_path", file_path,
        "--vector_path", vector_path,
        "--layer", str(layer),
        "--model_name", model_name,
        "--projection_type", projection_type
    ]
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu)
    
    logger.info(f"Running projection calculation command: {' '.join(cmd)}")
    return await run_subprocess_streaming(cmd, PERSONA_DIR, env, job_id)


async def run_inference_job_streaming(params: Dict[str, Any], job_id: str) -> int:
    """Run inference job with streaming output"""
    model = params.get('model', 'Qwen/Qwen2.5-7B-Instruct')
    prompt = params.get('prompt')
    system_prompt = params.get('system_prompt')
    gpu = params.get('gpu', 0)
    max_tokens = params.get('max_tokens', 1000)
    temperature = params.get('temperature', 0.7)
    top_p = params.get('top_p', 0.9)
    
    # Steering params
    coef = params.get('coef', 0)
    vector_path = params.get('vector_path')
    layer = params.get('layer', 20)
    steering_type = params.get('steering_type', 'response')
    
    cmd = [
        "python", "inference.py",
        "--model", model,
        "--prompt", prompt,
        "--max_tokens", str(max_tokens),
        "--temperature", str(temperature),
        "--top_p", str(top_p),
        "--coef", str(coef),
        "--layer", str(layer),
        "--steering_type", steering_type,
    ]
    
    if system_prompt:
        cmd.extend(["--system_prompt", system_prompt])
    
    if vector_path and coef != 0:
        cmd.extend(["--vector_path", vector_path])
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu)
    
    logger.info(f"Running inference command: {' '.join(cmd)}")
    return await run_subprocess_streaming(cmd, PERSONA_DIR, env, job_id)


async def run_evaluate_job(params: Dict[str, Any]) -> tuple[int, str, str]:
    """Run evaluation job"""
    model = params.get('model', 'Qwen/Qwen2.5-7B-Instruct')
    trait = params.get('trait')
    version = params.get('version', 'eval')
    judge_model = params.get('judge_model', 'gpt-4.1-mini')
    gpu = params.get('gpu', 0)
    output_path = params.get('output_path')
    
    cmd = [
        "python", "-m", "eval.eval_persona",
        "--model", model,
        "--trait", trait,
        "--output_path", output_path,
        "--judge_model", judge_model,
        "--version", version
    ]
    
    if params.get('persona_instruction_type'):
        cmd.extend(["--persona_instruction_type", params['persona_instruction_type']])
    
    if params.get('assistant_name'):
        cmd.extend(["--assistant_name", params['assistant_name']])
    
    if not params.get('use_judge', False):
        cmd.extend(["--use_judge", "False"])
    
    steering = params.get('steering')
    if steering:
        cmd.extend([
            "--steering_type", steering.get('type', 'response'),
            "--coef", str(steering.get('coef', 2.0)),
            "--vector_path", steering.get('vector_path'),
            "--layer", str(steering.get('layer', 20))
        ])
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu)
    
    logger.info(f"Running evaluation command: {' '.join(cmd)}")
    return await run_subprocess(cmd, PERSONA_DIR, env)


async def run_generate_vector_job(params: Dict[str, Any]) -> tuple[int, str, str]:
    """Run vector generation job"""
    model_name = params.get('model_name')
    trait = params.get('trait')
    pos_path = params.get('pos_path')
    neg_path = params.get('neg_path')
    save_dir = params.get('save_dir')
    
    cmd = [
        "python", "generate_vec.py",
        "--model_name", model_name,
        "--pos_path", pos_path,
        "--neg_path", neg_path,
        "--trait", trait,
        "--save_dir", save_dir
    ]
    
    logger.info(f"Running vector generation command: {' '.join(cmd)}")
    return await run_subprocess(cmd, PERSONA_DIR, os.environ.copy())


async def run_projection_job(params: Dict[str, Any]) -> tuple[int, str, str]:
    """Run projection calculation job"""
    file_path = params.get('file_path')
    vector_path = params.get('vector_path')
    layer = params.get('layer', 20)
    model_name = params.get('model_name', 'Qwen/Qwen2.5-7B-Instruct')
    projection_type = params.get('projection_type', 'proj')
    gpu = params.get('gpu', 0)
    
    cmd = [
        "python", "-m", "eval.cal_projection",
        "--file_path", file_path,
        "--vector_path", vector_path,
        "--layer", str(layer),
        "--model_name", model_name,
        "--projection_type", projection_type
    ]
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu)
    
    logger.info(f"Running projection calculation command: {' '.join(cmd)}")
    return await run_subprocess(cmd, PERSONA_DIR, env)


# ==================== Pydantic Models ====================

class ExtractRequest(BaseModel):
    model: str = "Qwen/Qwen2.5-7B-Instruct"
    trait: str
    judge_model: str = "gpt-4.1-mini"
    gpu: int = 0
    persona_instruction_type: Optional[str] = None
    assistant_name: Optional[str] = None


class EvalRequest(BaseModel):
    model: str = "Qwen/Qwen2.5-7B-Instruct"
    trait: str
    judge_model: str = "gpt-4.1-mini"
    gpu: int = 0
    use_judge: bool = False
    steering_type: str = "response"
    coef: float = 2.0
    vector_path: str
    layer: int = 20


class GenerateVectorRequest(BaseModel):
    model_name: str
    trait: str
    pos_path: str
    neg_path: str
    save_dir: Optional[str] = None


class ProjectionRequest(BaseModel):
    file_path: str
    vector_path: str
    layer: int = 20
    model_name: str = "Qwen/Qwen3-4B-Instruct-2507"
    projection_type: str = "proj"
    gpu: int = 0


class InferenceRequest(BaseModel):
    model: str = "Qwen/Qwen3-4B-Instruct-2507"
    prompt: str
    system_prompt: Optional[str] = None
    gpu: int = 0
    max_tokens: int = 1000
    temperature: float = 0.7
    top_p: float = 0.9
    # Steering params (optional)
    coef: float = 0  # 0 = no steering
    vector_path: Optional[str] = None
    layer: int = 20
    steering_type: str = "response"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str


class TraitsResponse(BaseModel):
    traits: List[str]
    extract_traits: List[str]
    eval_traits: List[str]


class ResultFile(BaseModel):
    filename: str
    path: str
    size: int


class VectorFile(BaseModel):
    filename: str
    path: str
    full_path: str
    size: int


# ==================== Routes ====================

@app.get("/health")
async def health():
    """Health check endpoint"""
    logger.info("Health check requested")
    return {"status": "ok", "service": "persona-vectors-api"}


@app.get("/api/traits", response_model=TraitsResponse)
async def get_traits():
    """Get available traits"""
    logger.info("Fetching available traits")
    try:
        extract_dir = TRAIT_DATA_DIR / "trait_data_extract"
        eval_dir = TRAIT_DATA_DIR / "trait_data_eval"
        
        extract_traits = [f.stem for f in extract_dir.glob("*.json")] if extract_dir.exists() else []
        eval_traits = [f.stem for f in eval_dir.glob("*.json")] if eval_dir.exists() else []
        
        all_traits = sorted(set(extract_traits + eval_traits))
        
        logger.info(f"Found {len(all_traits)} total traits")
        return TraitsResponse(
            traits=all_traits,
            extract_traits=extract_traits,
            eval_traits=eval_traits
        )
    except Exception as e:
        logger.error(f"Error fetching traits: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/extract", response_model=JobResponse)
async def extract_persona(request: ExtractRequest):
    """
    Start a persona extraction job
    
    Returns a job_id that can be used to track progress via GET /api/jobs/{job_id}
    """
    logger.info("Extraction requested")
    
    if not request.trait:
        raise HTTPException(status_code=400, detail="trait is required")
    
    if not request.persona_instruction_type:
        raise HTTPException(status_code=400, detail="persona_instruction_type is required")
    
    # Generate output filename
    output_filename = f"{request.model.replace('/', '_')}_{request.trait}_extract_{request.persona_instruction_type}.csv"
    output_path = str(STORAGE_DIR / "results" / output_filename)
    
    # Create job
    job_id = str(uuid.uuid4())
    params = request.model_dump()
    params['output_path'] = output_path
    
    job = Job(
        id=job_id,
        type=JobType.EXTRACT,
        status=JobStatus.PENDING,
        created_at=datetime.now(),
        params=params
    )
    jobs[job_id] = job
    
    # Start job execution in background
    asyncio.create_task(execute_job(job_id))
    
    logger.info(f"Created extraction job {job_id}")
    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Extraction job created. Poll GET /api/jobs/{job_id} to track progress."
    )


@app.post("/api/eval", response_model=JobResponse)
async def eval_steering(request: EvalRequest):
    """
    Start a steering evaluation job
    
    Returns a job_id that can be used to track progress via GET /api/jobs/{job_id}
    """
    logger.info("Steering evaluation requested")
    
    if not request.trait:
        raise HTTPException(status_code=400, detail="trait is required")
    
    if not request.vector_path:
        raise HTTPException(status_code=400, detail="vector_path is required")
    
    # Generate output filename based on steering params
    output_filename = f"{request.model.replace('/', '_')}_{request.trait}_steer_{request.steering_type}_layer{request.layer}_coef{request.coef}.csv"
    output_path = str(STORAGE_DIR / "results" / output_filename)
    
    # Create job
    job_id = str(uuid.uuid4())
    params = request.model_dump()
    params['output_path'] = output_path
    
    job = Job(
        id=job_id,
        type=JobType.EVAL,
        status=JobStatus.PENDING,
        created_at=datetime.now(),
        params=params
    )
    jobs[job_id] = job
    
    # Start job execution in background
    asyncio.create_task(execute_job(job_id))
    
    logger.info(f"Created steering evaluation job {job_id}")
    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Steering evaluation job created. Poll GET /api/jobs/{job_id} to track progress."
    )


@app.post("/api/inference", response_model=JobResponse)
async def run_inference(request: InferenceRequest):
    """
    Start an inference job with optional steering
    
    Returns a job_id that can be used to track progress via GET /api/jobs/{job_id}
    """
    logger.info("Inference requested")
    
    if not request.prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    
    if request.coef != 0 and not request.vector_path:
        raise HTTPException(status_code=400, detail="vector_path is required when coef is not 0")
    
    # Create job
    job_id = str(uuid.uuid4())
    params = request.model_dump()
    
    job = Job(
        id=job_id,
        type=JobType.INFERENCE,
        status=JobStatus.PENDING,
        created_at=datetime.now(),
        params=params
    )
    jobs[job_id] = job
    
    # Start job execution in background
    asyncio.create_task(execute_job(job_id))
    
    logger.info(f"Created inference job {job_id}")
    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Inference job created. Poll GET /api/jobs/{job_id} to track progress."
    )


@app.post("/api/generate-vector", response_model=JobResponse)
async def generate_vector(request: GenerateVectorRequest):
    """
    Start a vector generation job
    
    Returns a job_id that can be used to track progress via GET /api/jobs/{job_id}
    """
    logger.info("Vector generation requested")
    
    if not all([request.model_name, request.trait, request.pos_path, request.neg_path]):
        raise HTTPException(status_code=400, detail="model_name, trait, pos_path, and neg_path are required")
    
    # Default save directory
    save_dir = request.save_dir
    if not save_dir:
        save_dir_path = STORAGE_DIR / "vectors" / request.model_name.replace('/', '_')
        save_dir_path.mkdir(parents=True, exist_ok=True)
        save_dir = str(save_dir_path)
    
    # Create job
    job_id = str(uuid.uuid4())
    params = request.model_dump()
    params['save_dir'] = save_dir
    
    job = Job(
        id=job_id,
        type=JobType.GENERATE_VECTOR,
        status=JobStatus.PENDING,
        created_at=datetime.now(),
        params=params
    )
    jobs[job_id] = job
    
    # Start job execution in background
    asyncio.create_task(execute_job(job_id))
    
    logger.info(f"Created vector generation job {job_id}")
    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Vector generation job created. Poll GET /api/jobs/{job_id} to track progress."
    )


@app.post("/api/projection", response_model=JobResponse)
async def calculate_projection(request: ProjectionRequest):
    """
    Start a projection calculation job
    
    Returns a job_id that can be used to track progress via GET /api/jobs/{job_id}
    """
    logger.info("Projection calculation requested")
    
    if not all([request.file_path, request.vector_path]):
        raise HTTPException(status_code=400, detail="file_path and vector_path are required")
    
    # Create job
    job_id = str(uuid.uuid4())
    params = request.model_dump()
    
    job = Job(
        id=job_id,
        type=JobType.PROJECTION,
        status=JobStatus.PENDING,
        created_at=datetime.now(),
        params=params
    )
    jobs[job_id] = job
    
    # Start job execution in background
    asyncio.create_task(execute_job(job_id))
    
    logger.info(f"Created projection job {job_id}")
    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Projection calculation job created. Poll GET /api/jobs/{job_id} to track progress."
    )


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """Get the status and details of a job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@app.get("/api/jobs")
async def list_jobs():
    """List all jobs"""
    return {"jobs": list(jobs.values())}


@app.get("/api/results", response_model=Dict[str, List[ResultFile]])
async def list_results():
    """List all available result files"""
    logger.info("Listing result files")
    try:
        results_dir = STORAGE_DIR / "results"
        results = []
        
        if results_dir.exists():
            for file in results_dir.glob("*.csv"):
                results.append(ResultFile(
                    filename=file.name,
                    path=str(file),
                    size=file.stat().st_size
                ))
        
        logger.info(f"Found {len(results)} result files")
        return {"results": results}
    except Exception as e:
        logger.error(f"Error listing results: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/results/{filename}")
async def get_result(filename: str):
    """Download a specific result file"""
    logger.info(f"Result file download requested: {filename}")
    try:
        file_path = STORAGE_DIR / "results" / filename
        
        if not file_path.exists():
            logger.warning(f"Result file not found: {filename}")
            raise HTTPException(status_code=404, detail="File not found")
        
        logger.info(f"Sending result file: {filename}")
        return FileResponse(file_path, filename=filename)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving result file {filename}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/vectors", response_model=Dict[str, List[VectorFile]])
async def list_vectors():
    """List all available vector files"""
    logger.info("Listing vector files")
    try:
        vectors_dir = STORAGE_DIR / "vectors"
        vectors = []
        
        if vectors_dir.exists():
            for file in vectors_dir.rglob("*.pt"):
                vectors.append(VectorFile(
                    filename=file.name,
                    path=str(file.relative_to(vectors_dir)),
                    full_path=str(file),
                    size=file.stat().st_size
                ))
        
        logger.info(f"Found {len(vectors)} vector files")
        return {"vectors": vectors}
    except Exception as e:
        logger.error(f"Error listing vectors: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    import uvicorn
    logger.info("Starting FastAPI application on 0.0.0.0:5000")
    uvicorn.run(app, host='0.0.0.0', port=5000)
