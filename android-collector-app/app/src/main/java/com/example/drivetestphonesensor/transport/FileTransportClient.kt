package com.example.drivetestphonesensor.transport

import com.example.drivetestphonesensor.storage.LocalJsonlWriter

class FileTransportClient(
    private val localJsonlWriter: LocalJsonlWriter
) : TransportClient {

    override suspend fun send(payloadJson: String): Boolean {
        localJsonlWriter.appendLine(payloadJson)
        return true
    }
}