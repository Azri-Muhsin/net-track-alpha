from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional 

class Meta(BaseModel):
    run_id: str
    vehicle_id: str
    phone_id: str
    operator: str
    rat: str

class Radio(BaseModel):
    rsrp_dbm: int
    rsrq_db: int
    sinr_db: int 
    cell_id: str
    pci: int
    earfcn: int
    band: str

class Gps(BaseModel):
    lat: float
    lon: float
    alt_m: float 
    speed_mps: float
    heading_deg: float
    fix_quality: int 
    satellites: int 
    gps_ts: str 

class Env(BaseModel):
    light_lux: float
    temp_c: float
    shade_flag: bool
    humidity: float

class Ingest(BaseModel):
    pi_id: str
    phone_seq: int
    received_at: datetime

class TelemetryPoint(BaseModel):
    ts_utc: datetime
    meta: Meta
    radio: Radio 
    gps: Gps
    enc: Env
    ingest: Ingest

