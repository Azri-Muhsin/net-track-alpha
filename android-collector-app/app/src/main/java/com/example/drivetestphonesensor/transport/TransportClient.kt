package com.example.drivetestphonesensor.transport

interface TransportClient {
    suspend fun send(payloadJson: String): Boolean
}