from contextlib import asynccontextmanager
from datetime import datetime , timedelta, timezone

import os 
import random 
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from fastapi import WebSocket, WebSocketDisconnect
from pathlib import Path
import json
from dotenv import load_dotenv
from src.schemas.telemetry import TelemetryPoint, Meta, Radio, Gps, Env, Ingest

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):

    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise ValueError("ekko MONGODB_URI connection string eka natho, nattn connection string eka kadila")  

    app.state.mongodb_client = AsyncIOMotorClient(mongodb_uri)
    app.state.db = app.state.mongodb_client["cellular_signal_db"] # cluster name , switch if cluster name is different
    app.state.collection = app.state.db["telemetry_points"]

    await app.state.collection.create_index("meta.run_id") # 2dsphere index for GPS + run_id index 
    await app.state.collection.create_index([("location", "2dsphere")])
    print(" Connected to MongoDB + indexes created (2dsphere ready)")


    yield

    app.state.mongodb_client.close()

app = FastAPI(title = "Cellular Signal Dashboad API", lifespan = lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["*"],
    allow_credentials = True,
    allow_methods = ["*"],
    allow_headers = ["*"],
)

# DB ping - health check endpoint
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

PHONE_DATA_FILE = DATA_DIR / "phone_radio_data.jsonl"

@app.get("/")
async def root():
    return {"message": "API is running"}

@app.get("/health")
async def health():
    try:
        await app.state.db.command("ping")
        return {"status": "ok", "mongo": "connected", "message": "Backend is running - DB running - all good machn 👌🏽"}
    except Exception as e:
        return {"status": "error", "mongo": str(e)}
    

# Data ingestion point 
@app.post("/api/telemetry")
async def ingest_telemetry(point: TelemetryPoint):
    doc = point.model_dump()
    doc["location"] = {"type":"Point", "coordinates":[point.gps.lon,point.gps.lat]}
    result = await app.state.collection.insert_one(doc)
    return {"status":"ingested", "id": str(result.inserted_id)}


@app.get("/api/telemetry")
async def get_telemetry(
    run_id: str = Query(None, description="Filter by ride/run_id"),
    limit: int = Query(500, le=1000),
    skip: int = 0
):
    
    query = {"meta.run_id": run_id} if run_id else {}
    cursor = app.state.collection.find(query).sort("ts_utc", 1).skip(skip).limit(limit)
    points = await cursor.to_list(length =limit)
    for p in points:
        p["_id"] = str(p["_id"])
        p.pop("location", None) # clean the data for the front end
    return points

# === LIST ALL RIDES/RUNS ===
@app.get("/api/runs")
async def get_runs():
    pipeline = [
        {"$group": {
            "_id": "$meta.run_id",
            "vehicle_id": {"$first": "$meta.vehicle_id"},
            "start_time": {"$min": "$ts_utc"},
            "end_time": {"$max": "$ts_utc"},
            "point_count": {"$sum": 1}
        }},
        {"$sort": {"start_time": -1}}
    ]
    cursor = app.state.collection.aggregate(pipeline)
    return await cursor.to_list(None)


# === DUMMY DATA GENERATOR (for frontend testing - remove from prod) ===
@app.post("/api/seed")
async def seed_dummy_data(
    num_points: int = Query(1000, description="Number of 1Hz points to generate"),
    run_id: str = Query("run_test_001")
):
    base_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    points = []
    lat, lon = 6.9154633, 79.9729362   # SLIIT area
    
    for i in range(num_points):
        ts = base_time + timedelta(seconds=i)
        point = TelemetryPoint(
            ts_utc= ts,
            meta=Meta(run_id=run_id, vehicle_id="veh_01", phone_id="a53_01", operator="Dialog", rat="LTE"),
            radio=Radio(
                rsrp_dbm=random.randint(-115, -85),
                rsrq_db=random.randint(-18, -8),
                sinr_db=random.randint(0, 18),
                cell_id="41322109",
                pci=112,
                earfcn=1650,
                band="B3"
            ),
            gps=Gps(
                lat=round(lat + random.uniform(-0.005, 0.005), 6),
                lon=round(lon + random.uniform(-0.005, 0.005), 6),
                alt_m=round(17.4 + random.uniform(-10, 10), 1),
                speed_mps=round(11.2 + random.uniform(-5, 5), 1),
                heading_deg=182.5,
                fix_quality=1,
                satellites=14,
                gps_ts=ts
            ),
            env=Env(
                light_lux=round(random.uniform(5, 80), 1),
                temp_c=round(random.uniform(35, 45), 1),
                shade_flag=random.choice([True, False]),
                humidity=round(random.uniform(78, 90), 1)
            ),
            ingest=Ingest(pi_id="pi_gateway_01", phone_seq=10000 + i, received_at=ts + timedelta(milliseconds=300))
        )
        doc = point.model_dump()
        doc["location"] = {"type": "Point", "coordinates": [point.gps.lon, point.gps.lat]}
        points.append(doc)

    await app.state.collection.insert_many(points)
    return {"status": "seeded", "run_id": run_id, "points": num_points, "message": "Ready for frontend charts!"}

@app.get("/data")
async def get_recent_data(limit: int = 50):
    if not PHONE_DATA_FILE.exists():
        return []

    lines = PHONE_DATA_FILE.read_text(encoding="utf-8").splitlines()
    recent = lines[-limit:]

    records = []
    for line in recent:
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    return records

@app.websocket("/ws/phone-radio")
async def websocket_phone_radio(websocket: WebSocket):
    await websocket.accept()
    print("Phone connected via WebSocket")
    print("Saving data to:", PHONE_DATA_FILE.resolve())

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            with PHONE_DATA_FILE.open("a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")

            print("Received from phone:")
            print(json.dumps(payload, indent=2, ensure_ascii=False))
            print("Saved to file")

            await websocket.send_text(json.dumps({
                "status": "received",
                "seq": payload.get("seq"),
                "message": "Data received successfully"
            }))

    except WebSocketDisconnect:
        print("Phone disconnected")

    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host = "0.0.0.0", port=8000, reload = True)