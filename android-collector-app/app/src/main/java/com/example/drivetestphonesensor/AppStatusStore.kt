package com.example.drivetestphonesensor

import android.content.Context

object AppStatusStore {
    private const val PREFS_NAME = "drive_test_status"

    private const val KEY_SERVICE_RUNNING = "service_running"
    private const val KEY_LAST_SAMPLE_TS = "last_sample_ts"
    private const val KEY_SENT_COUNT = "sent_count"
    private const val KEY_FAILED_COUNT = "failed_count"
    private const val KEY_LAST_HTTP_CODE = "last_http_code"
    private const val KEY_LAST_ERROR = "last_error"

    private const val KEY_RUN_ID = "run_id"
    private const val KEY_LAST_SEQ = "last_seq"
    private const val KEY_PAYLOAD_LOG = "payload_log"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun reset(context: Context) {
        prefs(context).edit()
            .putBoolean(KEY_SERVICE_RUNNING, false)
            .putString(KEY_LAST_SAMPLE_TS, "")
            .putInt(KEY_SENT_COUNT, 0)
            .putInt(KEY_FAILED_COUNT, 0)
            .putInt(KEY_LAST_HTTP_CODE, 0)
            .putString(KEY_LAST_ERROR, "")
            .putString(KEY_RUN_ID, "")
            .putLong(KEY_LAST_SEQ, 0L)
            .putString(KEY_PAYLOAD_LOG, "")
            .apply()
    }

    fun setServiceRunning(context: Context, running: Boolean) {
        prefs(context).edit().putBoolean(KEY_SERVICE_RUNNING, running).apply()
    }

    fun setLastSampleTs(context: Context, ts: String) {
        prefs(context).edit().putString(KEY_LAST_SAMPLE_TS, ts).apply()
    }

    fun incrementSentCount(context: Context) {
        val p = prefs(context)
        val current = p.getInt(KEY_SENT_COUNT, 0)
        p.edit().putInt(KEY_SENT_COUNT, current + 1).apply()
    }

    fun incrementFailedCount(context: Context) {
        val p = prefs(context)
        val current = p.getInt(KEY_FAILED_COUNT, 0)
        p.edit().putInt(KEY_FAILED_COUNT, current + 1).apply()
    }

    fun setLastHttpCode(context: Context, code: Int) {
        prefs(context).edit().putInt(KEY_LAST_HTTP_CODE, code).apply()
    }

    fun setLastError(context: Context, error: String?) {
        prefs(context).edit().putString(KEY_LAST_ERROR, error ?: "").apply()
    }

    fun setRunId(context: Context, runId: String) {
        prefs(context).edit().putString(KEY_RUN_ID, runId).apply()
    }

    fun setLastSeq(context: Context, seq: Long) {
        prefs(context).edit().putLong(KEY_LAST_SEQ, seq).apply()
    }

    fun appendPayloadLog(context: Context, line: String, maxLines: Int = 100) {
        val p = prefs(context)
        val existing = p.getString(KEY_PAYLOAD_LOG, "") ?: ""

        val updatedLines = (existing.lines().filter { it.isNotBlank() } + line)
            .takeLast(maxLines)

        p.edit()
            .putString(KEY_PAYLOAD_LOG, updatedLines.joinToString("\n\n"))
            .apply()
    }

    fun clearPayloadLog(context: Context) {
        prefs(context).edit().putString(KEY_PAYLOAD_LOG, "").apply()
    }

    data class Snapshot(
        val serviceRunning: Boolean,
        val lastSampleTs: String,
        val sentCount: Int,
        val failedCount: Int,
        val lastHttpCode: Int,
        val lastError: String,
        val runId: String,
        val lastSeq: Long,
        val payloadLog: String
    )

    fun read(context: Context): Snapshot {
        val p = prefs(context)
        return Snapshot(
            serviceRunning = p.getBoolean(KEY_SERVICE_RUNNING, false),
            lastSampleTs = p.getString(KEY_LAST_SAMPLE_TS, "") ?: "",
            sentCount = p.getInt(KEY_SENT_COUNT, 0),
            failedCount = p.getInt(KEY_FAILED_COUNT, 0),
            lastHttpCode = p.getInt(KEY_LAST_HTTP_CODE, 0),
            lastError = p.getString(KEY_LAST_ERROR, "") ?: "",
            runId = p.getString(KEY_RUN_ID, "") ?: "",
            lastSeq = p.getLong(KEY_LAST_SEQ, 0L),
            payloadLog = p.getString(KEY_PAYLOAD_LOG, "") ?: ""
        )
    }
}