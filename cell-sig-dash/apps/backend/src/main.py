from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import os
import random
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from src.schemas.telemetry import (
    TelemetryPoint,
    Meta,
    Radio,
    Gps,
    Env,
    Ingest,
)

load_dotenv()

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

PHONE_DATA_FILE = DATA_DIR / "phone_radio_data.jsonl"


@asynccontextmanager
async def lifespan(app: FastAPI):
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise ValueError(
            "Missing MONGODB_URI. Create a .env in apps/backend with MONGODB_URI=<your connection string>."
        )

    app.state.client = AsyncIOMotorClient(uri)
    app.state.db = app.state.client["cellular_signal_db"]
    app.state.collection = app.state.db["telemetry_points"]

    await app.state.collection.create_index("meta.run_id")
    await app.state.collection.create_index("meta.operator")
    await app.state.collection.create_index("ts_utc")
    await app.state.collection.create_index([("meta.run_id", 1), ("ts_utc", 1)])
    await app.state.collection.create_index([("location", "2dsphere")])

    parsed = urlparse(uri)
    host = parsed.hostname or "unknown-host"
    print(f"Connected to MongoDB ({parsed.scheme}://{host}) + indexes created")

    yield

    app.state.client.close()
    print("MongoDB connection closed")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "API is running"}


@app.get("/health")
async def health():
    try:
        await app.state.db.command("ping")
        uri = os.getenv("MONGODB_URI", "")
        parsed = urlparse(uri) if uri else None
        return {
            "status": "ok",
            "mongo": "connected",
            "message": "Backend is running - DB running - all good",
            "mongo_host": (parsed.hostname if parsed else None),
            "mongo_db": "cellular_signal_db",
        }
    except Exception as e:
        return {"status": "error", "mongo": str(e)}


@app.post("/api/telemetry")
async def ingest_telemetry(point: TelemetryPoint):
    doc = point.model_dump()

    doc["location"] = {
        "type": "Point",
        "coordinates": [point.gps.lon, point.gps.lat],
    }

    result = await app.state.collection.insert_one(doc)

    return {
        "status": "ingested",
        "id": str(result.inserted_id),
    }


@app.get("/api/telemetry")
async def get_telemetry(
    run_id: str | None = Query(None, description="Filter by ride/run_id"),
    operator: str | None = Query(None, description="Filter by operator/MNO"),
    start_ts: datetime | None = Query(None, description="Start timestamp (ISO8601)"),
    end_ts: datetime | None = Query(None, description="End timestamp (ISO8601)"),
    limit: int = Query(500, le=1000),
    skip: int = 0,
):
    query: dict = {}
    if run_id:
        query["meta.run_id"] = run_id
    if operator:
        query["meta.operator"] = operator
    if start_ts or end_ts:
        time_q: dict = {}
        if start_ts:
            time_q["$gte"] = start_ts
        if end_ts:
            time_q["$lte"] = end_ts
        query["ts_utc"] = time_q

    cursor = (
        app.state.collection
        .find(query)
        .sort("ts_utc", 1)
        .skip(skip)
        .limit(limit)
    )

    points = await cursor.to_list(length=limit)

    for p in points:
        p["_id"] = str(p["_id"])
        p.pop("location", None)

    return points


@app.get("/api/dashboard/summary")
async def get_summary(
    run_id: str | None = Query(None, description="Filter by ride/run_id"),
    operator: str | None = Query(None, description="Filter by operator/MNO"),
    district: str | None = Query(None, description="Filter by district name"),
    start_ts: datetime | None = Query(None, description="Start timestamp (ISO8601)"),
    end_ts: datetime | None = Query(None, description="End timestamp (ISO8601)"),
    threshold: int = Query(-110, description="Weak RSRP threshold (dBm)"),
    limit: int = Query(5000, le=20000),
):
    query: dict = {}
    if run_id:
        query["meta.run_id"] = run_id
    if operator:
        # Schema stores measurements under operators.<OperatorName>.*
        query[f"operators.{operator}.rsrp_dbm"] = {"$exists": True}
    if district:
        query["district"] = district
    if start_ts or end_ts:
        time_q: dict = {}
        if start_ts:
            time_q["$gte"] = start_ts
        if end_ts:
            time_q["$lte"] = end_ts
        query["ts_utc"] = time_q

    projection = {
        "ts_utc": 1,
        "meta.operator": 1,
        "operators": 1,
        "district": 1,
        "province": 1,
        "gps.lat": 1,
        "gps.lon": 1,
    }

    cursor = (
        app.state.collection
        .find(query, projection)
        .sort("ts_utc", 1)
        .hint([("ts_utc", 1)])
    )
    docs = await cursor.to_list(length=limit)

    points = []
    rsrp_vals = []
    weak_count = 0
    critical_count = 0

    def pick_operator_radio(doc: dict, requested: str | None) -> tuple[str, dict]:
        ops = doc.get("operators") or {}
        if isinstance(ops, dict):
            if requested and requested in ops and isinstance(ops[requested], dict):
                return requested, ops[requested]
            # prefer Dialog if present, else first available operator
            if "Dialog" in ops and isinstance(ops["Dialog"], dict):
                return "Dialog", ops["Dialog"]
            for k, v in ops.items():
                if isinstance(v, dict):
                    return str(k), v
        return (requested or doc.get("meta", {}).get("operator") or "Unknown"), {}

    for d in docs:
        gps = d.get("gps", {})
        meta = d.get("meta", {})
        op_name, radio = pick_operator_radio(d, operator)

        rsrp = radio.get("rsrp_dbm")
        sinr = radio.get("sinr_db")
        lat = gps.get("lat")
        lon = gps.get("lon")

        if rsrp is not None:
            rsrp_vals.append(rsrp)

            if rsrp <= threshold:
                weak_count += 1

            if rsrp <= (threshold - 10):
                critical_count += 1

        points.append({
            "id": str(d.get("_id")),
            "ts_utc": d.get("ts_utc").isoformat() if d.get("ts_utc") else None,
            "operator": op_name or meta.get("operator", "Unknown"),
            "rsrp_dbm": rsrp,
            "sinr_db": sinr,
            "lat": lat,
            "lon": lon,
        })

    total = len(docs)

    return {
        "run_id": run_id,
        "operator": operator,
        "threshold": threshold,
        "total_samples": total,
        "avg_rsrp": round(sum(rsrp_vals) / len(rsrp_vals), 1) if rsrp_vals else None,
        "weak_coverage_percent": round((weak_count / total) * 100, 1) if total else 0,
        "critical_count": critical_count,
        "points": points,
    }


@app.get("/api/runs")
async def get_runs():
    pipeline = [
        {
            "$group": {
                "_id": "$meta.run_id",
                "vehicle_id": {"$first": "$meta.vehicle_id"},
                "operator": {"$first": "$meta.operator"},
                "start_time": {"$min": "$ts_utc"},
                "end_time": {"$max": "$ts_utc"},
                "point_count": {"$sum": 1},
            }
        },
        {"$sort": {"start_time": -1}},
    ]

    cursor = app.state.collection.aggregate(pipeline)
    runs = await cursor.to_list(length=None)

    for run in runs:
        run["run_id"] = run.pop("_id")

    return runs


@app.post("/api/seed")
async def seed_dummy_data(
    num_points: int = Query(1000, description="Number of points to generate"),
    run_id: str = Query("run_test_001"),
):
    operators = ["Dialog", "Mobitel", "Hutch"]
    base_time = datetime.now(timezone.utc) - timedelta(minutes=10)

    start_lat, start_lon = 6.9271, 79.8612
    points = []

    for i in range(num_points):
        ts = base_time + timedelta(seconds=i)
        lat = start_lat + random.uniform(-0.15, 0.15)
        lon = start_lon + random.uniform(-0.10, 0.10)

        operator = random.choice(operators)

        point = TelemetryPoint(
            ts_utc=ts,
            meta=Meta(
                run_id=run_id,
                vehicle_id="veh_01",
                phone_id="a53_01",
                operator=operator,
                rat="LTE",
            ),
            radio=Radio(
                rsrp_dbm=random.randint(-120, -70),
                rsrq_db=random.randint(-18, -8),
                sinr_db=random.randint(-5, 20),
                cell_id="41322109",
                pci=112,
                earfcn=1650,
                band="B3",
            ),
            gps=Gps(
                lat=round(lat, 6),
                lon=round(lon, 6),
                alt_m=round(17.4 + random.uniform(-10, 10), 1),
                speed_mps=round(11.2 + random.uniform(-5, 5), 1),
                heading_deg=182.5,
                fix_quality=1,
                satellites=14,
                gps_ts=ts,
            ),
            env=Env(
                light_lux=round(random.uniform(5, 80), 1),
                temp_c=round(random.uniform(35, 45), 1),
                shade_flag=random.choice([True, False]),
                humidity=round(random.uniform(78, 90), 1),
            ),
            ingest=Ingest(
                pi_id="pi_gateway_01",
                phone_seq=10000 + i,
                received_at=ts + timedelta(milliseconds=300),
            ),
        )

        doc = point.model_dump()
        doc["location"] = {
            "type": "Point",
            "coordinates": [point.gps.lon, point.gps.lat],
        }

        points.append(doc)

    result = await app.state.collection.insert_many(points)

    return {
        "status": "seeded",
        "run_id": run_id,
        "inserted_count": len(result.inserted_ids),
    }


@app.delete("/api/seed")
async def clear_seed_data(run_id: str = Query("run_test_001")):
    result = await app.state.collection.delete_many({
        "meta.run_id": run_id,
    })

    return {
        "status": "cleared",
        "run_id": run_id,
        "deleted_count": result.deleted_count,
    }


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
                "message": "Data received successfully",
            }))

    except WebSocketDisconnect:
        print("Phone disconnected")

    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )