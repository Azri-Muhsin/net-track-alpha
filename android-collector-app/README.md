Drive Test Phone Sensor App
Overview

The Drive Test Phone Sensor App is an Android-based data collection application designed to capture real-time mobile network telemetry from a smartphone. The application extracts radio network measurements using the Android Telephony API and streams them to a backend server for storage and analysis.

This app forms the mobile sensing component of the low-cost drive testing system. It allows smartphones to function as portable network sensors capable of collecting signal strength, network type, and cell information while moving through different geographic locations.

The collected data supports network performance monitoring, visualization, and analytics for telecom network evaluation.

System Architecture

The system consists of three main components:

Phone Sensor App
Collects radio signal measurements from the Android device.

Data Receiver Server
Receives and stores telemetry data sent from the phone.

Analytics and Visualization Layer
Processes the collected data for dashboards, maps, and network analysis.

The phone app continuously samples cellular information and sends structured JSON payloads to the backend server via HTTP.

Features

Real-time cellular network telemetry collection

Supports LTE, 5G NR, GSM, and WCDMA cell information

Extracts signal metrics including RSRP, RSRQ, and SINR

Sequential record generation for reliable data ordering

Foreground service for continuous background sensing

Network transmission of telemetry to a remote server

JSON formatted telemetry records

Lightweight Android interface for starting and stopping sensing

Data Collected

Each telemetry record contains radio network information collected from the Android Telephony API.

Example payload structure:

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

Field description:

Field	Description
ts_device	Timestamp generated on the device
phone_id	Unique identifier for the phone sensor
seq	Sequential record number
rat	Radio Access Technology (LTE, NR, GSM, WCDMA)
rsrp_dbm	Reference Signal Received Power
rsrq_db	Reference Signal Received Quality
sinr_db	Signal to Interference plus Noise Ratio
cell_id	Serving cell identifier
pci	Physical Cell Identity
earfcn	LTE channel frequency number
band	Operating frequency band
source	Data source identifier
Sampling Rate

The application collects radio measurements at a fixed interval determined by the foreground sensing service.

Typical sampling rate:
0.5 Hz (one record every two seconds)

This rate can be modified within the service configuration if higher granularity is required.

Network Transmission

Telemetry records are transmitted to a backend server through HTTP requests.

Server endpoint example:

http://<SERVER_IP>:8000/ingest

The server processes the JSON payload and stores the records for downstream analytics and visualization.

Hardware and Connectivity

The phone sensor communicates with the backend server through USB tethering or Wi-Fi networking.

Typical setup:

Phone → USB Tethering → Laptop / Raspberry Pi → Backend Receiver

USB tethering ensures stable connectivity during mobile drive testing scenarios.

Application Components

Main components of the Android application:

MainActivity
Provides the interface to start and stop the sensing service.

DriveTestForegroundService
Runs continuous radio sensing and handles telemetry transmission.

AndroidTelephonyRadioSource
Extracts cellular information from the Android Telephony API.

LocalJsonlWriter
Optionally stores telemetry records locally for debugging or offline analysis.

Permissions Required

The application requires the following Android permissions:

ACCESS_FINE_LOCATION
READ_PHONE_STATE
FOREGROUND_SERVICE
INTERNET

Location permission is required because Android restricts access to cellular radio information unless location access is granted.

Running the Application

Install the application on the Android device.

Ensure the device has cellular connectivity.

Connect the device to the receiver system using USB tethering or Wi-Fi.

Configure the backend server URL in the application.

Launch the application.

Press "Start Drive Test" to begin telemetry streaming.

The service will run continuously until "Stop Drive Test" is selected.

Use Cases

Telecom drive testing

Signal strength mapping

Cellular network performance analysis

Low-cost network telemetry collection

Research on mobile network coverage

Future Improvements

GPS coordinate integration for geospatial analysis

Secure HTTPS telemetry transmission

Offline buffering and retransmission

Dynamic server configuration

Real-time monitoring dashboard integrationcollects cell network data from android phones 