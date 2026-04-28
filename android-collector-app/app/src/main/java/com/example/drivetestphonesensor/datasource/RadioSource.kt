package com.example.drivetestphonesensor.datasource

import com.example.drivetestphonesensor.domain.RadioSample

interface RadioSource {
    suspend fun readSample(seq: Long): RadioSample?
}