from pydantic import BaseModel


class DashboardStatsOut(BaseModel):
    devices_total: int
    devices_online: int
    active_alerts: int
    home_status: str  # safe | warning | critical
