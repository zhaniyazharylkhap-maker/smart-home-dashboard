from fastapi import APIRouter

from app.api.routes import alerts, auth, devices, health, rooms, stats, telemetry

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(stats.router, prefix="/stats", tags=["stats"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(telemetry.router, prefix="/telemetry", tags=["telemetry"])
