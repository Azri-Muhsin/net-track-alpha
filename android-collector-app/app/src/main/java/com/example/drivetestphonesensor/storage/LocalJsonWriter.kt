package com.example.drivetestphonesensor.storage

import android.content.Context
import android.util.Log
import java.io.File

class LocalJsonlWriter(
    private val context: Context
) {
    private val fileName = "radio_samples.jsonl"

    fun appendLine(line: String) {
        try {
            val file = File(context.filesDir, fileName)
            file.appendText(line + "\n")
            Log.d("DriveTest", "saved_to_file=${file.absolutePath}")
        } catch (e: Exception) {
            Log.e("DriveTest", "Failed to write JSONL file", e)
        }
    }
}
