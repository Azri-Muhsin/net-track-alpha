package com.example.drivetestphonesensor.datasource

import android.content.Context
import android.os.Build
import android.telephony.CellIdentityNr
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.CellSignalStrengthNr
import android.telephony.TelephonyManager
import android.util.Log
import com.example.drivetestphonesensor.domain.RadioSample
import java.time.Instant

class AndroidTelephonyRadioSource(
    context: Context,
    private val phoneId: String
) : RadioSource {

    private val telephonyManager =
        context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

    override suspend fun readSample(seq: Long): RadioSample? {
        val ts = Instant.now().toString()

        val allCells = try {
            telephonyManager.allCellInfo
        } catch (e: SecurityException) {
            Log.e("DriveTest", "SecurityException reading allCellInfo", e)
            return null
        } catch (e: Exception) {
            Log.e("DriveTest", "Exception reading allCellInfo", e)
            return null
        }

        if (allCells == null) {
            Log.d("DriveTest", "allCellInfo is null")
            return null
        }

        Log.d("DriveTest", "allCellInfo size=${allCells.size}")

        allCells.forEachIndexed { index, cell ->
            Log.d(
                "DriveTest",
                "cell[$index]=${cell.javaClass.simpleName}, registered=${cell.isRegistered}"
            )
        }

        val registeredCells = allCells.filter { it.isRegistered }

        val servingCell =
            registeredCells.firstOrNull { it is CellInfoNr }
                ?: registeredCells.firstOrNull { it is CellInfoLte }
                ?: registeredCells.firstOrNull { it is CellInfoWcdma }
                ?: registeredCells.firstOrNull { it is CellInfoGsm }

        if (servingCell == null) {
            Log.d("DriveTest", "No registered serving cell found")
            return null
        }

        return when (servingCell) {
            is CellInfoLte -> {
                val identity = servingCell.cellIdentity
                val signal = servingCell.cellSignalStrength

                Log.d("DriveTest", "Serving LTE cell detected")

                RadioSample(
                    tsDevice = ts,
                    phoneId = phoneId,
                    seq = seq,
                    rat = "LTE",
                    rsrpDbm = signal.rsrp,
                    rsrqDb = signal.rsrq,
                    sinrDb = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) signal.rssnr else null,
                    cellId = identity.ci.takeIf { it != Int.MAX_VALUE }?.toString(),
                    pci = identity.pci.takeIf { it != Int.MAX_VALUE },
                    earfcn = identity.earfcn.takeIf { it != Int.MAX_VALUE },
                    band = null,
                    source = "android_public_api"
                )
            }

            is CellInfoNr -> {
                val identity = servingCell.cellIdentity as? CellIdentityNr
                val signal = servingCell.cellSignalStrength as? CellSignalStrengthNr

                Log.d("DriveTest", "Serving NR cell detected")

                RadioSample(
                    tsDevice = ts,
                    phoneId = phoneId,
                    seq = seq,
                    rat = "NR",
                    rsrpDbm = signal?.ssRsrp,
                    rsrqDb = signal?.ssRsrq,
                    sinrDb = signal?.ssSinr,
                    cellId = identity?.nci?.toString(),
                    pci = identity?.pci,
                    earfcn = identity?.nrarfcn,
                    band = null,
                    source = "android_public_api"
                )
            }

            is CellInfoGsm -> {
                val identity = servingCell.cellIdentity

                Log.d("DriveTest", "Serving GSM cell detected")

                RadioSample(
                    tsDevice = ts,
                    phoneId = phoneId,
                    seq = seq,
                    rat = "GSM",
                    cellId = identity.cid.takeIf { it != Int.MAX_VALUE }?.toString(),
                    source = "android_public_api"
                )
            }

            is CellInfoWcdma -> {
                val identity = servingCell.cellIdentity

                Log.d("DriveTest", "Serving WCDMA cell detected")

                RadioSample(
                    tsDevice = ts,
                    phoneId = phoneId,
                    seq = seq,
                    rat = "WCDMA",
                    cellId = identity.cid.takeIf { it != Int.MAX_VALUE }?.toString(),
                    source = "android_public_api"
                )
            }

            else -> {
                Log.d("DriveTest", "Unhandled registered cell type=${servingCell.javaClass.simpleName}")

                RadioSample(
                    tsDevice = ts,
                    phoneId = phoneId,
                    seq = seq,
                    rat = servingCell.javaClass.simpleName.removePrefix("CellInfo"),
                    source = "android_public_api"
                )
            }
        }
    }
}