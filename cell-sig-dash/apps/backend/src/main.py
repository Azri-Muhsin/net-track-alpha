from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import json
import os
import random

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from src.schemas.telemetry import TelemetryPoint

load_dotenv()

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

PHONE_DATA_FILE = DATA_DIR / "phone_radio_data.jsonl"


@asynccontextmanager
async def lifespan(app: FastAPI):
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

    app.state.client = AsyncIOMotorClient(
        uri,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=30000,
    )
    app.state.db = app.state.client["cellular_signal_db"]
    app.state.collection = app.state.db["telemetry_points"]

    # Single-field indexes
    await app.state.collection.create_index("meta.run_id")
    await app.state.collection.create_index("district")
    await app.state.collection.create_index("province")
    await app.state.collection.create_index("ts_utc")

    # Compound indexes for dashboard filters/date windows
    await app.state.collection.create_index([("ts_utc", 1), ("district", 1)])
    await app.state.collection.create_index([("meta.run_id", 1), ("ts_utc", 1)])
    await app.state.collection.create_index([("district", 1), ("ts_utc", 1)])
    await app.state.collection.create_index([("meta.run_id", 1), ("district", 1), ("ts_utc", 1)])

    # Geo index. This can fail if older/bad docs have invalid location values, so do not crash startup.
    try:
        await app.state.collection.create_index([("location", "2dsphere")])
    except Exception as e:
        print(f"Warning: could not create 2dsphere index on location: {e}")

    await app.state.db.command("ping")
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


def clean_district_name(value: str | None):
    if not value:
        return "Unknown"
    return value.replace(" District", "").strip()


def get_rsrp_color(rsrp: float | None):
    if rsrp is None:
        return "#374151"
    if rsrp >= -70:
        return "#1a9850"
    if rsrp >= -80:
        return "#66bd63"
    if rsrp >= -90:
        return "#fee08b"
    if rsrp >= -100:
        return "#fc8d59"
    if rsrp >= -110:
        return "#f46d43"
    return "#d73027"


def get_rsrp_rating(rsrp: float | None):
    if rsrp is None:
        return "Unknown"
    if rsrp >= -70:
        return "Excellent"
    if rsrp >= -80:
        return "Good"
    if rsrp >= -90:
        return "Fair"
    if rsrp >= -100:
        return "Poor"
    return "Critical"


def flatten_doc_to_points(doc: dict, selected_operator: str | None = None):
    points = []

    doc_id = str(doc.get("_id"))
    ts_utc = serialize_datetime(doc.get("ts_utc"))

    meta = doc.get("meta", {}) or {}
    gps = doc.get("gps", {}) or {}

    lat = gps.get("lat")
    lon = gps.get("lon")

    district = clean_district_name(
        doc.get("district") or doc.get("ingest", {}).get("district")
    )

    province = doc.get("province") or doc.get("ingest", {}).get("province") or "Sri Lanka"

    run_id = meta.get("run_id")
    vehicle_id = meta.get("vehicle_id")
    phone_id = meta.get("phone_id")
    rat = meta.get("rat")

    operators = doc.get("operators")

    if isinstance(operators, dict) and operators:
        for operator_name, signal in operators.items():
            if selected_operator and selected_operator != "all" and operator_name != selected_operator:
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

    if selected_operator and selected_operator != "all" and operator_name != selected_operator:
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


def build_base_query(
    run_id: str | None,
    district: str | None,
    start_ts: str | None,
    end_ts: str | None,
):
    query: dict[str, Any] = {}

    if run_id and run_id != "all":
        query["meta.run_id"] = run_id

    if district and district != "All Districts" and district != "all":
        query["district"] = district

    if start_ts or end_ts:
        query["ts_utc"] = {}

        if start_ts:
            query["ts_utc"]["$gte"] = parse_iso_datetime(start_ts)

        if end_ts:
            query["ts_utc"]["$lte"] = parse_iso_datetime(end_ts)

    return query


def build_flatten_pipeline(query: dict[str, Any], operator: str | None):
    """
    Normalizes both schemas into one row per operator signal:
    1. New schema: operators = { Dialog: {...}, Mobitel: {...} }
    2. Old schema: meta.operator + radio = {...}
    """
    pipeline: list[dict[str, Any]] = [
        {"$match": query},
        {
            "$project": {
                "ts_utc": 1,
                "district": {"$ifNull": ["$district", "$ingest.district"]},
                "province": {"$ifNull": ["$province", "$ingest.province"]},
                "meta": 1,
                "gps": 1,
                "operatorArray": {
                    "$cond": [
                        {"$eq": [{"$type": "$operators"}, "object"]},
                        {"$objectToArray": "$operators"},
                        [
                            {
                                "k": {"$ifNull": ["$meta.operator", "Unknown"]},
                                "v": {"$ifNull": ["$radio", {}]},
                            }
                        ],
                    ]
                },
            }
        },
        {"$unwind": "$operatorArray"},
        {
            "$project": {
                "_id": 0,
                "source_id": {"$toString": "$_id"},
                "ts_utc": 1,
                "run_id": "$meta.run_id",
                "vehicle_id": "$meta.vehicle_id",
                "phone_id": "$meta.phone_id",
                "rat": "$meta.rat",
                "operator": "$operatorArray.k",
                "rsrp_dbm": "$operatorArray.v.rsrp_dbm",
                "rsrq_db": "$operatorArray.v.rsrq_db",
                "sinr_db": "$operatorArray.v.sinr_db",
                "cell_id": "$operatorArray.v.cell_id",
                "pci": "$operatorArray.v.pci",
                "earfcn": "$operatorArray.v.earfcn",
                "band": "$operatorArray.v.band",
                "lat": "$gps.lat",
                "lon": "$gps.lon",
                "district": {"$ifNull": ["$district", "Unknown"]},
                "province": {"$ifNull": ["$province", "Sri Lanka"]},
            }
        },
        {"$match": {"rsrp_dbm": {"$type": "number"}}},
    ]

    if operator and operator != "all":
        pipeline.append({"$match": {"operator": operator}})

    return pipeline


def build_summary_pipeline(query: dict[str, Any], operator: str | None, threshold: int):
    pipeline = build_flatten_pipeline(query, operator)

    pipeline.extend(
        [
            {
                "$facet": {
                    "overall": [
                        {
                            "$group": {
                                "_id": None,
                                "total_samples": {"$sum": 1},
                                "avg_rsrp": {"$avg": "$rsrp_dbm"},
                                "avg_rsrq": {"$avg": "$rsrq_db"},
                                "avg_sinr": {"$avg": "$sinr_db"},
                                "weak_count": {
                                    "$sum": {
                                        "$cond": [{"$lte": ["$rsrp_dbm", threshold]}, 1, 0]
                                    }
                                },
                                "critical_count": {
                                    "$sum": {
                                        "$cond": [{"$lte": ["$rsrp_dbm", -120]}, 1, 0]
                                    }
                                },
                            }
                        },
                        {
                            "$project": {
                                "_id": 0,
                                "total_samples": 1,
                                "avg_rsrp": {"$round": ["$avg_rsrp", 1]},
                                "avg_rsrq": {"$round": ["$avg_rsrq", 1]},
                                "avg_sinr": {"$round": ["$avg_sinr", 1]},
                                "critical_count": 1,
                                "weak_coverage_percent": {
                                    "$cond": [
                                        {"$gt": ["$total_samples", 0]},
                                        {
                                            "$round": [
                                                {
                                                    "$multiply": [
                                                        {"$divide": ["$weak_count", "$total_samples"]},
                                                        100,
                                                    ]
                                                },
                                                1,
                                            ]
                                        },
                                        0,
                                    ]
                                },
                            }
                        },
                    ],
                    "district_stats": [
                        {
                            "$group": {
                                "_id": "$district",
                                "province": {"$first": "$province"},
                                "totalSamples": {"$sum": 1},
                                "avgRsrp": {"$avg": "$rsrp_dbm"},
                                "avgRsrq": {"$avg": "$rsrq_db"},
                                "avgSinr": {"$avg": "$sinr_db"},
                                "weakSamples": {
                                    "$sum": {
                                        "$cond": [{"$lte": ["$rsrp_dbm", threshold]}, 1, 0]
                                    }
                                },
                            }
                        },
                        {
                            "$project": {
                                "_id": 0,
                                "districtName": "$_id",
                                "province": 1,
                                "totalSamples": 1,
                                "weakPercent": {
                                    "$cond": [
                                        {"$gt": ["$totalSamples", 0]},
                                        {
                                            "$round": [
                                                {
                                                    "$multiply": [
                                                        {"$divide": ["$weakSamples", "$totalSamples"]},
                                                        100,
                                                    ]
                                                },
                                                0,
                                            ]
                                        },
                                        0,
                                    ]
                                },
                                "avgRsrp": {"$round": ["$avgRsrp", 0]},
                                "medianRsrp": None,
                                "avgRsrq": {"$round": ["$avgRsrq", 1]},
                                "avgSinr": {"$round": ["$avgSinr", 1]},
                            }
                        },
                        {"$sort": {"weakPercent": -1}},
                    ],
                }
            }
        ]
    )

    return pipeline


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

    if run_id and run_id != "all":
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
async def get_dashboard_summary(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    district: str | None = Query(None),
    threshold: int = Query(-110),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
):
    """
    Safer version of the old dashboard summary.
    It no longer pulls 100,000 documents into Python.
    MongoDB calculates the totals and district stats using aggregation.
    """
    query = build_base_query(run_id, district, start_ts, end_ts)
    pipeline = build_summary_pipeline(query, operator, threshold)

    result = await app.state.collection.aggregate(
        pipeline,
        allowDiskUse=True,
        maxTimeMS=25000,
    ).to_list(length=1)

    if not result:
        return {
            "run_id": run_id,
            "operator": operator,
            "district": district,
            "threshold": threshold,
            "total_samples": 0,
            "avg_rsrp": None,
            "avg_rsrq": None,
            "avg_sinr": None,
            "weak_coverage_percent": 0,
            "critical_count": 0,
            "district_stats": [],
        }

    facet = result[0]
    overall = facet.get("overall", [])
    overall_doc = overall[0] if overall else {}

    return {
        "run_id": run_id,
        "operator": operator,
        "district": district,
        "threshold": threshold,
        "total_samples": overall_doc.get("total_samples", 0),
        "avg_rsrp": overall_doc.get("avg_rsrp"),
        "avg_rsrq": overall_doc.get("avg_rsrq"),
        "avg_sinr": overall_doc.get("avg_sinr"),
        "weak_coverage_percent": overall_doc.get("weak_coverage_percent", 0),
        "critical_count": overall_doc.get("critical_count", 0),
        "district_stats": facet.get("district_stats", []),
    }


@app.get("/api/analytics/summary")
async def get_analytics_summary(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    district: str | None = Query(None),
    threshold: int = Query(-110),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
):
    query = build_base_query(run_id, district, start_ts, end_ts)

    pipeline = build_flatten_pipeline(query, operator)

    pipeline.extend(
        [
            {
                "$group": {
                    "_id": None,
                    "total_samples": {"$sum": 1},
                    "avg_rsrp": {"$avg": "$rsrp_dbm"},
                    "avg_rsrq": {"$avg": "$rsrq_db"},
                    "avg_sinr": {"$avg": "$sinr_db"},
                    "weak_samples": {
                        "$sum": {
                            "$cond": [{"$lte": ["$rsrp_dbm", threshold]}, 1, 0]
                        }
                    },
                    "critical_count": {
                        "$sum": {
                            "$cond": [{"$lte": ["$rsrp_dbm", -120]}, 1, 0]
                        }
                    },
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "total_samples": 1,
                    "avg_rsrp": {"$round": ["$avg_rsrp", 1]},
                    "avg_rsrq": {"$round": ["$avg_rsrq", 1]},
                    "avg_sinr": {"$round": ["$avg_sinr", 1]},
                    "weak_samples": 1,
                    "critical_count": 1,
                    "weak_coverage_percent": {
                        "$cond": [
                            {"$gt": ["$total_samples", 0]},
                            {
                                "$round": [
                                    {
                                        "$multiply": [
                                            {"$divide": ["$weak_samples", "$total_samples"]},
                                            100,
                                        ]
                                    },
                                    1,
                                ]
                            },
                            0,
                        ]
                    },
                }
            },
        ]
    )

    result = await app.state.collection.aggregate(
        pipeline,
        allowDiskUse=True,
        maxTimeMS=25000,
    ).to_list(length=1)

    return result[0] if result else {
        "total_samples": 0,
        "avg_rsrp": None,
        "avg_rsrq": None,
        "avg_sinr": None,
        "weak_samples": 0,
        "critical_count": 0,
        "weak_coverage_percent": 0,
    }


@app.get("/api/analytics/districts")
async def get_analytics_districts(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    district: str | None = Query(None),
    threshold: int = Query(-110),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
):
    query = build_base_query(run_id, district, start_ts, end_ts)

    pipeline = build_flatten_pipeline(query, operator)

    pipeline.extend(
        [
            {
                "$group": {
                    "_id": "$district",
                    "province": {"$first": "$province"},
                    "totalSamples": {"$sum": 1},
                    "avgRsrp": {"$avg": "$rsrp_dbm"},
                    "avgRsrq": {"$avg": "$rsrq_db"},
                    "avgSinr": {"$avg": "$sinr_db"},
                    "weakSamples": {
                        "$sum": {
                            "$cond": [{"$lte": ["$rsrp_dbm", threshold]}, 1, 0]
                        }
                    },
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "districtName": "$_id",
                    "province": 1,
                    "totalSamples": 1,
                    "avgRsrp": {"$round": ["$avgRsrp", 0]},
                    "medianRsrp": None,
                    "avgRsrq": {"$round": ["$avgRsrq", 1]},
                    "avgSinr": {"$round": ["$avgSinr", 1]},
                    "weakPercent": {
                        "$cond": [
                            {"$gt": ["$totalSamples", 0]},
                            {
                                "$round": [
                                    {
                                        "$multiply": [
                                            {"$divide": ["$weakSamples", "$totalSamples"]},
                                            100,
                                        ]
                                    },
                                    0,
                                ]
                            },
                            0,
                        ]
                    },
                }
            },
            {"$sort": {"weakPercent": -1}},
        ]
    )

    return await app.state.collection.aggregate(
        pipeline,
        allowDiskUse=True,
        maxTimeMS=25000,
    ).to_list(length=None)


@app.get("/api/records")
async def get_records(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    district: str | None = Query(None),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
):
    query = build_base_query(run_id, district, start_ts, end_ts)

    skip = (page - 1) * page_size

    base_pipeline = build_flatten_pipeline(query, operator)

    rows = await app.state.collection.aggregate(
        [
            *base_pipeline,
            {"$sort": {"ts_utc": -1}},
            {"$skip": skip},
            {"$limit": page_size},
        ],
        allowDiskUse=True,
        maxTimeMS=25000,
    ).to_list(length=page_size)

    total_result = await app.state.collection.aggregate(
        [
            *base_pipeline,
            {"$count": "total"},
        ],
        allowDiskUse=True,
        maxTimeMS=25000,
    ).to_list(length=1)

    total = total_result[0]["total"] if total_result else 0

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "rows": rows,
    }


@app.get("/api/dashboard/points")
async def get_dashboard_points(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    district: str | None = Query(None),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
    limit: int = Query(3000, le=10000),
):
    query = build_base_query(run_id, district, start_ts, end_ts)

    projection = {
        "ts_utc": 1,
        "meta": 1,
        "radio": 1,
        "operators": 1,
        "gps.lat": 1,
        "gps.lon": 1,
        "district": 1,
        "province": 1,
        "ingest.district": 1,
        "ingest.province": 1,
    }

    cursor = (
        app.state.collection.find(query, projection)
        .sort("ts_utc", 1)
        .limit(limit)
        .max_time_ms(25000)
    )

    docs = await cursor.to_list(length=limit)

    points = []

    for doc in docs:
        points.extend(flatten_doc_to_points(doc, selected_operator=operator))

    valid_points = [
        p
        for p in points
        if isinstance(p.get("lat"), (int, float))
        and isinstance(p.get("lon"), (int, float))
        and isinstance(p.get("rsrp_dbm"), (int, float))
    ]

    return valid_points[:limit]


@app.get("/api/hexbin")
async def get_hexbin(
    operator: str | None = Query(None),
    run_id: str | None = Query(None),
    district: str | None = Query(None),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
    limit: int = Query(15000, le=30000),
):
    query = build_base_query(run_id, district, start_ts, end_ts)
    projection = {
        "ts_utc": 1,
        "meta": 1,
        "radio": 1,
        "operators": 1,
        "gps.lat": 1,
        "gps.lon": 1,
        "district": 1,
        "province": 1,
        "ingest.district": 1,
        "ingest.province": 1,
    }

    cursor = (
        app.state.collection.find(query, projection)
        .sort("ts_utc", 1)
        .limit(limit)
    )

    docs = await cursor.to_list(length=limit)
    features = []

    for doc in docs:
        points = flatten_doc_to_points(doc, selected_operator=operator)
        for p in points:
            if not isinstance(p.get("lat"), (int, float)) or not isinstance(
                p.get("lon"), (int, float)
            ):
                continue

            rsrp = p.get("rsrp_dbm")
            sinr = p.get("sinr_db")
            if rsrp is None or sinr is None:
                continue

            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [p["lon"], p["lat"]],
                    },
                    "properties": {
                        "operator": p.get("operator"),
                        "rsrp": rsrp,
                        "sinr": sinr,
                        "district": p.get("district"),
                        "province": p.get("province"),
                        "run_id": p.get("run_id"),
                        "ts_utc": p.get("ts_utc"),
                    },
                }
            )

    return {
        "type": "FeatureCollection",
        "features": features,
    }

@app.get("/api/hexbin/district")
async def get_hexbin_district(
    operator: str | None = Query(None),
    run_id: str | None = Query(None),
    district: str | None = Query(None),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
):
    query = build_base_query(run_id, district, start_ts, end_ts)

    projection = {
        "ts_utc": 1,
        "meta": 1,
        "radio": 1,
        "operators": 1,
        "gps.lat": 1,
        "gps.lon": 1,
        "district": 1,
        "province": 1,
        "ingest.district": 1,
        "ingest.province": 1,
    }

    cursor = app.state.collection.find(query, projection)

    docs = await cursor.to_list(length=None)

    # 🔥 aggregate manually after flatten
    district_map = {}

    for doc in docs:
        points = flatten_doc_to_points(doc, selected_operator=operator)

        for p in points:
            lat = p.get("lat")
            lon = p.get("lon")
            rsrp = p.get("rsrp_dbm")

            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
                continue
            if rsrp is None:
                continue

            dname = p.get("district") or "Unknown"

            if dname not in district_map:
                district_map[dname] = {
                    "sum_rsrp": 0,
                    "count": 0,
                    "sum_lat": 0,
                    "sum_lon": 0,
                }

            district_map[dname]["sum_rsrp"] += rsrp
            district_map[dname]["count"] += 1
            district_map[dname]["sum_lat"] += lat
            district_map[dname]["sum_lon"] += lon

    # build GeoJSON
    features = []

    for dname, v in district_map.items():
        if v["count"] == 0:
            continue

        avg_rsrp = v["sum_rsrp"] / v["count"]
        avg_lat = v["sum_lat"] / v["count"]
        avg_lon = v["sum_lon"] / v["count"]

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [avg_lon, avg_lat],
            },
            "properties": {
                "district": dname,
                "avgRsrp": avg_rsrp,
                "count": v["count"],
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }

@app.get("/api/mno/district")
async def get_mno_district(
    operator: str = Query("Dialog"),
    run_id: str | None = Query(None),
    district: str | None = Query(None),
    start_ts: str | None = Query(None),
    end_ts: str | None = Query(None),
):
    query = build_base_query(run_id, district, start_ts, end_ts)
    projection = {
        "operators": 1,
        "gps.lat": 1,
        "gps.lon": 1,
        "district": 1,
        "province": 1,
        "ingest.district": 1,
        "ingest.province": 1,
    }

    cursor = app.state.collection.find(query, projection)
    docs = await cursor.to_list(length=None)

    district_map: dict[str, dict[str, float | int]] = {}

    for doc in docs:
        district_name = clean_district_name(
            doc.get("district") or doc.get("ingest", {}).get("district")
        )

        op = (doc.get("operators") or {}).get(operator)
        if not op:
            continue

        rsrp = op.get("rsrp_dbm")
        sinr = op.get("sinr_db")
        lat = doc.get("gps", {}).get("lat")
        lon = doc.get("gps", {}).get("lon")

        if rsrp is None or lat is None or lon is None:
            continue

        if district_name not in district_map:
            district_map[district_name] = {
                "sum_rsrp": 0.0,
                "sum_sinr": 0.0,
                "count": 0,
                "sum_lat": 0.0,
                "sum_lon": 0.0,
            }

        district_map[district_name]["sum_rsrp"] += float(rsrp)
        district_map[district_name]["count"] += 1
        district_map[district_name]["sum_lat"] += float(lat)
        district_map[district_name]["sum_lon"] += float(lon)

        if isinstance(sinr, (int, float)):
            district_map[district_name]["sum_sinr"] += float(sinr)

    results = []

    for district_name, values in district_map.items():
        if values["count"] == 0:
            continue

        avg_rsrp = values["sum_rsrp"] / values["count"]
        avg_sinr = (
            values["sum_sinr"] / values["count"]
            if values["sum_sinr"] != 0
            else None
        )

        results.append(
            {
                "district": district_name,
                "operator": operator,
                "avgRsrp": avg_rsrp,
                "avgSinr": avg_sinr,
                "count": values["count"],
                "lat": values["sum_lat"] / values["count"],
                "lon": values["sum_lon"] / values["count"],
                "rating": get_rsrp_rating(avg_rsrp),
                "fillColor": get_rsrp_color(avg_rsrp),
            }
        )

    return {"operator": operator, "data": results}


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

    cursor = app.state.collection.aggregate(
        pipeline,
        allowDiskUse=True,
        maxTimeMS=25000,
    )
    runs = await cursor.to_list(length=None)

    cleaned = []

    for run in runs:
        run_id = run.pop("_id", None)

        if not run_id:
            continue

        cleaned.append(
            {
                "run_id": run_id,
                "vehicle_id": run.get("vehicle_id"),
                "start_time": serialize_datetime(run.get("start_time")),
                "end_time": serialize_datetime(run.get("end_time")),
                "point_count": run.get("point_count", 0),
                "district": run.get("district"),
                "province": run.get("province"),
            }
        )

    return cleaned


@app.get("/api/operators")
async def get_operators():
    pipeline = [
        {
            "$project": {
                "operator_names": {
                    "$cond": [
                        {"$eq": [{"$type": "$operators"}, "object"]},
                        {"$objectToArray": "$operators"},
                        [{"k": {"$ifNull": ["$meta.operator", "Unknown"]}, "v": {}}],
                    ]
                }
            }
        },
        {"$unwind": "$operator_names"},
        {"$group": {"_id": "$operator_names.k"}},
        {"$sort": {"_id": 1}},
    ]

    cursor = app.state.collection.aggregate(
        pipeline,
        allowDiskUse=True,
        maxTimeMS=25000,
    )
    rows = await cursor.to_list(length=None)

    return [row["_id"] for row in rows if row.get("_id")]


@app.post("/api/seed")
async def seed_dummy_data(
    num_points: int = Query(1000, ge=1, le=100000),
    run_id: str = Query("run_test_001"),
):
    operators = ["Dialog", "Mobitel", "Hutch", "Airtel"]
    base_time = datetime.now(timezone.utc) - timedelta(minutes=10)

    start_lat, start_lon = 6.9271, 79.8612
    docs = []

    districts = [
        ("Colombo", "Western"),
        ("Gampaha", "Western"),
        ("Kalutara", "Western"),
        ("Kandy", "Central"),
        ("Galle", "Southern"),
    ]

    for i in range(num_points):
        ts = base_time + timedelta(seconds=i)

        district_name, province_name = random.choice(districts)

        lat = round(start_lat + random.uniform(-0.3, 0.3), 6)
        lon = round(start_lon + random.uniform(-0.3, 0.3), 6)

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
            "district": district_name,
            "province": province_name,
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


@app.get("/api/rig-health/timeseries")
async def get_rig_health_timeseries(
    run_id: str | None = Query(None),
    operator: str | None = Query(None),
    start_after: str | None = Query(None, description="ISO timestamp – only return points after this time (for live polling)"),
    limit: int = Query(5000, le=20000),
):
    """
    Returns a timeseries of { ts_utc, temp_c, rsrp_dbm } for the Rig Health chart.
    If operator is provided, rsrp_dbm is taken from that operator's signal.
    Otherwise the average RSRP across all operators for each document is used.
    """
    query: dict[str, Any] = {}

    if run_id:
        query["meta.run_id"] = run_id

    ts_filter: dict = {}
    if start_after:
        ts_filter["$gt"] = parse_iso_datetime(start_after)
    if ts_filter:
        query["ts_utc"] = ts_filter

    projection = {
        "ts_utc": 1,
        "env.temp_c": 1,
        "radio.rsrp_dbm": 1,
        "operators": 1,
        "accel": 1,
    }

    cursor = (
        app.state.collection.find(query, projection)
        .sort("ts_utc", 1)
        .limit(limit)
    )

    docs = await cursor.to_list(length=limit)

    results = []
    for doc in docs:
        ts_utc = serialize_datetime(doc.get("ts_utc"))
        env = doc.get("env") or {}
        temp_c = env.get("temp_c")

        # Resolve rsrp_dbm
        rsrp_dbm: float | None = None
        operators_data = doc.get("operators")

        if isinstance(operators_data, dict) and operators_data:
            if operator and operator in operators_data:
                sig = operators_data[operator] or {}
                rsrp_dbm = sig.get("rsrp_dbm")
            else:
                # Average across all operators
                vals = [
                    (v or {}).get("rsrp_dbm")
                    for v in operators_data.values()
                    if isinstance((v or {}).get("rsrp_dbm"), (int, float))
                ]
                rsrp_dbm = round(sum(vals) / len(vals), 1) if vals else None
        else:
            radio = doc.get("radio") or {}
            rsrp_dbm = radio.get("rsrp_dbm")

        if temp_c is None and rsrp_dbm is None:
            continue

        accel = doc.get("accel")
        if accel and isinstance(accel, dict):
            x = accel.get("x", 0)
            y = accel.get("y", 0)
            z = accel.get("z", 0)
            magnitude = (x**2 + y**2 + z**2) ** 0.5
            vibration_m_s2 = round(abs(magnitude - 9.8), 2)
        else:
            # Mock vibration data using Gaussian noise if real data is missing from DB
            vibration_m_s2 = round(abs(random.gauss(0.5, 2.0)), 2)

        results.append({
            "ts_utc": ts_utc,
            "temp_c": temp_c,
            "rsrp_dbm": rsrp_dbm,
            "vibration_m_s2": vibration_m_s2,
        })

    return results


if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
