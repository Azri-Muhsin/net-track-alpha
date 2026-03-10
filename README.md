# net-track-alpha
### Drive Test System

A mobile drive-testing platform for collecting cellular radio metrics from one or more Android phones, enriching them with shared GPS and environmental data on a Raspberry Pi, buffering locally in SQLite, and forwarding to MongoDB for analytics and visualization.

## Goals
- Collect RSRP, RSRQ, SINR, Cell ID and related radio metrics
- Use a centralized external GPS source for consistent location/time
- Attach environmental context such as light and temperature
- Buffer locally when connectivity is poor
- Upload to cloud storage for replay, analytics, and dashboards
- Scale from 1 phone PoC to 4 phones

## Components
- `apps/phone-collector`: Android collector running on rooted Galaxy A53
- `apps/pi-gateway`: Raspberry Pi ingest, merge, buffer, and uploader
- `apps/cloud-api`: backend for ingest/query
- `apps/web-dashboard`: frontend visualization
- `packages/shared-models`: schemas and shared models
- `docs/`: architecture, decisions, and deployment docs

## First milestone
One phone sends radio samples to the Pi over USB. The Pi stores them in SQLite and forwards them to MongoDB. A basic page or script shows latest samples.

## Architecture summary
Phone(s) -> Raspberry Pi -> SQLite local queue -> Cloud API / MongoDB -> Dashboard

## Current status
- [ ] Shared schemas
- [ ] Fake data generator
- [ ] Pi ingest API
- [ ] SQLite queue
- [ ] Cloud ingest
- [ ] Real phone collector
- [ ] GPS integration
- [ ] Sensor integration
- [ ] Dashboard

## Development principles
- UTC timestamps everywhere
- Pi is the single gateway
- Local-first persistence
- Separate raw and merged records
- Schema-first development
