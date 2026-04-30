from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import os
import random
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from src.schemas.telemetry import (
    TelemetryPoint,
    Meta,
    Gps,
    Env,
    Ingest,
    OperatorSignal,
)

load_dotenv()

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

PHONE_DATA_FILE = DATA_DIR / "phone_radio_data.jsonl"


@asynccontextmanager
async def lifespan(app: FastAPI):
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

    app.state.client = AsyncIOMotorClient(uri)
    app.state.db = app.state.client["cellular_signal_db"]
    app.state.collection = app.state.db["telemetry_points"]

    await app.state.collection.create_index("meta.run_id")
    await app.state.collection.create_index("district")
    await app.state.collection.create_index("province")
    await app.state.collection.create_index("ts_utc")
    await app.state.collection.create_index([("location", "2dsphere")])

    print("Connected to MongoDB + indexes created")

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


def parse_iso_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def serialize_datetime(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def flatten_doc_to_points(doc: dict, selected_operator: str | None = None):
    points = []

    doc_id = str(doc.get("_id"))
    ts_utc = serialize_datetime(doc.get("ts_utc"))

    meta = doc.get("meta", {}) or {}
    gps = doc.get("gps", {}) or {}

    lat = gps.get("lat")
    lon = gps.get("lon")

    district = doc.get("district") or doc.get("ingest", {}).get("district")
    province = doc.get("province") or doc.get("ingest", {}).get("province")

    run_id = meta.get("run_id")
    vehicle_id = meta.get("vehicle_id")
    phone_id = meta.get("phone_id")
    rat = meta.get("rat")

    operators = doc.get("operators")

    if isinstance(operators, dict) and operators:
        for operator_name, signal in operators.items():
            if selected_operator and operator_name != selected_operator:
                continue

            signal = signal or {}

            points.append(
                {
                    "id": f"{doc_id}_{operator_name}",
                    "source_id": doc_id,
                    "ts_utc": ts_utc,
                    "run_id": run_id,
                    "vehicle_id": vehicle_id,
                    "phone_id": phone_id,
                    "operator": operator_name,
                    "rat": rat,
                    "rsrp_dbm": signal.get("rsrp_dbm"),
                    "rsrq_db": signal.get("rsrq_db"),
                    "sinr_db": signal.get("sinr_db"),
                    "cell_id": signal.get("cell_id"),
                    "pci": signal.get("pci"),
                    "earfcn": signal.get("earfcn"),
                    "band": signal.get("band"),
                    "lat": lat,
                    "lon": lon,
                    "district": district,
                    "province": province,
                }
            )

        return points

    radio = doc.get("radio", {}) or {}
    operator_name = meta.get("operator", "Unknown")

    if selected_operator and operator_name != selected_operator:
        return []

    points.append(
        {
            "id": doc_id,
            "source_id": doc_id,
            "ts_utc": ts_utc,
            "run_id": run_id,
            "vehicle_id": vehicle_id,
            "phone_id": phone_id,
            "operator": operator_name,
            "rat": rat,
            "rsrp_dbm": radio.get("rsrp_dbm"),
            "rsrq_db": radio.get("rsrq_db"),
            "sinr_db": radio.get("sinr_db"),
            "cell_id": radio.get("cell_id"),
            "pci": radio.get("pci"),
            "earfcn": radio.get("earfcn"),
            "band": radio.get("band"),
            "lat": lat,
            "lon": lon,
            "district": district,
            "province": province,
        }
    )

    return points


@app.get("/")
async def root():
    return {"message": "API is running"}


@app.get("/health")
async def health():
    try:
        await app.state.db.command("ping")
        return {
            "status": "ok",
            "mongo": "connected",
            "message": "Backend is running - DB running - all good",
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
    run_id: str | None = Query(None),
    limit: int = Query(500, le=5000),
    skip: int = 0,
):
    query = {}

    if run_id:
        query["meta.run_id"] = run_id

    cursor = (
        app.state.collection.find(query)
        .sort("ts_utc", 1)
        .skip(skip)
        .limit(limit)
    )

    docs = await cursor.to_list(length=limit)

    for doc in docs:
        doc["_id"] = str(doc["_id"])
        doc.pop("location", None)

    return docs


@app.get("/api/dashboard/summary")
async def get_summary(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    district: str | None = Query(None),
    threshold: int = Query(-110),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
    limit: int = Query(20000, le=50000),
):
    query: dict[str, Any] = {}

    if run_id:
        query["meta.run_id"] = run_id

    if district and district != "All Districts":
        query["district"] = district

    if start_ts or end_ts:
        query["ts_utc"] = {}

        if start_ts:
            query["ts_utc"]["$gte"] = parse_iso_datetime(start_ts)

        if end_ts:
            query["ts_utc"]["$lte"] = parse_iso_datetime(end_ts)

    cursor = app.state.collection.find(query).sort("ts_utc", 1).limit(limit)
    docs = await cursor.to_list(length=limit)

    points = []

    for doc in docs:
        points.extend(flatten_doc_to_points(doc, selected_operator=operator))

    valid_rsrp_points = [
        p for p in points if isinstance(p.get("rsrp_dbm"), (int, float))
    ]

    rsrp_vals = [p["rsrp_dbm"] for p in valid_rsrp_points]
    weak_count = sum(1 for p in valid_rsrp_points if p["rsrp_dbm"] <= threshold)
    critical_count = sum(1 for p in valid_rsrp_points if p["rsrp_dbm"] <= -120)

    total = len(valid_rsrp_points)

    return {
        "run_id": run_id,
        "operator": operator,
        "district": district,
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
                "start_time": {"$min": "$ts_utc"},
                "end_time": {"$max": "$ts_utc"},
                "point_count": {"$sum": 1},
                "district": {"$first": "$district"},
                "province": {"$first": "$province"},
            }
        },
        {"$sort": {"start_time": -1}},
    ]

    cursor = app.state.collection.aggregate(pipeline)
    runs = await cursor.to_list(length=None)

    for run in runs:
        run["run_id"] = run.pop("_id")
        run["start_time"] = serialize_datetime(run.get("start_time"))
        run["end_time"] = serialize_datetime(run.get("end_time"))

    return runs


@app.get("/api/operators")
async def get_operators():
    pipeline = [
        {"$project": {"operator_names": {"$objectToArray": "$operators"}}},
        {"$unwind": "$operator_names"},
        {"$group": {"_id": "$operator_names.k"}},
        {"$sort": {"_id": 1}},
    ]

    cursor = app.state.collection.aggregate(pipeline)
    rows = await cursor.to_list(length=None)

    return [row["_id"] for row in rows]


@app.post("/api/seed")
async def seed_dummy_data(
    num_points: int = Query(1000),
    run_id: str = Query("run_test_001"),
):
    operators = ["Dialog", "Mobitel", "Hutch"]
    base_time = datetime.now(timezone.utc) - timedelta(minutes=10)

    start_lat, start_lon = 6.9271, 79.8612
    docs = []

    for i in range(num_points):
        ts = base_time + timedelta(seconds=i)
        lat = round(start_lat + random.uniform(-0.15, 0.15), 6)
        lon = round(start_lon + random.uniform(-0.10, 0.10), 6)

        operators_payload = {}

        for operator_name in operators:
            operators_payload[operator_name] = {
                "rsrp_dbm": random.randint(-120, -65),
                "rsrq_db": random.randint(-18, -6),
                "sinr_db": random.randint(-5, 25),
                "cell_id": str(random.randint(41000000, 41999999)),
                "pci": random.randint(1, 500),
                "earfcn": random.choice([1650, 2300, 6200]),
                "band": random.choice(["B1", "B3", "B8"]),
            }

        doc = {
            "ts_utc": ts,
            "meta": {
                "run_id": run_id,
                "vehicle_id": "veh_01",
                "phone_id": "multi_operator_a53_01",
                "rat": "LTE",
            },
            "gps": {
                "lat": lat,
                "lon": lon,
                "alt_m": round(17.4 + random.uniform(-10, 10), 1),
                "speed_mps": round(11.2 + random.uniform(-5, 5), 1),
                "heading_deg": round(random.uniform(0, 360), 1),
                "fix_quality": 1,
                "satellites": random.randint(8, 16),
                "gps_ts": ts,
            },
            "env": {
                "light_lux": round(random.uniform(5, 80), 1),
                "temp_c": round(random.uniform(28, 40), 1),
                "shade_flag": random.choice([True, False]),
                "humidity": round(random.uniform(65, 90), 1),
            },
            "ingest": {
                "pi_id": "pi_gateway_01",
                "phone_seq": 10000 + i,
                "received_at": ts + timedelta(milliseconds=300),
            },
            "district": "Colombo",
            "province": "Western",
            "route_name": run_id,
            "signal_quality_profile": "mixed",
            "operators": operators_payload,
            "location": {
                "type": "Point",
                "coordinates": [lon, lat],
            },
        }

        docs.append(doc)

    result = await app.state.collection.insert_many(docs)

    return {
        "status": "seeded",
        "run_id": run_id,
        "inserted_count": len(result.inserted_ids),
    }


@app.delete("/api/seed")
async def clear_seed_data(run_id: str = Query("run_test_001")):
    result = await app.state.collection.delete_many({"meta.run_id": run_id})

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

            await websocket.send_text(
                json.dumps(
                    {
                        "status": "received",
                        "seq": payload.get("seq"),
                        "message": "Data received successfully",
                    }
                )
            )

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