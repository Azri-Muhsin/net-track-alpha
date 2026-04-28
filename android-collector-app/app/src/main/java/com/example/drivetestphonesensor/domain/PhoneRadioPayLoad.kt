import kotlinx.serialization.Serializable

@Serializable
data class PhoneRadioPayload(
    val ts_device: String,
    val phone_id: String,
    val run_id: String,
    val seq: Long,
    val rat: String,
    val rsrp_dbm: Int? = null,
    val rsrq_db: Int? = null,
    val sinr_db: Int? = null,
    val cell_id: String? = null,
    val pci: Int? = null,
    val earfcn: Int? = null,
    val band: String? = null,
    val source: String = "android_public_api"
)