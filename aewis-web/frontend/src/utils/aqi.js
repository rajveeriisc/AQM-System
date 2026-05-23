// Frontend AQI calculation (mirrors backend aqiCalc.js)

const PM25_BP = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
];

function linearScale(c, bp) {
  const segment = bp.find((b) => c >= b.cLow && c <= b.cHigh);
  if (!segment) return c > bp[bp.length - 1].cHigh ? 500 : 0;
  return Math.round(
    ((segment.iHigh - segment.iLow) / (segment.cHigh - segment.cLow)) *
      (c - segment.cLow) + segment.iLow
  );
}

export function calcAQI(reading) {
  if (!reading) return 0;
  if (reading.aqi != null) return reading.aqi;
  if (reading.pm25 != null) return linearScale(reading.pm25, PM25_BP);
  return 0;
}
