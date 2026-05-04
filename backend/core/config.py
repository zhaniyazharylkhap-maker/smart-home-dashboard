from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://smarthome:smarthome@localhost:5432/smarthome"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_telemetry_topic: str = "smarthome/telemetry"
    redis_url: str = "redis://localhost:6379/0"
    suspicious_motion_light_max: float = 250.0
    humidity_high_duration_minutes: float = 5.0
    anomaly_score_threshold: float = 0.75
    ml_model_path: str = "ml/model.pkl"
    cors_origins: str = "http://localhost:3000"
    jwt_secret: str = Field(
        default="change-me-in-production-use-long-random-string",
        validation_alias="JWT_SECRET",
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7


@lru_cache
def get_settings() -> Settings:
    return Settings()


def cors_origin_list() -> list[str]:
    return [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
