package com.example.drivetestphonesensor

import android.Manifest
import android.content.Intent
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.method.ScrollingMovementMethod
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import com.example.drivetestphonesensor.service.DriveTestForegroundService

class MainActivity : ComponentActivity() {

    private lateinit var statusText: TextView
    private lateinit var diagnosticsText: TextView
    private lateinit var payloadLogText: TextView

    private val handler = Handler(Looper.getMainLooper())

    private val refreshRunnable = object : Runnable {
        override fun run() {
            refreshStatus()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestNeededPermissions()

        val titleText = TextView(this).apply {
            text = "Drive Test Collector"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
        }

        val subtitleText = TextView(this).apply {
            text = "Collect LTE radio metrics and view payloads live."
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(24))
        }

        statusText = TextView(this).apply {
            text = "Status: Ready"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 0, 0, dp(20))
            gravity = Gravity.CENTER
        }

        val startButton = Button(this).apply {
            text = "Start Drive Test"
            textSize = 18f
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                AppStatusStore.reset(this@MainActivity)
                val intent = Intent(this@MainActivity, DriveTestForegroundService::class.java)
                startForegroundService(intent)
                statusText.text = "Status: Starting..."
            }
        }

        val stopButton = Button(this).apply {
            text = "Stop Drive Test"
            textSize = 18f
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                val intent = Intent(this@MainActivity, DriveTestForegroundService::class.java)
                stopService(intent)
                AppStatusStore.setServiceRunning(this@MainActivity, false)
                statusText.text = "Status: Stopped"
            }
        }

        val clearLogButton = Button(this).apply {
            text = "Clear Payload Log"
            textSize = 16f
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                AppStatusStore.clearPayloadLog(this@MainActivity)
                refreshStatus()
            }
        }

        diagnosticsText = TextView(this).apply {
            text = """
                Service running: -
                Run ID: -
                Last seq: 0
                Last sample: -
                Sent count: 0
                Failed count: 0
                Last HTTP code: -
                Last error: -
            """.trimIndent()
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }

        val payloadTitleText = TextView(this).apply {
            text = "Payload Log"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, dp(20), 0, dp(8))
        }

        payloadLogText = TextView(this).apply {
            text = "No payloads yet."
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setPadding(dp(16), dp(16), dp(16), dp(16))
            movementMethod = ScrollingMovementMethod()
            minLines = 16
            setHorizontallyScrolling(true)
        }

        val infoText = TextView(this).apply {
            text = "Make sure the phone and receiver are on the same reachable network."
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, 0)
        }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(40), dp(24), dp(24))

            addView(
                titleText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            addView(
                subtitleText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            addView(
                statusText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            addView(
                startButton,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(12)
                }
            )

            addView(
                stopButton,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(12)
                }
            )

            addView(
                clearLogButton,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            addView(
                diagnosticsText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dp(20)
                }
            )

            addView(
                payloadTitleText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            addView(
                payloadLogText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            addView(
                infoText,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )
        }

        val scrollView = ScrollView(this).apply {
            addView(layout)
        }

        setContentView(scrollView)
    }

    override fun onResume() {
        super.onResume()
        handler.post(refreshRunnable)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(refreshRunnable)
    }

    private fun refreshStatus() {
        val snapshot = AppStatusStore.read(this)

        statusText.text = when {
            snapshot.serviceRunning -> "Status: Running"
            snapshot.sentCount > 0 || snapshot.failedCount > 0 -> "Status: Idle"
            else -> "Status: Ready"
        }

        diagnosticsText.text = """
            Service running: ${snapshot.serviceRunning}
            Run ID: ${snapshot.runId.ifBlank { "-" }}
            Last seq: ${snapshot.lastSeq}
            Last sample: ${snapshot.lastSampleTs.ifBlank { "-" }}
            Sent count: ${snapshot.sentCount}
            Failed count: ${snapshot.failedCount}
            Last HTTP code: ${if (snapshot.lastHttpCode == 0) "-" else snapshot.lastHttpCode}
            Last error: ${snapshot.lastError.ifBlank { "-" }}
        """.trimIndent()

        payloadLogText.text = if (snapshot.payloadLog.isBlank()) {
            "No payloads yet."
        } else {
            snapshot.payloadLog
        }
    }

    private fun requestNeededPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 100)
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }
}