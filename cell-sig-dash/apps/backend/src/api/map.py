from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
import os

router = APIRouter()

client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
db = client["cellular_db"]
collection = db["measurements"]

@router.get("/map-data")
async def get_map_data(operator: str = "Dialog", limit: int = 5000):
    """
    Returns GeoJSON points for Mapbox
    """

    cursor = collection.find({}, {"location": 1, "operators": 1})

    docs = await cursor.to_list(length=limit)

    features = []

    for d in docs:
        if "location" not in d or operator not in d.get("operators", {}):
            continue

        op = d["operators"][operator]

        features.append({
            "type": "Feature",
            "geometry": d["location"],
            "properties": {
                "rsrp": op.get("rsrp_dbm", -100),
                "sinr": op.get("sinr_db", 0),
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }