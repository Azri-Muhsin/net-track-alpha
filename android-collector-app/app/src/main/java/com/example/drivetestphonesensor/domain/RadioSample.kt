package com.example.drivetestphonesensor.domain

data class RadioSample(
    val tsDevice: String,
    val phoneId: String,
    val seq: Long,
    val rat: String,
    val rsrpDbm: Int? = null,
    val rsrqDb: Int? = null,
    val sinrDb: Int? = null,
    val cellId: String? = null,
    val pci: Int? = null,
    val earfcn: Int? = null,
    val band: String? = null,
    val source: String = "android_public_api"
)