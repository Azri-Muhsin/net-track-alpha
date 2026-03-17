# Drive Test Phone Sensor App

Android application for real-time cellular network telemetry collection.

---

## Overview

The Drive Test Phone Sensor App is an Android-based data collection application designed to capture real-time mobile network telemetry from a smartphone.

The application extracts radio network measurements using the Android Telephony API and streams them to a backend server for storage and analysis.

This app forms the mobile sensing component of a low-cost drive testing system. It allows smartphones to function as portable network sensors capable of collecting signal strength, network type, and cell information while moving through different geographic locations.

The collected data supports network performance monitoring, visualization, and analytics for telecom network evaluation.

---

## System Architecture

The system consists of three main components:

### Phone Sensor App

Collects radio signal measurements from the Android device.

### Data Receiver Server

Receives and stores telemetry data sent from the phone.

### Analytics and Visualization Layer

Processes the collected data for dashboards, maps, and network analysis.

The phone application continuously samples cellular information and sends structured JSON payloads to the backend server via HTTP.

---

## Features

* Real-time cellular network telemetry collection
* Supports LTE, 5G NR, GSM, and WCDMA cell information
* Extracts signal metrics including RSRP, RSRQ, and SINR
* Sequential record generation for reliable data ordering
* Foreground service for continuous background sensing
* Network transmission of telemetry to a remote server
* JSON formatted telemetry records
* Lightweight Android interface for starting and stopping sensing

---

## Data Collected

Each telemetry record contains radio network information collected from the Android Telephony API.

### Example Payload

```json
{
  "ts_device": "2026-03-16T12:45:10Z",
  "phone_id": "phone_01",
  "seq": 1045,
  "rat": "LTE",
  "rsrp_dbm": -95,
  "rsrq_db": -11,
  "sinr_db": 18,
  "cell_id": "12345678",
  "pci": 345,
  "earfcn": 1800,
  "band": "B3",
  "source": "android_public_api"
}
```

### Field Description

| Field     | Description                             |
| --------- | --------------------------------------- |
| ts_device | Timestamp generated on the device       |
| phone_id  | Unique identifier for the phone sensor  |
| seq       | Sequential record number                |
| rat       | Radio Access Technology                 |
| rsrp_dbm  | Reference Signal Received Power         |
| rsrq_db   | Reference Signal Received Quality       |
| sinr_db   | Signal to Interference plus Noise Ratio |
| cell_id   | Serving cell identifier                 |
| pci       | Physical Cell Identity                  |
| earfcn    | LTE channel frequency number            |
| band      | Operating frequency band                |
| source    | Data source identifier                  |

---

## Sampling Rate

The application collects radio measurements at a fixed interval determined by the foreground sensing service.

Typical sampling rate:

* 0.5 Hz (one record every two seconds)

This rate can be modified within the service configuration if higher sampling granularity is required.

---

## Network Transmission

Telemetry records are transmitted to a backend server through HTTP requests.

Example server endpoint:

```
http://<SERVER_IP>:8000/ingest
```

---

## Hardware and Connectivity

The phone sensor communicates with the backend receiver using either Wi-Fi or USB tethering.

Typical deployment setup:

```
Phone Sensor → USB Tethering → Laptop or Raspberry Pi → Backend Receiver
```

USB tethering is often preferred during drive testing because it provides stable connectivity between the sensing device and the receiver node.

---

## Application Components

The Android application consists of several core components:

* MainActivity
* DriveTestForegroundService
* AndroidTelephonyRadioSource
* LocalJsonlWriter

---

## Repository Structure

```
DriveTestPhoneSensor/
├── app/
│   ├── datasource/
│   ├── domain/
│   ├── service/
│   ├── storage/
│   └── MainActivity.kt
```

---

## Permissions Required

The application requires the following Android permissions:

* ACCESS_FINE_LOCATION
* READ_PHONE_STATE
* FOREGROUND_SERVICE
* INTERNET

Location permission is required because Android restricts access to cellular radio information unless location access has been granted.

---

## Running the Application

1. Install the application on an Android device
2. Ensure the device has active cellular connectivity
3. Connect the device to the receiver machine using USB tethering or Wi-Fi
4. Configure the backend server address in the application
5. Launch the application
6. Press Start Drive Test to begin data collection
7. Press Stop Drive Test to terminate the sensing service

Once started, the foreground service will continuously collect and transmit telemetry records to the backend server.

---

## Use Cases

* Low-cost drive testing
* Cellular signal strength mapping
* Mobile network coverage analysis
* Network performance monitoring
* Research and academic telecom studies
