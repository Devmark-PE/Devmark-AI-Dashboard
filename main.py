from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx
import time
import os

load_dotenv()

app = FastAPI(
    title="Devmark AI API",
    version="1.0.0",
    description="API propia de IA basada en Ollama"
)

OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "llama3.2:1b"

API_KEY = os.getenv("DEVmark_API_KEY")

if not API_KEY:
    raise RuntimeError("DEVmark_API_KEY no está configurada en .env")


# =========================
# Modelos de datos
# =========================

class ChatRequest(BaseModel):
    message: str
    model: str = DEFAULT_MODEL


class Message(BaseModel):
    role: str
    content: str


class OpenAIChatRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: list[Message]
    stream: bool = False


# =========================
# Verificación API Key
# =========================

def verify_api_key(authorization: str | None):

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="API key requerida"
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Formato de autorización inválido"
        )

    token = authorization.replace("Bearer ", "", 1).strip()

    if token != API_KEY:
        raise HTTPException(
            status_code=401,
            detail="API key inválida"
        )


# =========================
# Endpoints públicos
# =========================

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Devmark AI API",
        "model": DEFAULT_MODEL
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "ollama": OLLAMA_URL
    }


# =========================
# Endpoint original
# =========================

@app.post("/chat")
async def chat(request: ChatRequest):

    payload = {
        "model": request.model,
        "messages": [
            {
                "role": "user",
                "content": request.message
            }
        ],
        "stream": False
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload
        )

    response.raise_for_status()

    data = response.json()

    return {
        "model": data["model"],
        "response": data["message"]["content"]
    }


# =========================
# API compatible con OpenAI
# =========================

@app.post("/v1/chat/completions")
async def openai_chat(
    request: OpenAIChatRequest,
    authorization: str | None = Header(default=None)
):

    verify_api_key(authorization)

    start_time = time.time()

    payload = {
        "model": request.model,
        "messages": [
            {
                "role": message.role,
                "content": message.content
            }
            for message in request.messages
        ],
        "stream": False
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload
        )

    response.raise_for_status()

    data = response.json()

    content = data["message"]["content"]

    prompt_tokens = data.get("prompt_eval_count", 0)
    completion_tokens = data.get("eval_count", 0)

    return {
        "id": f"devmark-{int(time.time())}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": data["model"],
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens
        },
        "processing_time": round(
            time.time() - start_time,
            2
        )
    }


# =========================
# Lista de modelos
# =========================

@app.get("/v1/models")
async def models(
    authorization: str | None = Header(default=None)
):

    verify_api_key(authorization)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{OLLAMA_URL}/api/tags"
        )

    response.raise_for_status()

    data = response.json()

    return {
        "object": "list",
        "data": [
            {
                "id": model["name"],
                "object": "model",
                "owned_by": "devmark"
            }
            for model in data.get("models", [])
        ]
    }
