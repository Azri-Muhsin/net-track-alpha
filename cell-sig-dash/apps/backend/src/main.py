from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import os
import json
import random
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis
from openai import AsyncOpenAI
from pydantic import BaseModel
from dotenv import load_dotenv
from src.schemas.telemetry import TelemetryPoint, Meta, Radio, Gps, Env, Ingest

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # MongoDB
    mongodb_uri = os.getenv("MONGODB_URI")
    app.state.mongodb_client = AsyncIOMotorClient(mongodb_uri)
    app.state.db = app.state.mongodb_client["cellular_signal_db"]
    app.state.collection = app.state.db["telemetry_points"]
    await app.state.collection.create_index("meta.run_id")
    await app.state.collection.create_index([("location", "2dsphere")])
    print("✅ MongoDB connected + indexes ready")

    # Redis (Upstash)
    redis_url = os.getenv("REDIS_URI")
    app.state.redis = Redis.from_url(redis_url, decode_responses=True)
    print("✅ Upstash Redis connected (Pub/Sub ready for live updates)")

    # from upstash_redis import Redis
 
    # redis = Redis.from_env()

    # LLM Client 
    llm_base = os.getenv("LLM_BASE_URL")
    app.state.llm_client = AsyncOpenAI(
        api_key=os.getenv("LLM_API_KEY"),
        base_url=llm_base if llm_base else None,
    )
    app.state.llm_model = os.getenv("LLM_MODEL", "gpt-5-nano")
    print(f"✅ LLM ready → {app.state.llm_model}")

    yield
    app.state.mongodb_client.close()
    await app.state.redis.aclose()

app = FastAPI(title="Cellular Signal Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    try:
        await app.state.db.command("ping")
        await app.state.redis.ping()
        return {"status": "ok", "mongo": "connected", "redis": "connected", "message": "🚀 Real-time + AI ready"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

# === INGEST + PUBLISH TO REDIS (real-time) ===
@app.post("/api/telemetry")
async def ingest_telemetry(point: TelemetryPoint):
    doc = point.model_dump()
    doc["location"] = {"type": "Point", "coordinates": [point.gps.lon, point.gps.lat]}
    
    await app.state.collection.insert_one(doc)
    
    # Publish to Redis Pub/Sub for live frontend
    publish_doc = point.model_dump(mode="json")
    publish_doc["location"] = doc["location"]
    await app.state.redis.publish(
        f"telemetry:{point.meta.run_id}",
        json.dumps(publish_doc)
    )
    
    return {"status": "ingested", "id": str(doc.get("_id"))}

# === GET HISTORICAL DATA ===
@app.get("/api/telemetry")
async def get_telemetry(
    run_id: str = Query(None),
    limit: int = Query(500, le=2000),
    skip: int = 0
):
    query = {"meta.run_id": run_id} if run_id else {}
    cursor = app.state.collection.find(query).sort("ts_utc", 1).skip(skip).limit(limit)
    points = await cursor.to_list(length=limit)
    for p in points:
        p["_id"] = str(p["_id"])
        p.pop("location", None)
    return points

# === LIVE STREAM (SSE + Redis Pub/Sub) ===
@app.get("/api/telemetry/live/{run_id}")
async def live_telemetry(run_id: str):
    async def event_generator():
        pubsub = app.state.redis.pubsub()
        await pubsub.subscribe(f"telemetry:{run_id}")
        try:
            async for message in pubsub.listen():
                if message.get("type") == "message":
                    yield f"data: {message['data']}\n\n"
        finally:
            await pubsub.unsubscribe(f"telemetry:{run_id}")
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# === LIST RUNS ===
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
    return await app.state.collection.aggregate(pipeline).to_list(None)

# === LLM ANALYTICS AGENT ===
@app.get("/api/analyze/{run_id}")
async def analyze_run(run_id: str):
    points = await app.state.collection.find({"meta.run_id": run_id}).sort("ts_utc", 1).limit(150).to_list(None)
    if not points:
        return {"insight": "No data found for this run."}
    
    rsrp_vals = [p["radio"]["rsrp_dbm"] for p in points]
    sinr_vals = [p["radio"]["sinr_db"] for p in points]
    
    summary = {
        "run_id": run_id,
        "points_analyzed": len(points),
        "duration_minutes": round((points[-1]["ts_utc"] - points[0]["ts_utc"]).total_seconds() / 60, 1),
        "avg_rsrp": round(sum(rsrp_vals)/len(rsrp_vals), 1),
        "min_rsrp": min(rsrp_vals),
        "poor_signal_percent": round(len([x for x in rsrp_vals if x < -100]) / len(rsrp_vals) * 100, 1),
        "avg_sinr": round(sum(sinr_vals)/len(sinr_vals), 1),
        "last_10_points": [p["radio"] for p in points[-10:]]
    }
    
    prompt = f"""You are an expert cellular network engineer, geospatial analysts and regional telecom development and cellular service upgrade and improvement expert. Analyze this vehicle ride telemetry (1 Hz data).

{json.dumps(summary, default=str)}

Give a short, actionable insight (3-5 bullet points) about:
• Overall signal quality
• Any blackspots or drops
• Recommendations for operator / route"""

    completion = await app.state.llm_client.chat.completions.create(
        model=app.state.llm_model,
        messages=[{"role": "system", "content": "You are a helpful cellular signal expert."},
                  {"role": "user", "content": prompt}],
        # temperature=0.7, # temp not supported for gpt-5-nano
        max_completion_tokens=400
    )
    
    return {"insight": completion.choices[0].message.content.strip()}

# === DUMMY DATA (now also publishes live) ===
@app.post("/api/seed")
async def seed_dummy_data(
    num_points: int = Query(1000),
    run_id: str = Query("run_test_002")
):
    base_time = datetime.utcnow() - timedelta(minutes=10)
    lat, lon = 6.9271, 79.8612
    points = []

    for i in range(num_points):
        ts = base_time + timedelta(seconds=i)
        point = TelemetryPoint(
            ts_utc=ts,
            meta=Meta(run_id=run_id, vehicle_id="veh_01", phone_id="a53_01", operator="Dialog", rat="LTE"),
            radio=Radio(rsrp_dbm=random.randint(-115, -85), rsrq_db=random.randint(-18, -8), sinr_db=random.randint(0, 18),
                        cell_id="41322109", pci=112, earfcn=1650, band="B3"),
            gps=Gps(lat=round(lat + random.uniform(-0.008, 0.008), 6),
                    lon=round(lon + random.uniform(-0.008, 0.008), 6),
                    alt_m=round(17.4 + random.uniform(-10, 10), 1),
                    speed_mps=round(11.2 + random.uniform(-5, 5), 1),
                    heading_deg=182.5, fix_quality=1, satellites=14, gps_ts=ts),
            env=Env(light_lux=round(random.uniform(5, 80), 1),
                    temp_c=round(random.uniform(35, 45), 1),
                    shade_flag=random.choice([True, False]),
	    humidity = round(random.uniform(78,90),1)),
            ingest=Ingest(pi_id="pi_gateway_01", phone_seq=10000 + i,
                          received_at=ts + timedelta(milliseconds=300))
        )
        doc = point.model_dump()
        doc["location"] = {"type": "Point", "coordinates": [point.gps.lon, point.gps.lat]}
        await app.state.collection.insert_one(doc)
        
        # Also publish live
        publish_doc = point.model_dump(mode="json")
        publish_doc["location"] = doc["location"]
        await app.state.redis.publish(f"telemetry:{run_id}", json.dumps(publish_doc))
        
        points.append(doc)

    return {"status": "seeded", "run_id": run_id, "points": num_points, "live": "published"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)


# === DUMMY DATA GENERATOR (for frontend testing - remove from prod) ===
#
# @app.post("/api/seed")
# async def seed_dummy_data(
#     num_points: int = Query(1000, description="Number of 1Hz points to generate"),
#     run_id: str = Query("run_test_001")
# ):
#     base_time = datetime.now(timezone.utc) - timedelta(minutes=10)
#     points = []
#     lat, lon = 6.9154633, 79.9729362   # SLIIT area
    
#     for i in range(num_points):
#         ts = base_time + timedelta(seconds=i)
#         point = TelemetryPoint(
#             ts_utc= ts,
#             meta=Meta(run_id=run_id, vehicle_id="veh_01", phone_id="a53_01", operator="Dialog", rat="LTE"),
#             radio=Radio(
#                 rsrp_dbm=random.randint(-115, -85),
#                 rsrq_db=random.randint(-18, -8),
#                 sinr_db=random.randint(0, 18),
#                 cell_id="41322109",
#                 pci=112,
#                 earfcn=1650,
#                 band="B3"
#             ),
#             gps=Gps(
#                 lat=round(lat + random.uniform(-0.005, 0.005), 6),
#                 lon=round(lon + random.uniform(-0.005, 0.005), 6),
#                 alt_m=round(17.4 + random.uniform(-10, 10), 1),
#                 speed_mps=round(11.2 + random.uniform(-5, 5), 1),
#                 heading_deg=182.5,
#                 fix_quality=1,
#                 satellites=14,
#                 gps_ts=ts
#             ),
#             env=Env(
#                 light_lux=round(random.uniform(5, 80), 1),
#                 temp_c=round(random.uniform(35, 45), 1),
#                 shade_flag=random.choice([True, False]),
#                 humidity=round(random.uniform(78, 90), 1)
#             ),
#             ingest=Ingest(pi_id="pi_gateway_01", phone_seq=10000 + i, received_at=ts + timedelta(milliseconds=300))
#         )
#         doc = point.model_dump()
#         doc["location"] = {"type": "Point", "coordinates": [point.gps.lon, point.gps.lat]}
#         points.append(doc)

#     await app.state.collection.insert_many(points)
#     return {"status": "seeded", "run_id": run_id, "points": num_points, "message": "Ready for frontend charts!"}
