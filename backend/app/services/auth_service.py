from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import User
from app.schemas.auth import RegisterIn


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except ValueError:
        return False


def create_access_token(user_id: int, email: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def get_user_from_token(db: Session, token: str) -> User | None:
    try:
        data = decode_token(token)
        uid = int(data.get("sub", "0"))
    except (JWTError, ValueError, TypeError):
        return None
    return db.get(User, uid)


def register_user(db: Session, body: RegisterIn) -> User:
    existing = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if existing is not None:
        raise ValueError("email already registered")
    user = User(
        name=body.name.strip(),
        email=str(body.email).lower().strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
