from fastapi import APIRouter

from app.api.routes import auth, folders, library, media, profiles, watch_history

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(folders.router, prefix="/folders", tags=["folders"])
api_router.include_router(media.router, prefix="/media", tags=["media"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(watch_history.router, prefix="/watch-history", tags=["watch-history"])
