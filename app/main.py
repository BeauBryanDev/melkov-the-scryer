import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.schemas.oracle import OracleRequest, OracleResponse
from app.schemas.tts import SpeakRequest
from app.services.oracle_service import consult_oracle
from app.services.tts_service import synthesize_speech, warm_up_background

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

settings = get_settings()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fire-and-forget: the server accepts requests immediately while the
    # TTS model loads and warms in the background.
    warmup_task = asyncio.create_task(warm_up_background())
    yield
    warmup_task.cancel()


app = FastAPI(
    title="Aegis-Scryer Oracle",
    version="4.1.0",
    docs_url=None,       # no public swagger on an art installation
    redoc_url=None,
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "the eye is open"}


@app.post("/api/v1/oracle", response_model=OracleResponse)
@limiter.limit(settings.rate_limit)
async def oracle(request: Request, body: OracleRequest) -> OracleResponse:
    try:
        return await consult_oracle(body)
    except Exception:
        logger.exception("oracle consultation failed")
        # In-fiction error message: the client speaks this aloud too
        raise HTTPException(
            status_code=502,
            detail="The mirror clouds over and says nothing.",
        )


@app.post("/api/v1/speak")
@limiter.limit(settings.tts_rate_limit)   # sentence-level calls need more headroom
async def speak(request: Request, body: SpeakRequest) -> Response:
    try:
        audio = await synthesize_speech(body.text, body.lang)
    except Exception:
        logger.exception("tts synthesis failed")
        raise HTTPException(status_code=502, detail="The mirror's voice fails.")

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )