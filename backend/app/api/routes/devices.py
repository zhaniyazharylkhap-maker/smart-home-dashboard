from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Room, User
from app.schemas.device import DeviceCreateIn, DeviceOut, DeviceUpdateIn

router = APIRouter()


def _to_out(device: Device, room: Room) -> DeviceOut:
    return DeviceOut(
        id=device.id,
        device_id=device.device_id,
        name=device.name,
        room_id=device.room_id,
        room_name=room.name,
        device_type=device.device_type,
        status=device.status,
        last_seen=device.last_seen,
        created_at=device.created_at,
    )


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[DeviceOut]:
    rows = db.execute(
        select(Device, Room)
        .join(Room, Device.room_id == Room.id)
        .order_by(Device.device_id)
    ).all()
    return [_to_out(d, r) for d, r in rows]


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    body: DeviceCreateIn,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> DeviceOut:
    room = db.get(Room, body.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid room_id")
    existing = db.execute(
        select(Device).where(Device.device_id == body.device_id.strip())
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_id already exists")
    dev = Device(
        device_id=body.device_id.strip(),
        name=body.name.strip(),
        room_id=body.room_id,
        device_type=body.device_type,
        status="offline",
    )
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return _to_out(dev, room)


@router.get("/{device_pk}", response_model=DeviceOut)
def get_device(
    device_pk: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> DeviceOut:
    dev = db.get(Device, device_pk)
    if dev is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    room = db.get(Room, dev.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Room missing")
    return _to_out(dev, room)


@router.patch("/{device_pk}", response_model=DeviceOut)
def update_device(
    device_pk: int,
    body: DeviceUpdateIn,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> DeviceOut:
    dev = db.get(Device, device_pk)
    if dev is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if body.name is not None:
        dev.name = body.name.strip()
    if body.room_id is not None:
        room = db.get(Room, body.room_id)
        if room is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid room_id")
        dev.room_id = body.room_id
    if body.device_type is not None:
        dev.device_type = body.device_type
    if body.status is not None:
        dev.status = body.status
    db.commit()
    db.refresh(dev)
    room = db.get(Room, dev.room_id)
    assert room is not None
    return _to_out(dev, room)
