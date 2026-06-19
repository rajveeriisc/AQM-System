/**
 * ═══════════════════════════════════════════════════════════════
 *  AEWIS Air Quality Monitor — ESP32-S3 + 4.2" E-Paper GDEY042T81
 *  Firmware v1.2 — Sensors · Display · WiFi · HTTP · AP Provisioning
 *              + Bosch BMV080 particulate matter sensor (PM1/PM2.5/PM10)
 * ═══════════════════════════════════════════════════════════════
 *
 *  FIRST BOOT (no WiFi stored)
 *    → Display shows SETUP MODE screen
 *    → AP "AEWIS-XXXXXX" starts; connect to it and open any browser
 *    → Captive portal page appears; fill WiFi + dashboard code
 *    → Device connects WiFi, provisions with backend (stores token in NVS)
 *    → Sends readings every 10 s with x-device-token header
 *
 *  NORMAL BOOT (credentials in NVS)
 *    → Loads WiFi creds + provision_token from NVS
 *    → Connects WiFi → NTP
 *    → Reads all sensors every 10 s, updates display, POSTs to backend
 *
 *  RESET PROVISIONING  →  build with ALWAYS_CLEAR_NVS 1, or via MQTT cmd:
 *    prefs.begin("aewis", false); prefs.clear(); prefs.end(); ESP.restart();
 *
 *  BMV080 (PM1/PM2.5/PM10):
 *    Communicates via SPI (default) or I2C depending on variant.
 *    TODO: Replace stub below with actual Bosch BMV080 SPI/I2C driver.
 *    Until the driver is integrated, readBMV080() returns -1.0 for all
 *    channels and the backend receives JSON null for pm1/pm25/pm10.
 *
 *  platformio.ini  lib_deps additions:
 *    knolleary/PubSubClient @ ^2.8
 *    (BMV080: add boschsensortec/BMV080-Sensor-API when available on PIO)
 * ═══════════════════════════════════════════════════════════════
 */

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>

#include <WebServer.h>
#include <DNSServer.h>
#include <time.h>
#include <SensirionI2CScd4x.h>
#include <SensirionI2CSgp41.h>
#include <VOCGasIndexAlgorithm.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

// ─────────────────────────────────────────────────────────────
//  Hardware pins  (unchanged from v1.0)
// ─────────────────────────────────────────────────────────────
#define PIN_I2C_SDA    21
#define PIN_I2C_SCL    13
#define PIN_CO_RX      18
#define PIN_CO_TX      17
#define PIN_O3_RX      40
#define PIN_O3_TX      39
#define PIN_NO2_ADC     4

#define EPD_SCK        12
#define EPD_MOSI       11
#define EPD_CS         10
#define EPD_DC         15
#define EPD_RST        16
#define EPD_BUSY        5

#define ADDR_SCD4X    0x62
#define ADDR_SGP4X    0x59


// ─────────────────────────────────────────────────────────────
//  Sensor thresholds  (EPA NAAQS / ASHRAE 62.1)
// ─────────────────────────────────────────────────────────────
#define CO2_GOOD   800
#define CO2_MOD   1200
#define VOC_GOOD   100
#define VOC_MOD    200
#define CO_GOOD     9.0f        // ppm  — EPA 8-hr
#define CO_MOD     35.0f        // ppm  — EPA 1-hr
#define O3_GOOD     0.070f      // ppm  — EPA 8-hr (70 ppb)
#define O3_MOD      0.085f      // ppm  — sensitive groups
#define NO2_GOOD    0.053f      // ppm  — EPA annual
#define NO2_MOD     0.100f      // ppm  — 100 ppb

// ─────────────────────────────────────────────────────────────
//  ZE07-CO
//  concentration = (Hb×256 + Lb) × 0.1 ppm  (Table 4/8)
//  Must be switched to Q&A mode on boot (default = initiative upload).
// ─────────────────────────────────────────────────────────────
#define CO_MULTIPLIER    0.1f
#define CO_WARMUP_MS     180000UL    // 3 min

// ─────────────────────────────────────────────────────────────
//  ZE25A-O3  — 0–2 ppm range, 1 ppb (0.001 ppm) per count
// ─────────────────────────────────────────────────────────────
#define O3_MULTIPLIER    0.001f      // 1 ppb per count
#define O3_MAX_PPM       2.0f
#define O3_WARMUP_MS     180000UL

// ─────────────────────────────────────────────────────────────
//  SEN0574 / GM-102B NO2 — resistive MEMS, oxidising gas
//
//  Physics:  NO2 ↑ → Rs ↑.  Vout = VCC × RL / (Rs + RL)
//            Rs  = RL × (VCC − Vout) / Vout
//            ppm = (Rs/R0 − 1) × NO2_SCALE
//  Check:    at 5 ppm, spec says Rs/R0 ≥ 2.0 → (2−1)×5 = 5 ppm ✓
//
//  ADC_0db (0–0.75 V) required:
//    At clean-air Vout ≈ 65 mV, ADC_11db gives only ~76 counts
//    (4.6× too coarse). ADC_0db gives ~354 counts per clean-air read.
//
//  R0 seed: calibrated in AC-room clean air.
//  Dead-band: Rs/R0 < 1.08 → clamp 0 ppm (5× ADC noise margin).
// ─────────────────────────────────────────────────────────────
#define NO2_RL              4700.0f     // Ω  — confirmed on SEN0574 board
#define NO2_VCC                3.3f     // V
#define NO2_R0_SEED        235508.0f    // Ω  — calibrated AC-room baseline
#define NO2_SCALE              5.0f     // ppm / (Rs/R0 − 1)
#define NO2_VOUT_MIN           0.01f    // V  — divide-by-zero guard
#define NO2_PPM_MAX           10.0f     // ppm — SEN0574 range
#define NO2_ADC_FULLSCALE      0.75f    // V  — ESP32-S3 ADC_0db
#define NO2_DEADBAND_RATIO     1.08f    // Rs/R0 < 1.08 → 0 ppm
#define NO2_WARMUP_MS       300000UL    // 5 min (datasheet: >5 min)

// ─────────────────────────────────────────────────────────────
//  Display layout  (400×300 px GDEY042T81)
//
//  7 sensor rows fit between title (y≈35+25=60) and status bar (y=260).
//  Available height: 260 − 60 = 200 px → ROW_DY = 200/7 ≈ 28 px.
//  Using ROW_Y0=62, ROW_DY=28: rows at 62,90,118,146,174,202,230
//  last row bottom ≈ 246, status bar starts at 260 → 14 px clear.
// ─────────────────────────────────────────────────────────────
#define ROW_Y0         62
#define ROW_DY         28
#define LABEL_X        12
#define VALUE_RIGHT_X  395

// ─────────────────────────────────────────────────────────────
//  PM thresholds — EPA NAAQS
// ─────────────────────────────────────────────────────────────
#define PM25_GOOD    12.0f       // μg/m³ — EPA 24-hr Good
#define PM25_MOD     35.4f       // μg/m³ — EPA 24-hr Moderate
#define PM10_GOOD    54.0f       // μg/m³ — EPA 24-hr Good
#define PM10_MOD    154.0f       // μg/m³ — EPA 24-hr Moderate

// ─────────────────────────────────────────────────────────────
//  BMV080 SPI pin assignments
//  TODO: Adjust these to match your PCB routing.
//  The BMV080 shares the e-paper SPI bus (SCK/MOSI) but uses its
//  own CS pin.  MISO is needed only if reading back sensor data
//  via full-duplex SPI (check BMV080 datasheet for SDO pin).
// ─────────────────────────────────────────────────────────────
#define BMV080_CS      9    // TODO: set correct GPIO
#define BMV080_MISO   -1    // TODO: set correct GPIO (or -1 if write-only mode)

// ─────────────────────────────────────────────────────────────
//  Firmware + connectivity constants
// ─────────────────────────────────────────────────────────────
#define FW_VERSION        "1.2.0"
#define WIFI_TIMEOUT_MS    15000UL   // max time waiting for WiFi
#define MQTT_PORT          1883
#define MQTT_KEEPALIVE_S   60
#define MQTT_RETRY_MS      30000UL   // reconnect interval

#define SGP41_COND_MS      30000UL
#define AP_TIMEOUT_MS      600000UL  // 10 min — stop AP if nobody provisions

// ─────────────────────────────────────────────────────────────
//  Development: set to 1 only to wipe NVS on every boot.
//  MUST be 0 in production — otherwise device loses credentials
//  and provision_token on every restart.
// ─────────────────────────────────────────────────────────────
#ifndef ALWAYS_CLEAR_NVS
#define ALWAYS_CLEAR_NVS  0
#endif

// ─────────────────────────────────────────────────────────────
//  Captive portal: delay between form submit and WiFi connect
//  (lets HTTP response reach the browser before AP tears down)
// ─────────────────────────────────────────────────────────────
#define PROV_GRACE_MS  1500UL

// ─────────────────────────────────────────────────────────────
//  Sensor objects
// ─────────────────────────────────────────────────────────────
SensirionI2CScd4x    scd4x;
SensirionI2CSgp41    sgp41;
VOCGasIndexAlgorithm vocAlgo;
HardwareSerial       coSerial(1);
HardwareSerial       o3Serial(2);

GxEPD2_BW<GxEPD2_420_GDEY042T81, GxEPD2_420_GDEY042T81::HEIGHT>
    display(GxEPD2_420_GDEY042T81(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));

// ─────────────────────────────────────────────────────────────
//  Connectivity objects
// ─────────────────────────────────────────────────────────────
Preferences      prefs;
WiFiClient       wifiClient;
WiFiClientSecure wifiClientSecure;
// mqttUseTls toggled true when MQTT host starts with "mqtts://" or port == 8883
bool             g_mqttTls  = false;
PubSubClient     mqtt(wifiClient);   // re-pointed in connectMQTT() if TLS

// ─────────────────────────────────────────────────────────────
//  Runtime state
// ─────────────────────────────────────────────────────────────
String   g_deviceId;
String   g_bleName;
String   g_backendUrl;
String   g_mqttHost;
String   g_provisionToken;     // received from POST /api/devices/provision, sent as x-device-token

float    g_tempC        = 25.0f;
float    g_rhPct        = 50.0f;
bool     g_sgpReady     = false;
uint32_t g_sgpCondStart = 0;
static float s_no2R0    = NO2_R0_SEED;

bool     g_wifiOk          = false;
bool     g_mqttOk          = false;
uint32_t g_lastMqttRetry   = 0;
// Provisioning  (written from Captive Portal)
String           g_pendingSSID, g_pendingPass, g_pendingURL, g_pendingCode, g_pendingMqtt;
// Captive-portal trigger flags (declared here; set in handleAPSave)
bool     g_provTrigger   = false;
uint32_t g_provTriggerMs = 0;

// AP + Captive Portal provisioning
WebServer  g_apServer(80);
DNSServer  g_dnsServer;
bool       g_apRunning = false;
uint32_t   g_apStartMs = 0;
String     g_apPass;          // WPA2 password = last 6 MAC hex digits (print on device label)
String     g_wifiScanJson = "[]";  // cached WiFi scan result

enum DevState { ST_PROV, ST_WIFI_CONN, ST_RUNNING };
DevState g_state = ST_PROV;

// ═══════════════════════════════════════════════════════════════
//  QUALITY LABELS  (unchanged)
// ═══════════════════════════════════════════════════════════════
static const char* qlf(float v, float g, float m) {
    if (v <  0.0f) return "N/A";
    if (v <  g)    return "Good";
    if (v <  m)    return "Mod";
    return          "Poor";
}
static const char* qli(int v, int g, int m) {
    if (v <= 0)    return "N/A";
    if (v <  g)    return "Good";
    if (v <  m)    return "Mod";
    return          "Poor";
}

// ═══════════════════════════════════════════════════════════════
//  SENSOR READERS  (unchanged from v1.0)
// ═══════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────
//  Winsen protocol helpers
// ─────────────────────────────────────────────────────────────
static uint8_t winsenCRC(const uint8_t *b, uint8_t len) {
    // NOT(sum of Bytes[1..len-2]) + 1  — ZE07-CO datasheet page 3
    uint8_t s = 0;
    for (uint8_t i = 1; i < len - 1; i++) s += b[i];
    return (uint8_t)(~s + 1);
}
static bool winsenQuery(HardwareSerial &port, const uint8_t *req,
                        uint8_t *rsp, uint8_t cmd, uint32_t tMs = 700) {
    while (port.available()) port.read();   // flush stale bytes
    port.write(req, 9);
    uint32_t t0 = millis(); uint8_t n = 0;
    while (millis() - t0 < tMs && n < 9)
        if (port.available()) rsp[n++] = port.read();
    return (n == 9 && rsp[0] == 0xFF && rsp[1] == cmd &&
            rsp[8] == winsenCRC(rsp, 9));
}

// ─────────────────────────────────────────────────────────────
//  ZE07-CO — switch to Q&A mode (must call once on boot)
//  Default mode is initiative-upload; Q&A required for winsenQuery.
//  Command Table 5:  FF 01 78 41 00 00 00 00 46
// ─────────────────────────────────────────────────────────────
void setZE07_QAMode(HardwareSerial &port) {
    static const uint8_t cmd[9] = {0xFF, 0x01, 0x78, 0x41,
                                    0x00, 0x00, 0x00, 0x00, 0x46};
    port.write(cmd, 9);
    delay(500);
    while (port.available()) port.read();   // flush echo
    Serial.println("[CO] ZE07-CO switched to Q&A mode");
}

// ─────────────────────────────────────────────────────────────
//  ZE07-CO  (UART, Q&A, Table 8: ppm = (Hb×256+Lb) × 0.1)
// ─────────────────────────────────────────────────────────────
float readCO_ppm() {
    if (millis() < CO_WARMUP_MS) return -1.0f;
    static const uint8_t req[9] = {0xFF,0x01,0x86,0,0,0,0,0,0x79};
    uint8_t rsp[9] = {};
    if (!winsenQuery(coSerial, req, rsp, 0x86)) {
        Serial.println("[CO] Query failed");
        return -1.0f;
    }
    float ppm = (((uint16_t)rsp[2] << 8) | rsp[3]) * CO_MULTIPLIER;
    Serial.printf("[CO] %.1f ppm\n", ppm);
    return ppm;
}

// ─────────────────────────────────────────────────────────────
//  ZE25A-O3  (UART, Q&A, 1 ppb per count, clamped to 2.0 ppm)
// ─────────────────────────────────────────────────────────────
float readO3_ppm() {
    if (millis() < O3_WARMUP_MS) return -1.0f;
    static const uint8_t req[9] = {0xFF,0x01,0x86,0,0,0,0,0,0x79};
    uint8_t rsp[9] = {};
    if (!winsenQuery(o3Serial, req, rsp, 0x86)) return -1.0f;
    float ppm = (((uint16_t)rsp[2] << 8) | rsp[3]) * O3_MULTIPLIER;
    ppm = constrain(ppm, 0.0f, O3_MAX_PPM);
    Serial.printf("[O3] %.3f ppm\n", ppm);
    return ppm;
}

// ─────────────────────────────────────────────────────────────
//  SEN0574 NO2 — 256-sample trim-mean ADC (ADC_0db, 0–0.75 V)
//  R0 hard-init on first post-warmup sample, then 1-hour τ tracking.
//  Dead-band at Rs/R0 < 1.08 clamps noise floor to 0 ppm.
// ─────────────────────────────────────────────────────────────
float readNO2_ppm() {
    if (millis() < NO2_WARMUP_MS) return -1.0f;

    // ── ADC: 256 samples, sorted trim-mean (discard top+bottom 32) ──
    // Larger N improves noise floor by √(256/128) = 1.41× over prev.
    const int N_SAMP = 256;
    const int N_TRIM = 32;
    int32_t   s[N_SAMP];

    for (int i = 0; i < N_SAMP; i++) {
        s[i] = analogRead(PIN_NO2_ADC);
        delayMicroseconds(300);
    }

    // Insertion sort
    for (int i = 1; i < N_SAMP; i++) {
        int32_t key = s[i];
        int     j   = i - 1;
        while (j >= 0 && s[j] > key) { s[j + 1] = s[j]; j--; }
        s[j + 1] = key;
    }

    int64_t acc = 0;
    int     cnt = N_SAMP - 2 * N_TRIM;
    for (int i = N_TRIM; i < N_SAMP - N_TRIM; i++) acc += s[i];
    float vout = (acc / (float)cnt) * (NO2_ADC_FULLSCALE / 4095.0f);

    if (vout < NO2_VOUT_MIN) {
        Serial.println("[NO2] ERROR: Vout < 10 mV — check wiring");
        return -1.0f;
    }

    float Rs = NO2_RL * (NO2_VCC - vout) / vout;

    // ── R0 state ──
    static uint32_t calStart    = 0;
    static bool     firstSample = true;

    if (calStart == 0) {
        calStart = millis();
        Serial.printf("[NO2] Starting. R0_seed=%.0fΩ  Vout=%.4fV  "
                      "ADC range=0db (0-0.75V)\n", s_no2R0, vout);
    }
    uint32_t elapsedMs  = millis() - calStart;
    int      elapsedMin = (int)(elapsedMs / 60000UL);

    // ── R0 update: hard-init on first sample, slow-track minimum ──
    if (elapsedMs >= NO2_WARMUP_MS) {
        if (firstSample) {
            s_no2R0     = Rs;
            firstSample = false;
            Serial.printf("[NO2] R0 init: %.0f Ω  (Vout=%.4fV)\n",
                          s_no2R0, vout);
        } else if (Rs < s_no2R0) {
            // Very gentle tracking: 1-hour time constant at 10s loop
            // τ = 3600s, dt = 10s, α = dt/τ = 0.0028 ≈ 0.003
            s_no2R0 = Rs * 0.003f + s_no2R0 * 0.997f;
        }
    }

    // ── ppm with dead-band ──
    float ratio   = Rs / s_no2R0;
    float raw_ppm;

    if (ratio < NO2_DEADBAND_RATIO) {
        // Rs/R0 < 1.08: within ADC noise floor, clamp to zero.
        // At ADC_0db, non-linearity ≈ 10 counts → ~0.024V → Rs error
        // ≈ 3% → ratio error ≈ 0.03 → ppm error ≈ 0.15 ppm worst case.
        // Deadband of 0.08 = 5× that margin.
        raw_ppm = 0.0f;
    } else {
        raw_ppm = (ratio - 1.0f) * NO2_SCALE;
    }
    raw_ppm = constrain(raw_ppm, 0.0f, NO2_PPM_MAX);

    // EMA: seed on first real value, 0.20 weight (5-reading settling)
    static float ema_ppm = -1.0f;
    if (ema_ppm < 0.0f) {
        ema_ppm = raw_ppm;
    } else {
        ema_ppm = ema_ppm * 0.80f + raw_ppm * 0.20f;
    }

    Serial.printf("[NO2] Vout=%.4fV  Rs=%.0fΩ  R0=%.0fΩ  "
                  "ratio=%.4f  raw=%.3f  ema=%.3f ppm  | %d min\n",
                  vout, Rs, s_no2R0, ratio, raw_ppm, ema_ppm, elapsedMin);

    // Calibration complete banner (only useful if recalibrating)
    static bool r0Shown = false;
    if (elapsedMs > 1800000UL && !r0Shown) {
        Serial.printf("\n[NO2] Stable R0=%.0f Ω  →  update NO2_R0_SEED\n\n",
                      s_no2R0);
        r0Shown = true;
    }

    return ema_ppm;
}

// ═══════════════════════════════════════════════════════════════
//  BMV080 — Bosch Particulate Matter Sensor (PM1, PM2.5, PM10)
// ───────────────────────────────────────────────────────────────
//  Interface: SPI (CPOL=0, CPHA=0, up to 10 MHz).
//  CS pin: BMV080_CS.  Shares SCK/MOSI with e-paper; dedicated CS.
//
//  TODO — replace this stub with the real SPI/I2C driver:
//    1. Add boschsensortec/BMV080-Sensor-API to platformio.ini lib_deps
//       (or clone from https://github.com/boschsensortec/BMV080_SensorAPI)
//    2. #include "BMV080.h"  and instantiate the BMV080 object.
//    3. In setup(), call bmv080.begin() after SPI.begin().
//    4. Replace the stub body below with bmv080.readPM() calls.
//
//  Pin wiring (example):
//    BMV080 VDD → 3.3 V
//    BMV080 GND → GND
//    BMV080 SDI → GPIO 11 (shared MOSI)
//    BMV080 SCK → GPIO 12 (shared SCK)
//    BMV080 SDO → GPIO BMV080_MISO (or float for SPI write-only)
//    BMV080 CSB → GPIO BMV080_CS   (unique per device)
//    BMV080 INT → not connected (polling mode)
//
//  Expected values from user:  PM1=2, PM2.5=5, PM10=7 μg/m³
// ═══════════════════════════════════════════════════════════════
struct BMV080Data { float pm1; float pm25; float pm10; };

BMV080Data readBMV080() {
    BMV080Data d = { -1.0f, -1.0f, -1.0f };

    // ── STUB: replace the block below once the real driver is wired in ──
    //
    // Example (pseudo-code, replace with actual API):
    //   if (!bmv080.isDataReady()) return d;
    //   d.pm1  = bmv080.getPM1();
    //   d.pm25 = bmv080.getPM25();
    //   d.pm10 = bmv080.getPM10();
    //   Serial.printf("[BMV080] PM1=%.1f PM2.5=%.1f PM10=%.1f μg/m³\n",
    //                 d.pm1, d.pm25, d.pm10);
    //
    // Until the driver is integrated, return -1 so the JSON sends null.
    Serial.println("[BMV080] Stub — driver not yet integrated; reporting null");
    return d;
}

// ═══════════════════════════════════════════════════════════════
//  DISPLAY — unchanged layouts + 3 new screens
// ═══════════════════════════════════════════════════════════════
void fullClear() {
    display.setFullWindow();
    display.fillScreen(GxEPD_WHITE);
    display.firstPage();
    do {} while (display.nextPage());
}

// ── Normal sensor layout (static labels, drawn once) ────────
void drawStaticLayout() {
    display.setRotation(0);
    display.setFullWindow();
    display.firstPage();
    do {
        display.fillScreen(GxEPD_WHITE);

        display.setFont(&FreeMonoBold18pt7b);
        display.setTextColor(GxEPD_BLACK);
        const char *T = "AIR QUALITY MONITOR";
        int16_t bx, by; uint16_t bw, bh;
        display.getTextBounds(T, 0, 0, &bx, &by, &bw, &bh);
        int16_t titleY = 35;
        display.setCursor((display.width() - bw) / 2 - bx - 1, titleY);
        display.print(T);
        display.setCursor((display.width() - bw) / 2 - bx, titleY);
        display.print(T);

        display.setFont(&FreeMonoBold12pt7b);
        // 7 rows: CO2, T/RH, VOC, CO, O3, NO2, PM
        static const char *labels[] = {
            "CO2  :", "T/RH :", "VOC  :",
            "CO   :", "O3   :", "NO2  :", "PM   :"
        };
        for (int i = 0; i < 7; i++) {
            display.setCursor(LABEL_X, ROW_Y0 + i * ROW_DY);
            display.print(labels[i]);
        }
    } while (display.nextPage());
}

void printRightAligned(int y, const char* str) {
    int16_t bx, by; uint16_t bw, bh;
    display.getTextBounds(str, 0, 0, &bx, &by, &bw, &bh);
    display.setCursor(VALUE_RIGHT_X - bw - bx, y);
    display.print(str);
}

// ── Sensor values (partial update, right column) ─────────────
// pm1/pm25/pm10 in μg/m³; pass -1.0 when sensor not yet ready.
void updateValues(uint16_t co2, float temp, float rh,
                  int32_t voc, float co, float o3, float no2,
                  float pm1, float pm25, float pm10) {
    char buf[64];
    const uint16_t valX = LABEL_X + 110;
    const uint16_t valW = display.width() - valX;
    // 7 rows now (added PM row); extend partial window accordingly
    display.setPartialWindow(valX, ROW_Y0 - 22, valW, ROW_DY * 7 + 48);
    display.firstPage();
    do {
        display.fillRect(valX, ROW_Y0 - 22, valW, ROW_DY * 7 + 48, GxEPD_WHITE);
        display.setFont(&FreeMonoBold12pt7b);
        display.setTextColor(GxEPD_BLACK);
        int y = ROW_Y0;

        // CO2
        if (co2 <= 0) snprintf(buf, sizeof(buf), "  ---- ppm [N/A]");
        else          snprintf(buf, sizeof(buf), "%5d ppm [%s]", co2, qli(co2, CO2_GOOD, CO2_MOD));
        printRightAligned(y, buf); y += ROW_DY;

        // Temperature / Humidity
        snprintf(buf, sizeof(buf), "%+5.1fC   %4.1f%%", temp, rh);
        printRightAligned(y, buf); y += ROW_DY;

        // VOC index
        if (voc <= 0) snprintf(buf, sizeof(buf), "  ---- idx [N/A]");
        else          snprintf(buf, sizeof(buf), "%5d idx [%s]", (int)voc, qli(voc, VOC_GOOD, VOC_MOD));
        printRightAligned(y, buf); y += ROW_DY;

        // CO
        if (co < 0.0f) snprintf(buf, sizeof(buf), "  ---- ppm [N/A]");
        else           snprintf(buf, sizeof(buf), "%5.1f ppm [%s]", co, qlf(co, CO_GOOD, CO_MOD));
        printRightAligned(y, buf); y += ROW_DY;

        // O3
        if (o3 < 0.0f) snprintf(buf, sizeof(buf), "  ---- ppm [N/A]");
        else           snprintf(buf, sizeof(buf), "%6.3f ppm [%s]", o3, qlf(o3, O3_GOOD, O3_MOD));
        printRightAligned(y, buf); y += ROW_DY;

        // NO2
        if (no2 < 0.0f) snprintf(buf, sizeof(buf), "  ---- ppm [N/A]");
        else            snprintf(buf, sizeof(buf), "%5.3f ppm [%s]", no2, qlf(no2, NO2_GOOD, NO2_MOD));
        printRightAligned(y, buf); y += ROW_DY;

        // PM (BMV080) — show PM2.5 as primary quality indicator
        if (pm25 < 0.0f)
            snprintf(buf, sizeof(buf), "  ---- ug/m3 [N/A]");
        else
            snprintf(buf, sizeof(buf), "%.1f/%.1f/%.1f [%s]",
                     pm1, pm25, pm10, qlf(pm25, PM25_GOOD, PM25_MOD));
        printRightAligned(y, buf);
    } while (display.nextPage());
}

// ── NEW: connectivity status bar (bottom strip, partial) ─────
void updateStatusBar(bool wifiOk, bool mqttOk, const String& ip) {
    // Row 7 ends at ROW_Y0 + 6*ROW_DY + 16 ≈ 62+168+16=246; leave 14px gap
    const int16_t SB_Y = 260;
    const int16_t SB_H = 40;  // 300 - 260 = 40 px remaining
    display.setPartialWindow(0, SB_Y, display.width(), SB_H);
    display.firstPage();
    do {
        display.fillRect(0, SB_Y, display.width(), SB_H, GxEPD_WHITE);
        display.setFont(&FreeMonoBold12pt7b);
        display.setTextColor(GxEPD_BLACK);
        char buf[56];
        if (wifiOk)
            snprintf(buf, sizeof(buf), "WiFi:OK %-15s MQTT:%s",
                     ip.c_str(), mqttOk ? "OK" : "--");
        else
            snprintf(buf, sizeof(buf), "WiFi:-- MQTT:--");
        display.setCursor(LABEL_X, SB_Y + 26);
        display.print(buf);
    } while (display.nextPage());
}

// ── NEW: BLE setup screen ────────────────────────────────────
void drawProvisioningScreen() {
    display.setFullWindow();
    display.firstPage();
    do {
        display.fillScreen(GxEPD_WHITE);

        display.setFont(&FreeMonoBold18pt7b);
        display.setTextColor(GxEPD_BLACK);
        const char* T = "SETUP MODE";
        int16_t bx, by; uint16_t bw, bh;
        display.getTextBounds(T, 0, 0, &bx, &by, &bw, &bh);
        display.setCursor((display.width() - bw) / 2 - bx, 42);
        display.print(T);

        display.setFont(&FreeMonoBold12pt7b);

        char line[48];
        snprintf(line, sizeof(line), "ID  : %s", g_deviceId.c_str());
        display.getTextBounds(line, 0, 0, &bx, &by, &bw, &bh);
        display.setCursor((display.width() - bw) / 2 - bx, 130);
        display.print(line);

        display.setCursor(LABEL_X, 175);  display.print("To setup, connect to:");
        char apLine[40];
        snprintf(apLine, sizeof(apLine), "  WiFi: %s", g_bleName.c_str());
        display.setCursor(LABEL_X, 205);  display.print(apLine);
        snprintf(apLine, sizeof(apLine), "  Pass: %s", g_apPass.c_str());
        display.setCursor(LABEL_X, 235);  display.print(apLine);
    } while (display.nextPage());
}

// ── NEW: WiFi connecting screen ──────────────────────────────
void drawConnectingScreen(const String& ssid) {
    display.setFullWindow();
    display.firstPage();
    do {
        display.fillScreen(GxEPD_WHITE);

        display.setFont(&FreeMonoBold18pt7b);
        display.setTextColor(GxEPD_BLACK);
        const char* T = "CONNECTING...";
        int16_t bx, by; uint16_t bw, bh;
        display.getTextBounds(T, 0, 0, &bx, &by, &bw, &bh);
        display.setCursor((display.width() - bw) / 2 - bx, 110);
        display.print(T);

        display.setFont(&FreeMonoBold12pt7b);
        char line[48];
        snprintf(line, sizeof(line), "WiFi: %s", ssid.c_str());
        display.getTextBounds(line, 0, 0, &bx, &by, &bw, &bh);
        display.setCursor((display.width() - bw) / 2 - bx, 160);
        display.print(line);
    } while (display.nextPage());
}

// ═══════════════════════════════════════════════════════════════
//  DEVICE ID from MAC
// ═══════════════════════════════════════════════════════════════
String buildDeviceId() {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char id[20];
    snprintf(id, sizeof(id), "aewis-%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(id);
}

// ═══════════════════════════════════════════════════════════════
//  AP + CAPTIVE PORTAL PROVISIONING  (iOS / universal fallback)
//  Runs alongside BLE on first boot.
//  iOS auto-opens Safari when it joins an AP with no internet —
//  the DNS server redirects every domain to 192.168.4.1.
// ═══════════════════════════════════════════════════════════════

// Scan nearby WiFi networks and return a JSON array of SSIDs sorted by signal strength.
// Called once when AP starts; result is cached in g_wifiScanJson.
String buildWifiScanJson() {
    Serial.println("[WiFi] Scanning networks...");
    int n = WiFi.scanNetworks(false, false);  // blocking, no hidden SSIDs
    if (n <= 0) { WiFi.scanDelete(); return "[]"; }

    // Collect unique SSIDs with best RSSI
    struct Net { String ssid; int rssi; };
    Net nets[16]; int count = 0;
    for (int i = 0; i < n && count < 16; i++) {
        String s = WiFi.SSID(i);
        if (s.isEmpty()) continue;
        bool dup = false;
        for (int j = 0; j < count; j++) if (nets[j].ssid == s) { dup = true; break; }
        if (!dup) nets[count++] = { s, WiFi.RSSI(i) };
    }
    // Sort by RSSI descending (bubble sort — n is small)
    for (int i = 0; i < count - 1; i++)
        for (int j = 0; j < count - i - 1; j++)
            if (nets[j].rssi < nets[j+1].rssi) { Net tmp = nets[j]; nets[j] = nets[j+1]; nets[j+1] = tmp; }

    String json = "[";
    for (int i = 0; i < min(count, 8); i++) {          // cap at 8 to stay < 512 B (BLE limit)
        String s = nets[i].ssid;
        s.replace("\\", "\\\\"); s.replace("\"", "\\\"");  // JSON-escape
        if (i > 0) json += ",";
        json += "\""; json += s; json += "\"";
    }
    json += "]";
    WiFi.scanDelete();
    Serial.printf("[WiFi] Scan: %s\n", json.c_str());
    return json;
}

static const char AP_SETUP_PAGE[] PROGMEM = R"html(
<!DOCTYPE html><html>
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AEWIS Setup</title>
<style>
body{font-family:sans-serif;max-width:400px;margin:30px auto;padding:16px;background:#f0f4f8}
h2{text-align:center;color:#1565C0;margin-bottom:4px}
.card{background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.id{text-align:center;font-size:12px;color:#888;margin-bottom:14px}
label{display:block;margin-top:14px;font-size:13px;font-weight:600;color:#444}
input{width:100%;padding:9px 10px;margin-top:5px;border:1px solid #ccc;border-radius:5px;
      box-sizing:border-box;font-size:14px}
button{width:100%;padding:12px;margin-top:22px;background:#1976D2;color:#fff;
       border:none;border-radius:6px;font-size:15px;cursor:pointer}
button:active{background:#1256a0}
</style></head>
<body><div class="card">
<h2>AEWIS Setup</h2>
<div class="id">%%DEVID%%</div>
<form method="POST" action="/save">
<label>WiFi Network (SSID)</label>
<input name="ssid" id="ssid" type="text" list="nets" placeholder="Select or type your WiFi name" required autocomplete="off">
<datalist id="nets"></datalist>
<label>WiFi Password</label>
<input name="pass" type="password" placeholder="Leave blank if open network">
<label>Dashboard URL</label>
<div style="font-size:13px; color:#555; margin-top:4px;">https://strong-courtesy-aqm.up.railway.app</div>
<!-- Hardcoded MQTT and Dashboard URLs -->
<label>Dashboard Code <span style="font-weight:normal;color:#888">(6-digit code from Add Device)</span></label>
<input name="code" type="text" inputmode="numeric" pattern="\d{6}" maxlength="6" placeholder="123456">
<button type="submit">Connect Device</button>
</form></div>
<script>
fetch('/wifiscan').then(function(r){return r.json();}).then(function(list){
  var dl=document.getElementById('nets');
  list.forEach(function(s){var o=document.createElement('option');o.value=s;dl.appendChild(o);});
  if(list.length>0){document.getElementById('ssid').placeholder='Select your WiFi network';}
}).catch(function(){});
</script>
</body></html>
)html";

static const char AP_SAVE_PAGE[] PROGMEM = R"html(
<!DOCTYPE html><html>
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connecting...</title>
<style>body{font-family:sans-serif;max-width:400px;margin:60px auto;padding:16px;text-align:center}
.card{background:#fff;border-radius:10px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.12)}
h2{color:#1565C0}</style></head>
<body><div class="card">
<h2>Connecting...</h2>
<p>Device is joining your WiFi.<br>This hotspot will close shortly.</p>
<p style="color:#999;font-size:12px">Reconnect to your home WiFi,<br>
then open the AEWIS dashboard.</p>
</div></body></html>
)html";

void handleAPRoot() {
    String page = AP_SETUP_PAGE;
    page.replace("%%DEVID%%", g_deviceId);
    g_apServer.send(200, "text/html", page);
}

void handleAPSave() {
    String ssid     = g_apServer.arg("ssid");
    String pass     = g_apServer.arg("pass");
    String url      = "https://strong-courtesy-aqm.up.railway.app";
    String mqttHost = "kodama.proxy.rlwy.net:43148";
    String mqttUser = "";
    String mqttPass = "";
    String code     = g_apServer.arg("code");
    g_apServer.send(200, "text/html", String(AP_SAVE_PAGE));
    if (ssid.isEmpty()) return;
    g_pendingSSID   = ssid;
    g_pendingPass   = pass;
    g_pendingURL    = url;
    g_pendingMqtt   = mqttHost;
    g_pendingCode   = code;

    // Persist MQTT credentials immediately (they aren't needed until connectMQTT)
    if (!mqttUser.isEmpty()) {
        prefs.begin("aewis", false);
        prefs.putString("mqtt_user", mqttUser);
        prefs.putString("mqtt_pass", mqttPass);
        prefs.end();
    }
    g_provTrigger   = true;
    g_provTriggerMs = millis();
    Serial.printf("[AP] Creds received — SSID: %s\n", ssid.c_str());
}

void handleAPNotFound() {
    // Redirect every URL to captive portal — iOS/Android detect this and auto-open browser
    g_apServer.sendHeader("Location", "http://192.168.4.1/", true);
    g_apServer.send(302, "text/plain", "");
}

void startAP() {
    WiFi.mode(WIFI_AP_STA);   // AP + STA so later STA connect needs no mode switch
    delay(200);               // let radio stabilize before scanning / starting AP

    // Initial scan — cached for BLE characteristic (startBLE called after this)
    g_wifiScanJson = buildWifiScanJson();

    WiFi.softAP(g_bleName.c_str(), g_apPass.c_str(), 1, 0, 4);
    delay(100);

    // DNS: answer every domain with 192.168.4.1 → triggers captive portal popup
    g_dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    g_dnsServer.start(53, "*", WiFi.softAPIP());

    g_apServer.on("/",          HTTP_GET,  handleAPRoot);
    g_apServer.on("/save",      HTTP_POST, handleAPSave);
    g_apServer.on("/wifiscan",  HTTP_GET,  []() {
        // Fresh scan on every request — AP is stable now, avoids stale startup cache
        g_wifiScanJson = buildWifiScanJson();
        g_apServer.sendHeader("Access-Control-Allow-Origin", "*");
        g_apServer.send(200, "application/json", g_wifiScanJson);
    });
    g_apServer.onNotFound(handleAPNotFound);
    g_apServer.begin();

    g_apRunning = true;
    g_apStartMs = millis();
    Serial.printf("[AP] Started — SSID: %s  Pass: %s  IP: %s\n",
                  g_bleName.c_str(), g_apPass.c_str(),
                  WiFi.softAPIP().toString().c_str());
}

void stopAP() {
    if (!g_apRunning) return;
    g_apServer.stop();
    g_dnsServer.stop();
    WiFi.softAPdisconnect(true);
    g_apRunning = false;
    Serial.println("[AP] Stopped");
}

// ═══════════════════════════════════════════════════════════════
//  BLE GATT SERVER
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
//  WiFi + NTP
// ═══════════════════════════════════════════════════════════════
bool connectWiFi(const String& ssid, const String& pass) {
    Serial.printf("[WiFi] Connecting to %s ...\n", ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS)
        delay(250);
    g_wifiOk = (WiFi.status() == WL_CONNECTED);
    if (g_wifiOk) {
        Serial.printf("[WiFi] Connected — IP %s\n",
                      WiFi.localIP().toString().c_str());
        configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    } else {
        Serial.println("[WiFi] Failed");
    }
    return g_wifiOk;
}

// ═══════════════════════════════════════════════════════════════
//  Backend HTTP provision  (called once after WiFi join)
//  Sends device_id, mac, firmware_version, ip, pairing_code.
//  Parses "provision_token" from response JSON and stores in NVS.
//  The token is subsequently sent as x-device-token on every reading.
// ═══════════════════════════════════════════════════════════════
void httpProvision() {
    if (g_backendUrl.isEmpty()) return;

    HTTPClient http;
    String url = g_backendUrl + "/api/devices/provision";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(8000);

    uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    char body[256];
    if (g_pendingCode.isEmpty()) {
        snprintf(body, sizeof(body),
            "{\"device_id\":\"%s\",\"mac\":\"%s\","
            "\"firmware_version\":\"%s\",\"ip\":\"%s\"}",
            g_deviceId.c_str(), macStr, FW_VERSION,
            WiFi.localIP().toString().c_str());
    } else {
        snprintf(body, sizeof(body),
            "{\"device_id\":\"%s\",\"mac\":\"%s\","
            "\"firmware_version\":\"%s\",\"ip\":\"%s\","
            "\"pairing_code\":\"%s\"}",
            g_deviceId.c_str(), macStr, FW_VERSION,
            WiFi.localIP().toString().c_str(),
            g_pendingCode.c_str());
    }

    int code = http.POST(body);
    Serial.printf("[HTTP] Provision → %d\n", code);

    if (code == 200 || code == 201) {
        // Parse provision_token from JSON response.
        // Response shape: {"provision_token":"<token>", ...}
        // Minimal manual parse — avoids pulling in a JSON library.
        String resp = http.getString();
        Serial.printf("[HTTP] Provision response: %s\n", resp.c_str());

        int keyIdx = resp.indexOf("\"provision_token\"");
        if (keyIdx >= 0) {
            int q1 = resp.indexOf('"', keyIdx + 17); // skip key
            if (q1 >= 0) q1 = resp.indexOf('"', q1 + 1); // opening quote of value
            int q2 = (q1 >= 0) ? resp.indexOf('"', q1 + 1) : -1;
            if (q1 >= 0 && q2 > q1) {
                g_provisionToken = resp.substring(q1 + 1, q2);
                Serial.printf("[HTTP] provision_token stored (%d chars)\n",
                              g_provisionToken.length());
                // Persist so it survives reboot (not erased on normal boot)
                prefs.begin("aewis", false);
                prefs.putString("prov_token", g_provisionToken);
                prefs.end();
            }
        } else {
            Serial.println("[HTTP] WARNING: provision_token not found in response");
        }
    } else {
        Serial.printf("[HTTP] Provision failed: %d — %s\n",
                      code, http.errorToString(code).c_str());
    }
    http.end();
}

// ═══════════════════════════════════════════════════════════════
//  MQTT helpers
// ═══════════════════════════════════════════════════════════════

// ── MQTT command handler (Bug fix #2) ────────────────────────
// Subscribed to aewis/devices/{id}/cmd/#  in connectMQTT().
void mqttCallback(char* topic, uint8_t* payload, unsigned int len) {
    payload[len] = 0;   // null-terminate
    String t(topic);
    Serial.printf("[MQTT] cmd: %s → %s\n", topic, (char*)payload);

    if (t.endsWith("/cmd/reset")) {
        Serial.println("[MQTT] Factory reset — clearing NVS and rebooting");
        prefs.begin("aewis", false); prefs.clear(); prefs.end();
        delay(200);
        ESP.restart();
    } else if (t.endsWith("/cmd/wifi")) {
        Serial.println("[MQTT] WiFi re-provision — clearing NVS and rebooting");
        prefs.begin("aewis", false); prefs.clear(); prefs.end();
        delay(200);
        ESP.restart();
    } else if (t.endsWith("/cmd/ota")) {
        Serial.println("[MQTT] OTA requested — not yet implemented");
        // TODO: implement OTA update
    }
}

// Extract hostname/IP from "http://192.168.1.100:3000" → "192.168.1.100"
String extractHost(const String& url) {
    int s = url.indexOf("://");
    s = (s < 0) ? 0 : s + 3;
    int colon = url.indexOf(":", s);
    int slash  = url.indexOf("/", s);
    int end    = (int)url.length();
    if (colon > s) end = min(end, colon);
    if (slash > s) end = min(end, slash);
    return url.substring(s, end);
}

void publishStatus(const char* status) {
    char topic[80], payload[40];
    snprintf(topic,   sizeof(topic),   "aewis/devices/%s/status",   g_deviceId.c_str());
    snprintf(payload, sizeof(payload), "{\"status\":\"%s\"}",        status);
    mqtt.publish(topic, payload, true);  // retained = broker remembers last status
}

void publishProvision() {
    char topic[80], payload[160];
    uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    snprintf(topic, sizeof(topic), "aewis/devices/%s/provision", g_deviceId.c_str());
    snprintf(payload, sizeof(payload),
        "{\"mac\":\"%s\",\"firmware\":\"%s\",\"ip\":\"%s\"}",
        macStr, FW_VERSION, WiFi.localIP().toString().c_str());
    mqtt.publish(topic, payload);
}

// pm1/pm25/pm10 in μg/m³; pass -1.0 for channels not yet available.
void publishReading(uint16_t co2, float temp, float rh,
                    int32_t voc, float co, float o3, float no2,
                    float pm1, float pm25, float pm10) {
    if (g_backendUrl.isEmpty()) {
        Serial.println("[HTTP] No backend URL — skipping reading");
        return;
    }

    // Serialise each field — JSON null for sensors still warming up
    char coS[10], o3S[10], no2S[10], vocS[10], co2S[10];
    char pm1S[10], pm25S[10], pm10S[10];

    if (co   < 0.0f) snprintf(coS,   sizeof(coS),   "null"); else snprintf(coS,   sizeof(coS),   "%.2f", co);
    if (o3   < 0.0f) snprintf(o3S,   sizeof(o3S),   "null"); else snprintf(o3S,   sizeof(o3S),   "%.4f", o3);
    if (no2  < 0.0f) snprintf(no2S,  sizeof(no2S),  "null"); else snprintf(no2S,  sizeof(no2S),  "%.4f", no2);
    if (voc  <= 0)   snprintf(vocS,  sizeof(vocS),  "null"); else snprintf(vocS,  sizeof(vocS),  "%d",   (int)voc);
    if (co2  == 0)   snprintf(co2S,  sizeof(co2S),  "null"); else snprintf(co2S,  sizeof(co2S),  "%d",   co2);
    if (pm1  < 0.0f) snprintf(pm1S,  sizeof(pm1S),  "null"); else snprintf(pm1S,  sizeof(pm1S),  "%.2f", pm1);
    if (pm25 < 0.0f) snprintf(pm25S, sizeof(pm25S), "null"); else snprintf(pm25S, sizeof(pm25S), "%.2f", pm25);
    if (pm10 < 0.0f) snprintf(pm10S, sizeof(pm10S), "null"); else snprintf(pm10S, sizeof(pm10S), "%.2f", pm10);

    // ISO 8601 timestamp when NTP is synced (stays "null" if not synced)
    char ts[28] = "null";
    struct tm ti;
    if (getLocalTime(&ti, 100)) {
        char tmp[26];
        strftime(tmp, sizeof(tmp), "\"%Y-%m-%dT%H:%M:%SZ\"", &ti);
        strncpy(ts, tmp, sizeof(ts) - 1);
    }

    // Payload < 512 bytes — well within 1 MB limit
    char payload[512];
    snprintf(payload, sizeof(payload),
        "{\"device_id\":\"%s\","
        "\"co2\":%s,\"temp\":%.1f,\"rh\":%.1f,\"voc\":%s,"
        "\"co\":%s,\"o3\":%s,\"no2\":%s,"
        "\"pm1\":%s,\"pm25\":%s,\"pm10\":%s,"
        "\"ts\":%s}",
        g_deviceId.c_str(),
        co2S, temp, rh, vocS,
        coS, o3S, no2S,
        pm1S, pm25S, pm10S,
        ts);

    HTTPClient http;
    http.begin(g_backendUrl + "/api/readings");
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(8000);  // prevent blocking the loop indefinitely

    // x-device-token: required by backend for authenticated device reads
    if (!g_provisionToken.isEmpty())
        http.addHeader("x-device-token", g_provisionToken);
    else
        Serial.println("[HTTP] WARNING: no provision_token — readings may be rejected");

    int code = http.POST(payload);
    if (code == 200 || code == 201) {
        Serial.printf("[HTTP] Readings sent OK (%d)\n", code);
        g_mqttOk = true;  // reused as "backend reachable" indicator on status bar
    } else {
        Serial.printf("[HTTP] Readings failed: %d — %s\n",
                      code, http.errorToString(code).c_str());
        g_mqttOk = false;
    }
    http.end();
}

bool connectMQTT(uint16_t port = MQTT_PORT) {
    if (g_mqttHost.isEmpty()) {
        Serial.println("[MQTT] No broker host — skipping");
        return false;
    }

    // TLS when port 8883 (HiveMQ Cloud, EMQX Cloud, etc.)
    g_mqttTls = (port == 8883);
    if (g_mqttTls) {
        wifiClientSecure.setInsecure();  // skip cert check — fine for sensor data
        mqtt.~PubSubClient();
        new (&mqtt) PubSubClient(wifiClientSecure);
    } else {
        mqtt.~PubSubClient();
        new (&mqtt) PubSubClient(wifiClient);
    }

    mqtt.setServer(g_mqttHost.c_str(), port);
    mqtt.setCallback(mqttCallback);
    mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
    mqtt.setBufferSize(512);

    // Load credentials from NVS (set if using HiveMQ/EMQX)
    prefs.begin("aewis", true);
    String mqttUser = prefs.getString("mqtt_user", "");
    String mqttPass = prefs.getString("mqtt_pass", "");
    prefs.end();

    char lwt[80];
    snprintf(lwt, sizeof(lwt), "aewis/devices/%s/status", g_deviceId.c_str());

    bool ok = mqtt.connect(
        g_deviceId.c_str(),
        mqttUser.isEmpty() ? nullptr : mqttUser.c_str(),
        mqttPass.isEmpty() ? nullptr : mqttPass.c_str(),
        lwt, 0, true,
        "{\"status\":\"offline\"}"
    );
    g_mqttOk = ok;
    if (ok) {
        Serial.printf("[MQTT] Connected to %s:%d%s\n",
                      g_mqttHost.c_str(), port, g_mqttTls ? " (TLS)" : "");
        char cmdTopic[80];
        snprintf(cmdTopic, sizeof(cmdTopic), "aewis/devices/%s/cmd/#", g_deviceId.c_str());
        mqtt.subscribe(cmdTopic);
        publishStatus("online");
        publishProvision();
    } else {
        Serial.printf("[MQTT] Failed rc=%d\n", mqtt.state());
    }
    return ok;
}

void ensureMQTT() {
    if (!g_wifiOk) return;
    if (mqtt.connected()) return;
    if (millis() - g_lastMqttRetry < MQTT_RETRY_MS) return;
    g_lastMqttRetry = millis();
    bool wasOk = g_mqttOk;
    g_mqttOk = connectMQTT();
    if (wasOk != g_mqttOk)  // status changed — refresh display bar
        updateStatusBar(g_wifiOk, g_mqttOk, WiFi.localIP().toString());
}

// ═══════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════
void setup() {
    Serial.begin(115200);
    // Wait up to 3 s for serial monitor; boot normally if none is attached
    { uint32_t t0 = millis(); while (!Serial && millis() - t0 < 3000) delay(10); delay(100); }

    // ── NVS wipe — development only ───────────────────────────
    // ALWAYS_CLEAR_NVS must be 0 in production firmware.
    // When 1, the device loses its WiFi creds, backend URL, and
    // provision_token on every restart → can never reconnect after reboot.
    // Build with -DALWAYS_CLEAR_NVS=1 (platformio.ini build_flags) to
    // force re-provisioning during development / factory reset testing.
#if ALWAYS_CLEAR_NVS
    prefs.begin("aewis", false);
    prefs.clear();
    prefs.end();
    Serial.println("[BOOT] ALWAYS_CLEAR_NVS=1 — NVS erased (dev mode)");
#endif

    // ── Hardware init ─────────────────────────────────────────
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(100000);
    coSerial.begin(9600, SERIAL_8N1, PIN_CO_RX, PIN_CO_TX);
    delay(100);
    setZE07_QAMode(coSerial);   // switch from default initiative-upload to Q&A mode

    o3Serial.begin(9600, SERIAL_8N1, PIN_O3_RX, PIN_O3_TX);

    analogReadResolution(12);
    analogSetAttenuation(ADC_0db);   // 0–0.75 V range for NO2 — critical for clean-air signal

    scd4x.begin(Wire, ADDR_SCD4X);
    uint16_t scdErr = scd4x.stopPeriodicMeasurement();
    if (scdErr) Serial.printf("[I2C] SCD4x stopPeriodicMeasurement failed: %d\n", scdErr);
    delay(500);
    scdErr = scd4x.startPeriodicMeasurement();
    if (scdErr) Serial.printf("[I2C] SCD4x startPeriodicMeasurement failed: %d\n", scdErr);


    sgp41.begin(Wire);
    g_sgpCondStart = millis();

    SPI.begin(EPD_SCK, -1, EPD_MOSI, EPD_CS);
    display.init(115200, true, 2, false);
    fullClear(); delay(800);
    fullClear(); delay(500);

    // ── Device identity ───────────────────────────────────────
    g_deviceId = buildDeviceId();
    uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char bleName[16];
    snprintf(bleName, sizeof(bleName), "AEWIS-%02X%02X%02X",
             mac[3], mac[4], mac[5]);
    g_bleName = String(bleName);
    g_apPass  = g_bleName.substring(6);   // "AEWIS-A1B2C3" → "A1B2C3" — print on device label

    Serial.printf("=== AEWIS FW %s | %s ===\n", FW_VERSION, g_deviceId.c_str());
    Serial.printf("NO2: R0_seed=%.0f Ω, warmup=5+5 min, scale=%.1f\n", (float)NO2_R0_SEED, (float)NO2_SCALE);
    Serial.println("CO : Q&A mode enforced on boot, ×0.1 ppm/count");
    Serial.println("O3 : ×0.001 ppm/count (ZE25A, 0-2 ppm range)");

    // ── Load stored credentials from NVS ─────────────────────
    prefs.begin("aewis", true);
    String storedSSID    = prefs.getString("wifi_ssid",   "");
    String storedPass    = prefs.getString("wifi_pass",   "");
    g_backendUrl         = prefs.getString("backend_url", "");
    String storedMqtt    = prefs.getString("mqtt_host",   "");
    g_provisionToken     = prefs.getString("prov_token",  ""); // auth token for /api/readings
    prefs.end();
    if (!g_provisionToken.isEmpty())
        Serial.printf("[BOOT] provision_token loaded from NVS (%d chars)\n",
                      g_provisionToken.length());

    if (storedSSID.isEmpty()) {
        // ── FIRST BOOT: start AP provisioning ──────────
        // AP + Captive Portal handles iOS and any device with a browser.
        Serial.println("[BOOT] No credentials — starting AP provisioning");
        g_state = ST_PROV;
        drawProvisioningScreen();
        startAP();
    } else {
        // ── NORMAL BOOT: connect WiFi + MQTT ─────────────────
        Serial.printf("[BOOT] Credentials found — connecting to %s\n",
                      storedSSID.c_str());
        g_state = ST_WIFI_CONN;
        drawConnectingScreen(storedSSID);

        if (connectWiFi(storedSSID, storedPass)) {
            // Register with backend via HTTP (MQTT disabled due to Railway proxy limitations)
            httpProvision();
            // g_mqttHost and connectMQTT() removed to prevent rc=-2 loops
        }
        drawStaticLayout();
        updateStatusBar(g_wifiOk, g_mqttOk,
                        g_wifiOk ? WiFi.localIP().toString() : "");
        g_state = ST_RUNNING;
    }
}

// ═══════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════
void loop() {
    static uint32_t lastSgpMs = 0, lastCondMs = 0, lastDispMs = 0;
    static uint16_t lastCO2  = 0;
    static float    lastTemp = 25.0f, lastRH = 50.0f;
    static int32_t  lastVOC  = 0;
    static float    lastCO   = -1.0f, lastO3 = -1.0f, lastNO2 = -1.0f;
    static float    lastPM1  = -1.0f, lastPM25 = -1.0f, lastPM10 = -1.0f;

    // ── AP captive portal — service DNS + HTTP every loop ───────
    if (g_apRunning) {
        g_dnsServer.processNextRequest();
        g_apServer.handleClient();
        if (millis() - g_apStartMs > AP_TIMEOUT_MS) {
            Serial.println("[AP] 10-min timeout — stopping");
            stopAP();
        }
    }

    // ── WiFi watchdog — reconnect if dropped (Bug fix #6) ───────
    if (g_state == ST_RUNNING) {
        if (WiFi.status() != WL_CONNECTED) {
            if (g_wifiOk) {
                g_wifiOk = false;
                g_mqttOk = false;
                Serial.println("[WiFi] Disconnected — calling reconnect");
                WiFi.reconnect();
                updateStatusBar(false, false, "");
            }
        } else if (!g_wifiOk) {
            // WiFi came back
            g_wifiOk = true;
            Serial.printf("[WiFi] Reconnected — IP %s\n",
                          WiFi.localIP().toString().c_str());
            updateStatusBar(true, false, WiFi.localIP().toString());
        }
    }

    // ── Provisioning: wait for grace period then connect ───
    if (g_provTrigger && (millis() - g_provTriggerMs >= PROV_GRACE_MS)) {
        g_provTrigger = false;

        if (!g_pendingURL.isEmpty())  g_backendUrl = g_pendingURL;

        // Tear down provisioning transport before switching to STA mode
        stopAP();
        drawConnectingScreen(g_pendingSSID);

        if (connectWiFi(g_pendingSSID, g_pendingPass)) {
            // Persist credentials
            prefs.begin("aewis", false);
            prefs.putString("wifi_ssid", g_pendingSSID);
            prefs.putString("wifi_pass", g_pendingPass);
            if (!g_backendUrl.isEmpty())
                prefs.putString("backend_url", g_backendUrl);
            if (!g_pendingMqtt.isEmpty())
                prefs.putString("mqtt_host", g_pendingMqtt);
            prefs.end();

            // Register with backend via HTTP
            httpProvision();

            drawStaticLayout();
            updateStatusBar(g_wifiOk, g_mqttOk,
                            WiFi.localIP().toString());
            g_state = ST_RUNNING;
        } else {
            drawProvisioningScreen();   // back to setup screen
        }
    }

    // ── MQTT keepalive + auto-reconnect ──────────────────────
    if (g_state == ST_RUNNING) {
        if (mqtt.connected()) mqtt.loop();
        else                  ensureMQTT();
    }

    // ── SGP41 conditioning (first 30 s after boot) ───────────
    if (!g_sgpReady) {
        if (millis() - lastCondMs >= 1000) {
            lastCondMs = millis();
            uint16_t dummy;
            sgp41.executeConditioning(0x8000, 0x6666, dummy);
        }
        if (millis() - g_sgpCondStart >= SGP41_COND_MS)
            g_sgpReady = true;
    }

    // ── SGP41 VOC algorithm tick (every 1 s) ─────────────────
    if (g_sgpReady && millis() - lastSgpMs >= 1000) {
        lastSgpMs = millis();
        uint16_t compRH = (uint16_t)(g_rhPct * 65535.0f / 100.0f);
        uint16_t compT  = (uint16_t)((g_tempC + 45.0f) * 65535.0f / 175.0f);
        uint16_t rawVoc = 0, rawNox = 0;
        if (sgp41.measureRawSignals(compRH, compT, rawVoc, rawNox) == 0)
            lastVOC = vocAlgo.process(rawVoc);
    }

    // ── Main sensor + display + MQTT cycle (every 10 s) ──────
    if (millis() - lastDispMs >= 10000) {
        lastDispMs = millis();

        // SCD4x — CO2, temperature, humidity
        bool rdy = false;
        uint16_t err = scd4x.getDataReadyFlag(rdy);
        if (err == 0 && rdy) {
            uint16_t co2 = 0; float t = 0, h = 0;
            if (scd4x.readMeasurement(co2, t, h) == 0 && co2 != 0) {
                lastCO2 = co2; lastTemp = t; lastRH = h;
                g_tempC = t;   g_rhPct  = h;
            }
        } else if (err) {
            Serial.printf("[I2C] SCD4x getDataReadyFlag error: %d\n", err);
        }

        lastCO  = readCO_ppm();
        lastO3  = readO3_ppm();
        lastNO2 = readNO2_ppm();

        // BMV080 particulate matter (PM1, PM2.5, PM10)
        {
            BMV080Data pm = readBMV080();
            lastPM1  = pm.pm1;
            lastPM25 = pm.pm25;
            lastPM10 = pm.pm10;
        }

        // Update E-Paper
        if (g_state == ST_RUNNING) {
            updateValues(lastCO2, lastTemp, lastRH,
                         lastVOC, lastCO, lastO3, lastNO2,
                         lastPM1, lastPM25, lastPM10);
            // Redraw status bar — updateValues() partial window overlaps it
            updateStatusBar(g_wifiOk, g_mqttOk,
                            g_wifiOk ? WiFi.localIP().toString() : "");
        }

        // Publish to backend → dashboard via HTTP POST
        if (g_state == ST_RUNNING)
            publishReading(lastCO2, lastTemp, lastRH,
                           lastVOC, lastCO, lastO3, lastNO2,
                           lastPM1, lastPM25, lastPM10);
    }
}
