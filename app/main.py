
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.budget import try_consume
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.schemas.oracle import OracleRequest, OracleResponse
from app.schemas.tts import SpeakRequest
from app.services import football_service, movies_service
from app.agent.asher import consult_oracle
import app.services.places_service as places_service
from app.services.tts_service import synthesize_speech, warm_up_background

configure_logging()
logger = logging.getLogger("main")

settings = get_settings()

limiter = Limiter(key_func=get_remote_address)


def _limits(per_minute: str, per_day: str) -> str:
    """
    Combine limits for slowapi ("10/minute;200/day"); 
    empty parts are skipped.
    """
    return ";".join(x.strip() for x in (per_minute, per_day) if x and x.strip())


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
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
) # Already Fixed at the VPS level


@app.get("/health")
async def health() -> dict:
    return {"status": "Asher is open" if places_service.is_configured() else "Asher is closed"}


@app.post("/api/v1/oracle", response_model=OracleResponse)
@limiter.limit(_limits(settings.rate_limit, 
                       settings.rate_limit_daily)
               ) # sentence-level calls need more headroom
async def oracle(request: Request, 
                 body: OracleRequest
                 ) -> OracleResponse:
    if not try_consume(settings.daily_oracle_budget):
        logger.warning("daily oracle budget spent (%d)", 
                       settings.daily_oracle_budget
                       )
        raise HTTPException(
            status_code=503,
            detail="The mirror rests until tomorrow.",
        )
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
@limiter.limit(_limits(settings.tts_rate_limit, 
                       settings.tts_rate_limit_daily)
               ) # sentence-level calls need more headroom
async def speak(request: Request, 
                body: SpeakRequest
                ) -> Response:
    
    try:
        audio = await synthesize_speech(body.text, body.lang)
        
    except Exception:
        logger.exception("tts synthesis failed")
        raise HTTPException(status_code=502, 
                            detail="The mirror's voice fails.")

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )

@app.get("/api/v1/movies/{movie_id}")
@limiter.limit(_limits(settings.tts_rate_limit,
                       settings.tts_rate_limit_daily)
 ) # sentence-level calls need more headroom
async def movie_detail(request: Request, movie_id: int) -> dict:
    """Detail panel for a movie card the user clicked (cast, trailer, recommendations)."""
    if not movies_service.is_configured():
        raise HTTPException(status_code=503, 
                            detail="The archive of films is closed.")
    
    try:
        return await movies_service.get_movie_full(movie_id)
    
    except Exception:
        logger.exception("movie detail failed (id=%s)", movie_id)
        raise HTTPException(status_code=502, 
                            detail="The vision fades.")


@app.get("/api/v1/football/team/{team_id}")
@limiter.limit(_limits(settings.tts_rate_limit,
                       settings.tts_rate_limit_daily)
                )  # sentence-level calls need more headroom
async def football_team(request: Request, 
                        team_id: int,
                        league: int | None = None, 
                        season: int | None = None
                        ) -> dict:
    """Team panel for a card the user clicked (info, table, recent/upcoming fixtures). Cached."""
    if not football_service.is_configured():
        raise HTTPException(status_code=503, 
                            detail="The archive of matches is closed.")
        
    try:
        return await football_service.get_team_panel(team_id, league, season)
    
    except LookupError:
        raise HTTPException(status_code=404, 
                            detail="The mirror knows no such team.")
    
    except Exception:
        logger.exception("football team panel failed (id=%s)", team_id)
        raise HTTPException(status_code=502, 
                            detail="The vision fades.")


@app.get("/api/v1/football/fixture/{fixture_id}")
@limiter.limit(_limits(settings.tts_rate_limit,
                       settings.tts_rate_limit_daily)
               ) # sentence-level calls need more headroom
async def football_fixture(request: Request, 
                           fixture_id: int
                           ) -> dict:
    """Match panel for a fixture card the user clicked (events, lineups, stats). Cached."""
    if not football_service.is_configured():
        raise HTTPException(status_code=503, 
                            detail="The archive of matches is closed.")
    
    try:
        return await football_service.get_fixture_detail(fixture_id)
    
    except LookupError:
        raise HTTPException(status_code=404, 
                            detail="The mirror knows no such match.")
    
    except Exception:
        logger.exception("football fixture panel failed (id=%s)", fixture_id)
        raise HTTPException(status_code=502, 
                            detail="The vision fades.")
