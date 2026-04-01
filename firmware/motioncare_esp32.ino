#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <MPU6050_tockn.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <time.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

// ============================
// WIFI / RTDB
// ============================
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define RTDB_BASE     "https://motioncare-f84e0-default-rtdb.asia-southeast1.firebasedatabase.app"
#define LM35_PIN      34

// ============================
// TIMING
// ============================
const unsigned long GYRO_SAMPLE_INTERVAL = 10;    // 100 Hz
const unsigned long GYRO_UPLOAD_INTERVAL = 80;    // cloud motion upload
const unsigned long FORCE_UPLOAD_MS      = 300;   // force motion heartbeat
const unsigned long HEALTH_INTERVAL      = 3000;  // HR/SpO2/Temp upload
const unsigned long UID_FETCH_INTERVAL   = 2000;  // active uid refresh

const float MOTION_DELTA_MIN = 0.7f;              // change threshold

// ============================
// SENSORS
// ============================
MPU6050 mpu6050(Wire);
MAX30105 particleSensor;

// ============================
// GLOBAL DATA
// ============================
volatile int32_t g_heartRate = 75;
volatile int32_t g_spo2      = 98;

unsigned long lastGyroSample   = 0;
unsigned long lastGyroUpload   = 0;
unsigned long lastForcedUpload = 0;
unsigned long lastHealthSend   = 0;
unsigned long lastUidFetch     = 0;
unsigned long lastUidWarnTime  = 0;
unsigned long lastMotionOkLog  = 0;
unsigned long lastHealthOkLog  = 0;

String cachedUid = "";

// Latest sampled values
float curAccX  = 0, curAccY  = 0, curAccZ  = 0;
float curGyroX = 0, curGyroY = 0, curGyroZ = 0;

// Last uploaded values
float sentAccX  = 0, sentAccY  = 0, sentAccZ  = 0;
float sentGyroX = 0, sentGyroY = 0, sentGyroZ = 0;
bool hasUploadedMotion = false;
volatile bool g_maxReadInProgress = false;

// Debug logs for step-by-step Firebase verification.
const bool DEBUG_UPLOADS = true;

// I2C protection between loop() and maxTask()
SemaphoreHandle_t i2cMutex = nullptr;

// ============================
// HELPERS
// ============================
String isoTimestamp() {
  time_t now = time(nullptr);
  if (now < 100000) return String(millis()); // fallback before NTP sync

  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);

  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("Connecting WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connect failed");
  }
}

bool httpPatch(const String &url, const String &json) {
  static WiFiClientSecure client;
  static bool tlsInit = false;

  if (!tlsInit) {
    client.setInsecure();
    client.setTimeout(5000);
    tlsInit = true;
  }

  HTTPClient http;
  http.setTimeout(5000);
  http.setReuse(true);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest("PATCH", json);
  String resp = http.getString();
  http.end();

  if (code < 200 || code >= 300) {
    Serial.print("PATCH failed code=");
    Serial.print(code);
    Serial.print(" body=");
    Serial.println(resp);
    return false;
  }

  return true;
}

String httpGetBody(const String &url) {
  if (WiFi.status() != WL_CONNECTED) return "";

  static WiFiClientSecure client;
  static bool tlsInit = false;

  if (!tlsInit) {
    client.setInsecure();
    client.setTimeout(5000);
    tlsInit = true;
  }

  HTTPClient http;
  http.setTimeout(5000);
  http.setReuse(true);

  if (!http.begin(client, url)) return "";

  int code = http.GET();
  if (code <= 0) {
    http.end();
    return "";
  }

  String body = http.getString();
  http.end();
  return body;
}

String extractUidFromJson(String body) {
  body.trim();
  if (body.length() == 0 || body == "null" || body == "NULL") return "";

  // Case 1: plain string JSON: "abc123"
  if (body.startsWith("\"") && body.endsWith("\"")) {
    body.replace("\"", "");
    body.trim();
    return body;
  }

  // Case 2: object JSON: {"uid":"abc123"}
  int k = body.indexOf("\"uid\"");
  if (k >= 0) {
    int c = body.indexOf(':', k);
    int q1 = body.indexOf('"', c + 1);
    int q2 = body.indexOf('"', q1 + 1);
    if (q1 >= 0 && q2 > q1) {
      return body.substring(q1 + 1, q2);
    }
  }

  return "";
}

String getActiveUid() {
  // Preferred path
  String body = httpGetBody(String(RTDB_BASE) + "/active_uid/uid.json");
  String uid = extractUidFromJson(body);
  if (uid.length() > 0) return uid;

  // Fallback path
  body = httpGetBody(String(RTDB_BASE) + "/active_uid.json");
  uid = extractUidFromJson(body);
  return uid;
}

bool shouldUploadMotion(unsigned long nowMs) {
  if (!hasUploadedMotion) return true;

  float d1 = fabsf(curAccX  - sentAccX);
  float d2 = fabsf(curAccY  - sentAccY);
  float d3 = fabsf(curAccZ  - sentAccZ);
  float d4 = fabsf(curGyroX - sentGyroX);
  float d5 = fabsf(curGyroY - sentGyroY);
  float d6 = fabsf(curGyroZ - sentGyroZ);

  bool changed = (d1 >= MOTION_DELTA_MIN) || (d2 >= MOTION_DELTA_MIN) || (d3 >= MOTION_DELTA_MIN) ||
                 (d4 >= MOTION_DELTA_MIN) || (d5 >= MOTION_DELTA_MIN) || (d6 >= MOTION_DELTA_MIN);

  bool forced = (nowMs - lastForcedUpload) >= FORCE_UPLOAD_MS;
  return changed || forced;
}

void debugLogUpload(const String &tag, const String &uid, const String &path, const String &payload) {
  if (!DEBUG_UPLOADS) return;
  Serial.println("---------------- UPLOAD DEBUG ----------------");
  Serial.println("TAG: " + tag);
  Serial.println("UID: " + uid);
  Serial.println("PATH: " + path);
  Serial.println("PAYLOAD: " + payload);
  Serial.println("---------------------------------------------");
}

bool readMaxSamples(uint32_t *redBuf, uint32_t *irBuf, int n, uint32_t timeoutMs = 12000) {
  uint32_t started = millis();
  int i = 0;
  g_maxReadInProgress = true;

  while (i < n) {
    int samplesReadThisPass = 0;

    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(30)) == pdTRUE) {
      particleSensor.check();

      // Drain all currently available samples in one lock window.
      while (particleSensor.available() && i < n) {
        redBuf[i] = particleSensor.getRed();
        irBuf[i]  = particleSensor.getIR();
        particleSensor.nextSample();
        i++;
        samplesReadThisPass++;
      }

      xSemaphoreGive(i2cMutex);
    }

    if (samplesReadThisPass == 0) {
      vTaskDelay(pdMS_TO_TICKS(1));
    }

    if (millis() - started > timeoutMs) {
      g_maxReadInProgress = false;
      return false;
    }
  }

  g_maxReadInProgress = false;
  return true;
}

// ============================
// MAX TASK (HR + SpO2)
// ============================
void maxTask(void *pvParameters) {
  const int N = 100;
  const uint32_t FINGER_IR_THRESHOLD = 15000;

  uint32_t irBuf[N];
  uint32_t redBuf[N];
  unsigned long lastCalcMs = 0;

  for (;;) {
    if (millis() - lastCalcMs < 3000) {
      vTaskDelay(pdMS_TO_TICKS(20));
      continue;
    }

    if (!readMaxSamples(redBuf, irBuf, N)) {
      Serial.println("MAX30102 sample timeout");
      lastCalcMs = millis();
      continue;
    }

    uint64_t irSum = 0;
    for (int i = 0; i < N; i++) irSum += irBuf[i];
    uint32_t irAvg = (uint32_t)(irSum / N);

    Serial.print("IR avg=");
    Serial.println(irAvg);

    if (irAvg < FINGER_IR_THRESHOLD) {
      Serial.println("Place finger properly on MAX30102");
      lastCalcMs = millis();
      continue;
    }

    int32_t hr = 0, sp = 0;
    int8_t vhr = 0, vsp = 0;

    maxim_heart_rate_and_oxygen_saturation(irBuf, N, redBuf, &sp, &vsp, &hr, &vhr);

    if (vhr == 1 && hr > 40 && hr < 200) g_heartRate = hr;
    if (vsp == 1 && sp > 85 && sp <= 100) g_spo2 = sp;

    Serial.print("HR=");
    Serial.print(g_heartRate);
    Serial.print(" SpO2=");
    Serial.print(g_spo2);
    Serial.print(" valid(HR,SpO2)=");
    Serial.print(vhr);
    Serial.print(",");
    Serial.println(vsp);

    lastCalcMs = millis();
  }
}

// ============================
// SETUP
// ============================
void setup() {
  Serial.begin(115200);
  delay(200);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  connectWiFi();
  WiFi.setTxPower(WIFI_POWER_8_5dBm);

  configTime(0, 19800, "pool.ntp.org", "time.nist.gov");
  analogReadResolution(12);

  Wire.begin(21, 22);
  // 100kHz is more stable for many MAX30102 breakout boards on longer wires.
  Wire.setClock(100000);

  i2cMutex = xSemaphoreCreateMutex();
  if (i2cMutex == nullptr) {
    Serial.println("Failed to create I2C mutex");
    while (1) delay(1000);
  }

  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    mpu6050.begin();
    mpu6050.calcGyroOffsets(true);
    xSemaphoreGive(i2cMutex);
  }

  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
      xSemaphoreGive(i2cMutex);
      Serial.println("MAX30102 not found");
      while (1) delay(1000);
    }

    particleSensor.setup(0x24, 2, 2, 100, 411, 16384);
    particleSensor.setPulseAmplitudeRed(0x24);
    particleSensor.setPulseAmplitudeIR(0x24);
    particleSensor.setPulseAmplitudeGreen(0x00);
    xSemaphoreGive(i2cMutex);
  }

  xTaskCreatePinnedToCore(maxTask, "maxTask", 8192, NULL, 1, NULL, 0);

  Serial.println("System ready");
}

// ============================
// LOOP
// ============================
void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(20);
  }

  // Refresh active UID, but do NOT clear cachedUid on transient failure
  if ((now - lastUidFetch) >= UID_FETCH_INTERVAL || cachedUid.length() == 0) {
    lastUidFetch = now;
    String freshUid = getActiveUid();
    if (freshUid.length() > 0) {
      cachedUid = freshUid;
      if (DEBUG_UPLOADS) {
        Serial.println("UID: " + cachedUid);
      }
    } else if (DEBUG_UPLOADS) {
      Serial.println("UID fetch failed; using previous cached UID if available");
    }
  }

  if (cachedUid.length() == 0) {
    if (now - lastUidWarnTime > 2000) {
      Serial.println("Waiting for active_uid/uid...");
      lastUidWarnTime = now;
    }
    delay(20);
    return;
  }

  String motionPath = String(RTDB_BASE) + "/liveData/" + cachedUid + "/motion.json";
  String healthPath = String(RTDB_BASE) + "/liveData/" + cachedUid + "/health.json";

  // 1) Fast local sampling (MPU)
  if (!g_maxReadInProgress && (now - lastGyroSample) >= GYRO_SAMPLE_INTERVAL) {
    lastGyroSample = now;

    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      mpu6050.update();

      curAccX  = mpu6050.getAccX();
      curAccY  = mpu6050.getAccY();
      curAccZ  = mpu6050.getAccZ();

      curGyroX = mpu6050.getGyroX();
      curGyroY = mpu6050.getGyroY();
      curGyroZ = mpu6050.getGyroZ();

      xSemaphoreGive(i2cMutex);
    }
  }

  // 2) Motion upload
  if ((now - lastGyroUpload) >= GYRO_UPLOAD_INTERVAL) {
    lastGyroUpload = now;

    if (shouldUploadMotion(now)) {
      String ts = isoTimestamp();

      String payload = String("{") +
        "\"acc_x\":"  + String(curAccX,  3) + "," +
        "\"acc_y\":"  + String(curAccY,  3) + "," +
        "\"acc_z\":"  + String(curAccZ,  3) + "," +
        "\"gyro_x\":" + String(curGyroX, 3) + "," +
        "\"gyro_y\":" + String(curGyroY, 3) + "," +
        "\"gyro_z\":" + String(curGyroZ, 3) + "," +
        "\"timestamp\":\"" + ts + "\"" +
        "}";

      debugLogUpload("MOTION", cachedUid, motionPath, payload);

      if (httpPatch(motionPath, payload)) {
        sentAccX = curAccX; sentAccY = curAccY; sentAccZ = curAccZ;
        sentGyroX = curGyroX; sentGyroY = curGyroY; sentGyroZ = curGyroZ;
        hasUploadedMotion = true;
        lastForcedUpload = now;

        if (now - lastMotionOkLog > 2000) {
          Serial.print("Motion uploaded. uid=");
          Serial.println(cachedUid);
          lastMotionOkLog = now;
        }
      }
    }
  }

  // 3) Health upload every 3 sec
  if ((now - lastHealthSend) >= HEALTH_INTERVAL) {
    lastHealthSend = now;
    if (DEBUG_UPLOADS) {
      Serial.println("HEALTH UPLOAD TRIGGERED");
    }

    int raw = 0;
    for (int i = 0; i < 8; i++) {
      raw += analogRead(LM35_PIN);
      delay(2);
    }
    raw /= 8;

    float lm35 = (raw * (3.3f / 4095.0f)) * 100.0f;
    String ts = isoTimestamp();

    String payload = String("{") +
      "\"heart_rate\":" + String(g_heartRate) + "," +
      "\"spo2\":" + String(g_spo2) + "," +
      "\"lm35_temp\":" + String(lm35, 2) + "," +
      "\"temperature\":" + String(lm35, 2) + "," +
      "\"timestamp\":\"" + ts + "\"" +
      "}";

    debugLogUpload("HEALTH", cachedUid, healthPath, payload);

    if (httpPatch(healthPath, payload)) {
      if (now - lastHealthOkLog > 5000) {
        Serial.print("Health uploaded. HR=");
        Serial.print(g_heartRate);
        Serial.print(" SpO2=");
        Serial.print(g_spo2);
        Serial.print(" Temp=");
        Serial.println(lm35, 2);
        lastHealthOkLog = now;
      }
    }
  }

  delay(1);
}
