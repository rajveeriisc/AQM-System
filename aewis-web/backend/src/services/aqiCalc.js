// US EPA AQI calculation
// Breakpoints: [low, high] for concentration and AQI

const PM25_BREAKPOINTS = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
];

const PM10_BREAKPOINTS = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
  { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
  { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
  { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  { cLow: 425, cHigh: 504, iLow: 301, iHigh: 400 },
  { cLow: 505, cHigh: 604, iLow: 401, iHigh: 500 },
];

const CO_BREAKPOINTS = [
  { cLow: 0.0, cHigh: 4.4, iLow: 0, iHigh: 50 },
  { cLow: 4.5, cHigh: 9.4, iLow: 51, iHigh: 100 },
  { cLow: 9.5, cHigh: 12.4, iLow: 101, iHigh: 150 },
  { cLow: 12.5, cHigh: 15.4, iLow: 151, iHigh: 200 },
  { cLow: 15.5, cHigh: 30.4, iLow: 201, iHigh: 300 },
  { cLow: 30.5, cHigh: 40.4, iLow: 301, iHigh: 400 },
  { cLow: 40.5, cHigh: 50.4, iLow: 401, iHigh: 500 },
];

// NO2 breakpoints in ppm (device firmware sends ppm; EPA ppb values divided by 1000)
const NO2_BREAKPOINTS = [
  { cLow: 0.000, cHigh: 0.053, iLow: 0,   iHigh: 50  },
  { cLow: 0.054, cHigh: 0.100, iLow: 51,  iHigh: 100 },
  { cLow: 0.101, cHigh: 0.360, iLow: 101, iHigh: 150 },
  { cLow: 0.361, cHigh: 0.649, iLow: 151, iHigh: 200 },
  { cLow: 0.650, cHigh: 1.249, iLow: 201, iHigh: 300 },
  { cLow: 1.250, cHigh: 1.649, iLow: 301, iHigh: 400 },
  { cLow: 1.650, cHigh: 2.049, iLow: 401, iHigh: 500 },
];

// O3 breakpoints in ppm — 8H standard (AQI 0–300) extended with 1H standard (AQI 301–500)
// per EPA AQI Technical Assistance Document
const O3_BREAKPOINTS_8H = [
  { cLow: 0.000, cHigh: 0.054, iLow: 0,   iHigh: 50  },
  { cLow: 0.055, cHigh: 0.070, iLow: 51,  iHigh: 100 },
  { cLow: 0.071, cHigh: 0.085, iLow: 101, iHigh: 150 },
  { cLow: 0.086, cHigh: 0.105, iLow: 151, iHigh: 200 },
  { cLow: 0.106, cHigh: 0.200, iLow: 201, iHigh: 300 },
  // 1H standard proxy for hazardous levels
  { cLow: 0.201, cHigh: 0.404, iLow: 301, iHigh: 400 },
  { cLow: 0.405, cHigh: 0.604, iLow: 401, iHigh: 500 },
];

function linearScale(c, bp) {
  const segment = bp.find((b) => c >= b.cLow && c <= b.cHigh);
  if (!segment) return c > bp[bp.length - 1].cHigh ? 500 : 0;
  return Math.round(
    ((segment.iHigh - segment.iLow) / (segment.cHigh - segment.cLow)) *
      (c - segment.cLow) +
      segment.iLow
  );
}

function calcAQI(reading) {
  const indices = [];

  if (reading.pm25 != null) {
    const v = linearScale(parseFloat(reading.pm25), PM25_BREAKPOINTS);
    indices.push({ value: v, pollutant: 'pm25' });
  }
  if (reading.pm10 != null) {
    const v = linearScale(parseFloat(reading.pm10), PM10_BREAKPOINTS);
    indices.push({ value: v, pollutant: 'pm10' });
  }
  if (reading.co != null) {
    const v = linearScale(parseFloat(reading.co), CO_BREAKPOINTS);
    indices.push({ value: v, pollutant: 'co' });
  }
  if (reading.no2 != null) {
    const v = linearScale(parseFloat(reading.no2), NO2_BREAKPOINTS);
    indices.push({ value: v, pollutant: 'no2' });
  }
  if (reading.o3 != null) {
    const v = linearScale(parseFloat(reading.o3), O3_BREAKPOINTS_8H);
    indices.push({ value: v, pollutant: 'o3' });
  }

  if (!indices.length) return { aqi: 0, primaryPollutant: null };

  const dominant = indices.reduce((a, b) => (a.value > b.value ? a : b));
  return { aqi: dominant.value, primaryPollutant: dominant.pollutant };
}

function aqiCategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

module.exports = { calcAQI, aqiCategory };
