package com.example.drivetestphonesensor.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.drivetestphonesensor.AppStatusStore
import com.example.drivetestphonesensor.R
import com.example.drivetestphonesensor.datasource.AndroidTelephonyRadioSource
import com.example.drivetestphonesensor.domain.toPayload
import com.example.drivetestphonesensor.storage.LocalJsonlWriter
import com.example.drivetestphonesensor.transport.HttpTransportClient
import com.example.drivetestphonesensor.transport.TransportClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class DriveTestForegroundService : Service() {

    companion object {
        private const val DEFAULT_SERVER_BASE_URL = "http://10.96.39.191:8000"
        private const val PHONE_ID = "a53_01"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "drive_test_channel"
        private const val TAG = "DriveTest"
        private const val SAMPLE_INTERVAL_MS = 2000L
        private const val STARTUP_DELAY_MS = 1500L
    }

    private var seq: Long = 0L
    private var runId: String = ""

    private lateinit var radioSource: AndroidTelephonyRadioSource
    private lateinit var localJsonlWriter: LocalJsonlWriter
    private lateinit var transportClient: TransportClient

    private val json = Json { prettyPrint = false }
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var workerJob: Job? = null

    override fun onCreate() {
        super.onCreate()

        createNotificationChannel()

        radioSource = AndroidTelephonyRadioSource(
            context = this,
            phoneId = PHONE_ID
        )

        localJsonlWriter = LocalJsonlWriter(this)
        transportClient = HttpTransportClient(DEFAULT_SERVER_BASE_URL)

        AppStatusStore.setServiceRunning(this, false)
        AppStatusStore.setLastError(this, "")
        AppStatusStore.setLastHttpCode(this, 0)

        Log.d(TAG, "Using server base URL=$DEFAULT_SERVER_BASE_URL")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        if (workerJob?.isActive == true) {
            Log.d(TAG, "Service already running, ignoring duplicate start")
            return START_STICKY
        }

        runId = "${System.currentTimeMillis()}_$PHONE_ID"
        seq = 0L

        AppStatusStore.reset(this)
        AppStatusStore.setRunId(this, runId)
        AppStatusStore.setLastSeq(this, seq)
        AppStatusStore.setServiceRunning(this, true)

        Log.d(TAG, "Starting new run_id=$runId")

        workerJob = serviceScope.launch {
            delay(STARTUP_DELAY_MS)

            while (isActive) {
                seq += 1
                AppStatusStore.setLastSeq(this@DriveTestForegroundService, seq)

                val sample = radioSource.readSample(seq)
                Log.d(TAG, "sample=$sample")

                if (sample != null) {
                    AppStatusStore.setLastSampleTs(
                        this@DriveTestForegroundService,
                        sample.tsDevice.toString()
                    )

                    val payload = sample.toPayload(runId)
                    val payloadJson = json.encodeToString(payload)

                    Log.d(TAG, "payload_json=$payloadJson")

                    try {
                        val sent = transportClient.send(payloadJson)
                        Log.d(TAG, "transport_sent=$sent")

                        if (sent) {
                            AppStatusStore.incrementSentCount(this@DriveTestForegroundService)
                            AppStatusStore.setLastHttpCode(this@DriveTestForegroundService, 200)
                            AppStatusStore.setLastError(this@DriveTestForegroundService, "")

                            AppStatusStore.appendPayloadLog(
                                this@DriveTestForegroundService,
                                "seq=$seq | SENT | $payloadJson"
                            )
                        } else {
                            AppStatusStore.incrementFailedCount(this@DriveTestForegroundService)
                            AppStatusStore.setLastHttpCode(this@DriveTestForegroundService, 0)
                            AppStatusStore.setLastError(
                                this@DriveTestForegroundService,
                                "Send returned false"
                            )

                            AppStatusStore.appendPayloadLog(
                                this@DriveTestForegroundService,
                                "seq=$seq | FAILED | $payloadJson"
                            )

                            Log.d(TAG, "send failed, writing locally")
                            localJsonlWriter.appendLine(payloadJson)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "transport exception", e)

                        AppStatusStore.incrementFailedCount(this@DriveTestForegroundService)
                        AppStatusStore.setLastHttpCode(this@DriveTestForegroundService, 0)
                        AppStatusStore.setLastError(
                            this@DriveTestForegroundService,
                            e.message ?: "Unknown transport error"
                        )

                        AppStatusStore.appendPayloadLog(
                            this@DriveTestForegroundService,
                            "seq=$seq | EXCEPTION | $payloadJson"
                        )

                        Log.d(TAG, "exception during send, writing locally")
                        localJsonlWriter.appendLine(payloadJson)
                    }
                } else {
                    Log.d(TAG, "sample was null")
                }

                delay(SAMPLE_INTERVAL_MS)
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        Log.d(TAG, "Service being destroyed")

        workerJob?.cancel()
        workerJob = null

        AppStatusStore.setServiceRunning(this, false)

        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Drive Test Collector")
            .setContentText("Collecting radio metrics")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Drive Test Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}