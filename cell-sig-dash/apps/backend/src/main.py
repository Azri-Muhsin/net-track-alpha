# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# import os
# from dotenv import load_dotenv

# load_dotenv()

# app = FastAPI(title="Cellular Signal Track Dashboard API")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# @app.get("/health")
# async def health():
#     return {"status": "ok", "message": "Backend is running 🚀 ToDo - Connected to Cloud DB"}

# @app.get("/base")
# async def base():
#     return {"status": "ok", "message": "Backend is running 🚀  This is home base ✅"}

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)

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
    return {"status": "ok", "message": "Backend is running 🚀 - Connected to Cloud DBs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host = "0.0.0.0", port=8000, reload = True)