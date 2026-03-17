#include <WiFi.h>
#include <WiFiUdp.h>

const char* ssid = "Dialog 4G 219";
const char* password = "1552A1EF";

WiFiUDP udp;
const int udpPort = 4210;

char incomingPacket[255];

void setup() {

  Serial.begin(115200);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("Connected to WiFi");

  udp.begin(udpPort);

  Serial.println("Listening for GeoJSON data...");
}

void loop() {

  int packetSize = udp.parsePacket();

  if (packetSize) {

    int len = udp.read(incomingPacket, 255);

    if (len > 0) {
      incomingPacket[len] = 0;
    }

    Serial.println("Received GeoJSON:");
    Serial.println(incomingPacket);
    Serial.println("----------------------");
  }
}
