#include <WiFi.h>
#include <WiFiUdp.h>
#include <TinyGPSPlus.h>

TinyGPSPlus gps;

#define gpsSerial Serial2

const char* ssid = "Dialog 4G 219";
const char* password = "1552A1EF";

WiFiUDP udp;
const char* udpAddress = "255.255.255.255"; 
const int udpPort = 4210;

// GPS timestamp
String getTimestamp() {
  if (gps.date.isValid() && gps.time.isValid()) {
    char buffer[30];
    sprintf(buffer, "%04d-%02d-%02dT%02d:%02d:%02dZ",
            gps.date.year(),
            gps.date.month(),
            gps.date.day(),
            gps.time.hour(),
            gps.time.minute(),
            gps.time.second());
    return String(buffer);
  }
  return "invalid";
}

void setup() {

  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);

  Serial.print("Connecting to WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  udp.begin(udpPort);
}

void loop() {

  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  if (gps.location.isUpdated()) {

    if (!gps.location.isValid()) {
      Serial.println("Waiting for GPS fix...");
      return;
    }

    double lat = gps.location.lat();
    double lon = gps.location.lng();
    String timestamp = getTimestamp();

    // GeoJSON
    String geoJSON = "{";
    geoJSON += "\"type\":\"Feature\",";
    geoJSON += "\"timestamp\":\"" + timestamp + "\",";
    geoJSON += "\"geometry\":{";
    geoJSON += "\"type\":\"Point\",";
    geoJSON += "\"coordinates\":[" + String(lon,6) + "," + String(lat,6) + "]";
    geoJSON += "}";
    geoJSON += "}";

    // Send via UDP
    udp.beginPacket(udpAddress, udpPort);
    udp.print(geoJSON);
    udp.endPacket();

    Serial.println("Sent:");
    Serial.println(geoJSON);
    Serial.println("----------------------");
  }

  delay(2000);
}







