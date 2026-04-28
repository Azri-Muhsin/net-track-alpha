package com.example.drivetestphonesensor.transport

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class HttpTransportClient(
    private val baseUrl: String
) : TransportClient {

    private val client = OkHttpClient()

    override suspend fun send(payloadJson: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val body = payloadJson.toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url("$baseUrl/ingest/phone-radio")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                Log.d("DriveTest", "HTTP response code=${response.code}")
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e("DriveTest", "HTTP send failed", e)
            false
        }
    }
}