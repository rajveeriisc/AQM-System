// WHO/EPA thresholds and status levels for each pollutant

export const GAS_META = {
  pm25: {
    label: 'PM2.5',
    unit: 'µg/m³',
    chip: 'SPS30',
    max: 250,
    warn: 35.4,
    crit: 55.4,
    whoGuideline: 15, // 24h WHO 2021
    description: 'Fine particulate matter (≤2.5µm). Penetrates deep into lungs and bloodstream.',
    healthImpact: 'Long-term exposure causes cardiovascular and respiratory disease. Increases risk of lung cancer.',
  },
  pm10: {
    label: 'PM10',
    unit: 'µg/m³',
    chip: 'SPS30',
    max: 500,
    warn: 154,
    crit: 254,
    whoGuideline: 45,
    description: 'Coarse particulate matter (≤10µm). Causes respiratory irritation.',
    healthImpact: 'Causes coughing, wheezing, and aggravates asthma. Long-term exposure affects lung function.',
  },
  co: {
    label: 'CO',
    unit: 'ppm',
    chip: 'ZE07-CO',
    max: 50,
    warn: 9.0,
    crit: 35.0,
    whoGuideline: 4,
    description: 'Carbon monoxide. Odourless, colourless, toxic gas from incomplete combustion.',
    healthImpact: 'Reduces blood oxygen capacity. High exposure causes headaches, dizziness, death.',
  },
  no2: {
    label: 'NO₂',
    unit: 'ppm',
    chip: 'GM-102B',
    max: 2.0,
    warn: 0.053,
    crit: 0.100,
    whoGuideline: 0.025,
    description: 'Nitrogen dioxide. Mainly from vehicle exhaust and power plants.',
    healthImpact: 'Inflames airways, worsens asthma and respiratory infections.',
  },
  co2: {
    label: 'CO₂',
    unit: 'ppm',
    chip: 'SCD4x',
    max: 5000,
    warn: 800,
    crit: 1200,
    whoGuideline: 1000,
    description: 'Carbon dioxide. Indicator of ventilation quality indoors.',
    healthImpact: 'Above 1000ppm causes drowsiness and impaired decision-making.',
  },
  o3: {
    label: 'O₃',
    unit: 'ppm',
    chip: 'ZE25A-O3',
    max: 0.5,
    warn: 0.07,
    crit: 0.085,
    whoGuideline: 0.06,
    description: 'Ground-level ozone. Formed by sunlight reacting with pollutants.',
    healthImpact: 'Irritates lungs, reduces lung function, worsens asthma.',
  },
  voc: {
    label: 'VOC',
    unit: 'index',
    chip: 'SGP41',
    max: 500,
    warn: 100,
    crit: 200,
    whoGuideline: 100,
    description: 'Volatile organic compounds. Index from SGP40 sensor.',
    healthImpact: 'Causes eye, nose, throat irritation. Some VOCs are carcinogenic.',
  },
};

// pm25/pm10 removed — no particle sensor in this hardware (SCD4x + ZE07 + ZE25A + GM-102B + SGP41)
export const GAS_KEYS = ['co', 'no2', 'co2', 'o3', 'voc'];

export function getStatus(pollutant, value) {
  if (value == null || value < 0) return { level: 'Unknown', color: '#6B7280', badge: 'UNKN' };
  const meta = GAS_META[pollutant];
  if (!meta) return { level: 'Unknown', color: '#6B7280', badge: 'UNKN' };

  if (value < meta.warn) return { level: 'Good', color: '#22C55E', badge: 'GOOD' };
  if (value < meta.crit) return { level: 'Moderate', color: '#EAB308', badge: 'MOD' };
  return { level: 'Poor', color: '#EF4444', badge: 'POOR' };
}

export function aqiColor(aqi) {
  if (aqi == null) return '#6B7280';
  if (aqi <= 50) return '#22C55E';
  if (aqi <= 100) return '#EAB308';
  if (aqi <= 150) return '#F97316';
  if (aqi <= 200) return '#EF4444';
  if (aqi <= 300) return '#A855F7';
  return '#7F1D1D';
}

export function aqiLabel(aqi) {
  if (aqi == null) return 'Unknown';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}
