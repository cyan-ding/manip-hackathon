from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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
    EVALUATE = "evaluate"
    GENERATE_VECTOR = "generate_vector"
    PROJECTION = "projection"


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


# WebSocket connections for job updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}  # job_id -> list of websockets

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.active_connections:
            self.active_connections[job_id] = []
        self.active_connections[job_id].append(websocket)
        logger.info(f"WebSocket connected for job {job_id}")

    def disconnect(self, websocket: WebSocket, job_id: str):
        if job_id in self.active_connections:
            if websocket in self.active_connections[job_id]:
                self.active_connections[job_id].remove(websocket)
            if not self.active_connections[job_id]:
                del self.active_connections[job_id]
        logger.info(f"WebSocket disconnected for job {job_id}")

    async def send_job_update(self, job_id: str, job: Job):
        if job_id in self.active_connections:
            message = job.model_dump_json()
            disconnected = []
            for connection in self.active_connections[job_id]:
                try:
                    await connection.send_text(message)
                except Exception:
                    disconnected.append(connection)
            # Clean up disconnected
            for conn in disconnected:
                self.disconnect(conn, job_id)


manager = ConnectionManager()


async def run_subprocess(cmd: List[str], cwd: Path, env: dict) -> tuple[int, str, str]:
    """Run a subprocess asynchronously"""
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
    await manager.send_job_update(job_id, job)
    
    try:
        if job.type == JobType.EVALUATE:
            returncode, stdout, stderr = await run_evaluate_job(job.params)
        elif job.type == JobType.GENERATE_VECTOR:
            returncode, stdout, stderr = await run_generate_vector_job(job.params)
        elif job.type == JobType.PROJECTION:
            returncode, stdout, stderr = await run_projection_job(job.params)
        else:
            raise ValueError(f"Unknown job type: {job.type}")
        
        job.stdout = stdout
        job.stderr = stderr
        
        if returncode != 0:
            job.status = JobStatus.FAILED
            job.error = f"Process exited with code {returncode}: {stderr}"
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
    await manager.send_job_update(job_id, job)


def get_job_result(job: Job) -> Dict[str, Any]:
    """Get the result data based on job type"""
    if job.type == JobType.EVALUATE:
        return {
            "output_file": job.params.get("output_path"),
            "message": "Evaluation completed successfully"
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
    return {}


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

class SteeringParams(BaseModel):
    type: str = "response"
    coef: float = 2.0
    vector_path: str
    layer: int = 20


class EvaluateRequest(BaseModel):
    model: str = "Qwen/Qwen2.5-7B-Instruct"
    trait: str
    version: str = "eval"
    judge_model: str = "gpt-4.1-mini"
    gpu: int = 0
    persona_instruction_type: Optional[str] = None
    assistant_name: Optional[str] = None
    steering: Optional[SteeringParams] = None


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


@app.post("/api/evaluate", response_model=JobResponse)
async def evaluate_persona(request: EvaluateRequest):
    """
    Start a persona evaluation job
    
    Returns a job_id that can be used to track progress via WebSocket at /ws/jobs/{job_id}
    """
    logger.info("Evaluation requested")
    
    if not request.trait:
        raise HTTPException(status_code=400, detail="trait is required")
    
    # Generate output filename
    output_filename = f"{request.model.replace('/', '_')}_{request.trait}_{request.version}_{request.persona_instruction_type}.csv"
    output_path = str(STORAGE_DIR / "results" / output_filename)
    
    # Create job
    job_id = str(uuid.uuid4())
    params = request.model_dump()
    params['output_path'] = output_path
    if request.steering:
        params['steering'] = request.steering.model_dump()
    
    job = Job(
        id=job_id,
        type=JobType.EVALUATE,
        status=JobStatus.PENDING,
        created_at=datetime.now(),
        params=params
    )
    jobs[job_id] = job
    
    # Start job execution in background
    asyncio.create_task(execute_job(job_id))
    
    logger.info(f"Created evaluation job {job_id}")
    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Evaluation job created. Connect to WebSocket /ws/jobs/{job_id} to track progress."
    )


@app.post("/api/generate-vector", response_model=JobResponse)
async def generate_vector(request: GenerateVectorRequest):
    """
    Start a vector generation job
    
    Returns a job_id that can be used to track progress via WebSocket at /ws/jobs/{job_id}
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
        message="Vector generation job created. Connect to WebSocket /ws/jobs/{job_id} to track progress."
    )


@app.post("/api/projection", response_model=JobResponse)
async def calculate_projection(request: ProjectionRequest):
    """
    Start a projection calculation job
    
    Returns a job_id that can be used to track progress via WebSocket at /ws/jobs/{job_id}
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
        message="Projection calculation job created. Connect to WebSocket /ws/jobs/{job_id} to track progress."
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


@app.websocket("/ws/jobs/{job_id}")
async def websocket_job_status(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for real-time job status updates
    
    Connect to this endpoint with a job_id to receive updates when the job status changes.
    The server will send the full job object as JSON whenever the status updates.
    
    Client can send:
    - "status" to request current job status
    - "ping" to receive "pong" response (keep-alive)
    """
    await websocket.accept()

    if job_id not in jobs:
        await websocket.close(code=4004, reason="Job not found")
        return
    
    await manager.connect(websocket, job_id)
    
    try:
        # Send current job status immediately
        await websocket.send_text(jobs[job_id].model_dump_json())
        
        # Keep connection alive and handle any client messages
        while True:
            try:
                # Wait for any message from client (ping/pong or status request)
                data = await websocket.receive_text()
                
                if data == "status":
                    # Client requested current status
                    await websocket.send_text(jobs[job_id].model_dump_json())
                elif data == "ping":
                    await websocket.send_text("pong")
                    
            except WebSocketDisconnect:
                break
                
    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {e}")
    finally:
        manager.disconnect(websocket, job_id)


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
