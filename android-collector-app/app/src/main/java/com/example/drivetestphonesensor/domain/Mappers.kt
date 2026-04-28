package com.example.drivetestphonesensor.domain

import PhoneRadioPayload

fun RadioSample.toPayload(runId: String): PhoneRadioPayload {
    return PhoneRadioPayload(
        ts_device = tsDevice.toString(),
        phone_id = phoneId,
        run_id = runId,
        seq = seq,
        rat = rat,
        rsrp_dbm = rsrpDbm,
        rsrq_db = rsrqDb,
        sinr_db = sinrDb,
        cell_id = cellId,
        pci = pci,
        earfcn = earfcn,
        band = band,
        source = source
    )
}