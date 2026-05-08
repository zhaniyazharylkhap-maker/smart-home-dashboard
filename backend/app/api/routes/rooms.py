from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Room, User
from app.schemas.room import RoomOut

router = APIRouter()


# Multi-tenancy: rooms are user-scoped. NULL user_id = legacy/pre-007 row,
# treated as visible only to the demo user via migration-time backfill.


@router.get("", response_model=list[RoomOut])
def list_rooms(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[RoomOut]:
    rooms = (
        db.execute(
            select(Room)
            .where(Room.user_id == _user.id)
            .order_by(Room.name)
        )
        .scalars()
        .all()
    )
    out: list[RoomOut] = []
    for r in rooms:
        # Device count is also user-scoped so a tenant cannot infer
        # cross-tenant device counts via room metadata.
        cnt = db.execute(
            select(func.count())
            .select_from(Device)
            .where(Device.room_id == r.id, Device.user_id == _user.id)
        ).scalar_one()
        out.append(
            RoomOut(
                id=r.id,
                name=r.name,
                type=r.type,
                created_at=r.created_at,
                device_count=int(cnt),
            )
        )
    return out


@router.get("/{room_id}", response_model=RoomOut)
def get_room(
    room_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> RoomOut:
    r = db.get(Room, room_id)
    if r is None or (r.user_id is not None and r.user_id != _user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    cnt = db.execute(
        select(func.count())
        .select_from(Device)
        .where(Device.room_id == r.id, Device.user_id == _user.id)
    ).scalar_one()
    return RoomOut(
        id=r.id,
        name=r.name,
        type=r.type,
        created_at=r.created_at,
        device_count=int(cnt),
    )
