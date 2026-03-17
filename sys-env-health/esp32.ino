#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ========== WiFi Configuration ==========
const char* ssid = "Redmi Note 13 Pro+ 5G";
const char* wifi_password = "12345678";

// ========== HiveMQ Cloud Configuration ==========
const char* mqtt_server = "c05bd622cba6488c9c587779fd02a8fa.s1.eu.hivemq.cloud"; 
const char* mqtt_username = "esp32_123";         
const char* mqtt_password = "Esp32@123";        
const int mqtt_port = 8883;                                

// ========== MQTT Topic ==========
const char* mqtt_topic = "netrack/sensor/data";

// ========== Sensor Pins ==========
const int ky028_AO = 34;      // KY-028 analog output
const int ky028_DO = 35;      // KY-028 digital output

// ========== Sensor Objects ==========
Adafruit_MPU6050 mpu;
WiFiClientSecure espClient;
PubSubClient mqtt_client(espClient);

// ========== Temperature Calculation Constants ==========
const float V_REF = 3.3;
const float R_FIXED = 100000.0;   // 100k fixed resistor
const float BETA = 3950.0;        // Beta coefficient
const float T0_KELVIN = 298.15;   // 25°C in Kelvin
const float R0 = 10000.0;         // Thermistor resistance at 25°C (10k)

// ========== HiveMQ Cloud Let's Encrypt Root CA Certificate ==========
static const char* root_ca PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

// ========== Motion Detection Variables ==========
float prevAccelMagnitude = 0;
const float MOTION_THRESHOLD = 0.5;

// ========== Function Prototypes ==========
void setup_wifi();
void connect_to_mqtt();
float read_ky028_temperature();
float calculate_accel_magnitude(sensors_event_t* a);
String create_json_payload(float mpu_temp, float ky_temp, int raw_analog, 
                           bool motion, float accel_x, float accel_y, float accel_z);

// ========== Setup ==========
void setup() {
  Serial.begin(115200);
  //while (!Serial) delay(10);
  
  Serial.println("\n\n=== Netrack IoT Sensor System ===");
  
  // Initialize MPU6050
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip!");
    while (1) delay(10);
  }
  Serial.println("MPU6050 initialized");
  
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  
  // Configure sensor pins
  pinMode(ky028_AO, INPUT);
  pinMode(ky028_DO, INPUT);
  
  // Setup WiFi and MQTT
  setup_wifi();
  
  // Set root CA certificate for secure connection [citation:8]
  espClient.setCACert(root_ca);
  
  // Configure MQTT
  mqtt_client.setServer(mqtt_server, mqtt_port);
  mqtt_client.setCallback(callback);
}

// ========== WiFi Setup ==========
void setup_wifi() {
  delay(10);
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, wifi_password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ WiFi connection failed!");
    Serial.print("Status code: ");
    Serial.println(WiFi.status());  // Prints the reason
  }
}

// ========== MQTT Callback (for receiving messages) ==========
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message received [");
  Serial.print(topic);
  Serial.print("]: ");
  
  for (int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();
}

// ========== Connect/Reconnect to MQTT Broker ==========
void connect_to_mqtt() {
  // Loop until reconnected
  while (!mqtt_client.connected()) {
    Serial.print("Connecting to HiveMQ Cloud...");
    
    // Create a unique client ID
    String client_id = "esp32-netrack-" + String(WiFi.macAddress());
    
    // Attempt to connect with credentials [citation:8]
    if (mqtt_client.connect(client_id.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("✅ Connected to HiveMQ Cloud!");
      
      // Subscribe to a topic if you want to receive commands (optional)
      // mqtt_client.subscribe("netrack/control");
      
    } else {
      Serial.print("❌ Failed, rc=");
      Serial.print(mqtt_client.state());
      Serial.println(" Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

// ========== Read KY-028 Temperature ==========
float read_ky028_temperature() {
  int analogVal = analogRead(ky028_AO);
  float voltage = analogVal * (V_REF / 4095.0);
  
  // Avoid division by zero or very small voltage
  if (voltage < 0.01) return -999.0;
  
  // Alternative formula (thermistor to GND)
  float resistance = R_FIXED / (V_REF / voltage - 1.0);
  
  // Beta equation
  float steinhart;
  steinhart = resistance / R0;                // (R/Ro)
  steinhart = log(steinhart);                  // ln(R/Ro)
  steinhart /= BETA;                            // 1/B * ln(R/Ro)
  steinhart += 1.0 / T0_KELVIN;                  // + (1/To)
  steinhart = 1.0 / steinhart;                   // Invert
  return steinhart - 273.15;                     // Kelvin to Celsius
}

// ========== Calculate Acceleration Magnitude ==========
float calculate_accel_magnitude(sensors_event_t* a) {
  return sqrt(sq(a->acceleration.x) + sq(a->acceleration.y) + sq(a->acceleration.z));
}

// ========== Create JSON Payload ==========
String create_json_payload(float mpu_temp, float ky_temp, int raw_analog, 
                           bool motion, float accel_x, float accel_y, float accel_z) {
  StaticJsonDocument<256> doc;
  
  // Add timestamp (milliseconds since boot - you can replace with actual time)
  doc["timestamp"] = millis();
  
  // Add device info
  doc["device_id"] = WiFi.macAddress();
  
  // Add sensor readings
  doc["mpu6050_temp"] = mpu_temp;
  doc["ky028_temp"] = ky_temp;
  doc["ky028_raw"] = raw_analog;
  doc["motion_detected"] = motion;
  
  // Add acceleration data
  JsonObject accel = doc.createNestedObject("acceleration");
  accel["x"] = accel_x;
  accel["y"] = accel_y;
  accel["z"] = accel_z;
  
  // Add digital state
  doc["digital_state"] = digitalRead(ky028_DO) ? "below_threshold" : "above_threshold";
  
  String jsonString;
  serializeJson(doc, jsonString);
  return jsonString;
}

// ========== Main Loop ==========
void loop() {
  // Ensure MQTT connection
  if (!mqtt_client.connected()) {
    connect_to_mqtt();
  }
  mqtt_client.loop();
  
  // === Read MPU6050 ===
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  
  // === Calculate motion ===
  float accelMagnitude = calculate_accel_magnitude(&a);
  bool motionDetected = false;
  if (prevAccelMagnitude != 0) {
    float change = abs(accelMagnitude - prevAccelMagnitude);
    if (change > MOTION_THRESHOLD) {
      motionDetected = true;
    }
  }
  prevAccelMagnitude = accelMagnitude;
  
  // === Read KY-028 ===
  int analogVal = analogRead(ky028_AO);
  float ky028_temp = read_ky028_temperature();
  
  // === Create JSON payload ===
  String payload = create_json_payload(
    temp.temperature, 
    ky028_temp, 
    analogVal,
    motionDetected,
    a.acceleration.x,
    a.acceleration.y,
    a.acceleration.z
  );
  
  // === Publish to HiveMQ ===
  if (mqtt_client.publish(mqtt_topic, payload.c_str())) {
    Serial.println("✅ Data published successfully:");
    Serial.println(payload);
  } else {
    Serial.println("❌ Failed to publish data");
  }
  
  // === Also print to Serial Monitor for debugging ===
  Serial.println("\n--- Local Sensor Readings ---");
  Serial.print("MPU6050 Temp: "); Serial.print(temp.temperature); Serial.println(" °C");
  Serial.print("KY-028 Temp: "); Serial.print(ky028_temp, 1); Serial.println(" °C");
  Serial.print("KY-028 Raw: "); Serial.println(analogVal);
  Serial.print("Motion: "); Serial.println(motionDetected ? "YES" : "NO");
  Serial.println("-----------------------------\n");
  
  // Wait before next reading (adjust as needed)
  delay(1000); // Publish every 5 seconds
}
