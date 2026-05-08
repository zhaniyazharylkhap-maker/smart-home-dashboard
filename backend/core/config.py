from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://smarthome:smarthome@localhost:5432/smarthome"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_telemetry_topic: str = "smarthome/telemetry"
    redis_url: str = "redis://localhost:6379/0"
    suspicious_motion_light_max: float = 250.0
    humidity_high_duration_minutes: float = 5.0
    anomaly_score_threshold: float = 0.75
    ml_model_path: str = "ml/model.pkl"
    # Owner assigned to rooms/devices/alerts created from MQTT ingestion.
    # MQTT publishers carry no user identity; in production this would be
    # replaced by per-device certificates or a registry lookup. Defaults to
    # the seeded demo user (id=1 from migration 002).
    mqtt_default_owner_user_id: int = 1
    cors_origins: str = "http://localhost:3000"
    jwt_secret: str = Field(..., validation_alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30


# Known placeholder strings shipped in env templates. Boot must fail-fast on any
# of these, otherwise a deployment runs with a publicly-known signing key. The
# explicit set is the source of truth: if a new placeholder is added to any
# env template, it must be added here too.
PLACEHOLDER_SECRETS: frozenset[str] = frozenset(
    {
        "change-me",
        "default-secret",
        "change-me-in-production-use-long-random-string",
        "replace-with-long-random-secret",
        "__REPLACE_ME__",
    }
)
MIN_JWT_SECRET_LEN = 32


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if (
        settings.jwt_secret in PLACEHOLDER_SECRETS
        or len(settings.jwt_secret) < MIN_JWT_SECRET_LEN
    ):
        raise RuntimeError(
            "JWT_SECRET must be explicitly set to a secure value "
            f"(>= {MIN_JWT_SECRET_LEN} chars, not a placeholder)."
        )
    return settings


def cors_origin_list() -> list[str]:
    return [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
