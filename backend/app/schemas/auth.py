from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class RegisterIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        s = v.strip().lower()
        if "@" not in s or s.startswith("@") or s.endswith("@"):
            raise ValueError("invalid email format")
        local, domain = s.split("@", 1)
        if not local or "." not in domain:
            raise ValueError("invalid email format")
        return s


class LoginIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        s = v.strip().lower()
        if "@" not in s or s.startswith("@") or s.endswith("@"):
            raise ValueError("invalid email format")
        local, domain = s.split("@", 1)
        if not local or "." not in domain:
            raise ValueError("invalid email format")
        return s


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
