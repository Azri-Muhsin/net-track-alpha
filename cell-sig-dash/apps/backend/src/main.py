from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import os
import random

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

    app.state.client = AsyncIOMotorClient(uri)
    app.state.db = app.state.client["cellular_signal_db"]
    app.state.collection = app.state.db["telemetry_points"]

    await app.state.collection.create_index([("location", "2dsphere")])

    yield

    app.state.client.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/dashboard/summary")
async def get_summary(run_id: str = "run_test_001"):
    query = {"meta.run_id": run_id}
    cursor = app.state.collection.find(query).sort("ts_utc", 1)
    docs = await cursor.to_list(length=5000)

    points = []
    rsrp_vals = []
    weak_count = 0
    critical_count = 0

    for d in docs:
        radio = d.get("radio", {})
        gps = d.get("gps", {})
        meta = d.get("meta", {})

        rsrp = radio.get("rsrp_dbm")
        sinr = radio.get("sinr_db")
        lat = gps.get("lat")
        lon = gps.get("lon")

        if rsrp is not None:
            rsrp_vals.append(rsrp)

            if rsrp <= -110:
                weak_count += 1

            if rsrp <= -120:
                critical_count += 1

        points.append({
            "id": str(d.get("_id")),
            "ts_utc": d.get("ts_utc").isoformat() if d.get("ts_utc") else None,
            "operator": meta.get("operator", "Unknown"),
            "rsrp_dbm": rsrp,
            "sinr_db": sinr,
            "lat": lat,
            "lon": lon,
        })

    total = len(docs)

    return {
        "total_samples": total,
        "avg_rsrp": round(sum(rsrp_vals) / len(rsrp_vals), 1) if rsrp_vals else None,
        "weak_coverage_percent": round((weak_count / total) * 100, 1) if total else 0,
        "critical_count": critical_count,
        "points": points,
    }


@app.post("/api/seed")
async def seed_data():
    operators = ["Dialog", "Mobitel", "Hutch"]
    points = []

    start_lat, start_lon = 6.9271, 79.8612

    for i in range(200):
        ts = datetime.now(timezone.utc) + timedelta(seconds=i)
        lat = start_lat + random.uniform(-0.15, 0.15)
        lon = start_lon + random.uniform(-0.10, 0.10)

        for op in operators:
            points.append({
                "ts_utc": ts,
                "meta": {
                    "run_id": "run_test_001",
                    "operator": op,
                },
                "radio": {
                    "rsrp_dbm": random.randint(-120, -70),
                    "sinr_db": random.randint(-5, 20),
                },
                "gps": {
                    "lat": lat,
                    "lon": lon,
                },
                "location": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
            })

    result = await app.state.collection.insert_many(points)

    return {
        "status": "seeded",
        "inserted_count": len(result.inserted_ids),
    }


@app.delete("/api/seed")
async def clear_seed_data():
    result = await app.state.collection.delete_many({
        "meta.run_id": "run_test_001"
    })

    return {
        "status": "cleared",
        "deleted_count": result.deleted_count,
    }