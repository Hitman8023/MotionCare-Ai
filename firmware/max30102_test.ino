#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

MAX30105 particleSensor;

static const int SAMPLE_COUNT = 100;
static const uint32_t FINGER_IR_THRESHOLD = 10000;

uint32_t irBuffer[SAMPLE_COUNT];
uint32_t redBuffer[SAMPLE_COUNT];

void scanI2CBus() {
  Serial.println("Scanning I2C bus...");
  int found = 0;

  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at 0x");
      if (address < 16) Serial.print('0');
      Serial.println(address, HEX);
      found++;
    }
  }

  if (found == 0) {
    Serial.println("No I2C devices found");
  }
}

bool readSamples(uint32_t* red, uint32_t* ir, int count, uint32_t timeoutMs) {
  uint32_t start = millis();
  int i = 0;

  while (i < count) {
    // safeCheck waits briefly for new FIFO data and is more stable on ESP32.
    if (particleSensor.safeCheck(250)) {
      while (particleSensor.available() && i < count) {
        red[i] = particleSensor.getRed();
        ir[i] = particleSensor.getIR();
        particleSensor.nextSample();
        i++;
      }
    } else {
      delay(2);
    }

    if (millis() - start > timeoutMs) {
      return false;
    }
  }

  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  unsigned long serialWaitStart = millis();
  while (!Serial && millis() - serialWaitStart < 1500) {
    delay(10);
  }

  Serial.println("\nBooting MAX30102 test sketch...");

  // ESP32 default I2C pins
  Wire.begin(21, 22);
  Wire.setClock(100000);
  scanI2CBus();

  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102 not found. Check wiring and power.");
    while (true) {
      delay(1000);
    }
  }

  Serial.print("MAX30102 Part ID: 0x");
  Serial.println(particleSensor.readPartID(), HEX);

  // Good baseline settings for MAX30102 + maxim algorithm
  particleSensor.setup(
    0x2A,   // LED brightness
    8,      // sample average
    2,      // LED mode: red + IR
    100,    // sample rate
    411,    // pulse width
    16384   // ADC range
  );

  particleSensor.setPulseAmplitudeRed(0x2A);
  particleSensor.setPulseAmplitudeIR(0x2A);
  particleSensor.setPulseAmplitudeGreen(0x00);
  particleSensor.clearFIFO();
  delay(200);

  Serial.println("MAX30102 test started");
  Serial.println("Place finger steadily on sensor...");
}

void loop() {
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 3000) {
    Serial.println("[alive] loop running");
    lastHeartbeat = millis();
  }

  if (!readSamples(redBuffer, irBuffer, SAMPLE_COUNT, 12000)) {
    Serial.println("Sample timeout - check SDA/SCL, power, and finger contact");
    delay(500);
    return;
  }

  uint64_t irSum = 0;
  uint64_t redSum = 0;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    irSum += irBuffer[i];
    redSum += redBuffer[i];
  }

  uint32_t irAvg = (uint32_t)(irSum / SAMPLE_COUNT);
  uint32_t redAvg = (uint32_t)(redSum / SAMPLE_COUNT);

  Serial.print("IR avg=");
  Serial.print(irAvg);
  Serial.print(" | RED avg=");
  Serial.println(redAvg);

  if (irAvg < FINGER_IR_THRESHOLD) {
    Serial.println("No finger detected or weak contact");
    Serial.println("------------------------------------");
    delay(700);
    return;
  }

  int32_t heartRate = 0;
  int32_t spo2 = 0;
  int8_t validHeartRate = 0;
  int8_t validSpo2 = 0;

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer,
    SAMPLE_COUNT,
    redBuffer,
    &spo2,
    &validSpo2,
    &heartRate,
    &validHeartRate
  );

  Serial.print("HR=");
  Serial.print(heartRate);
  Serial.print(" (valid=");
  Serial.print(validHeartRate);
  Serial.print(") | SpO2=");
  Serial.print(spo2);
  Serial.print(" (valid=");
  Serial.print(validSpo2);
  Serial.println(")");
  Serial.println("------------------------------------");

  delay(700);
}
