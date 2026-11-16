// Prayer times, worked out from the sun's position for a place and a day.
// Method: Egyptian General Authority of Survey (Fajr at 19.5°, Isha at 17.5°, Asr when a shadow
// equals its object's length plus the noon shadow). Accurate to about a minute.
// The same code runs in the Supabase notify function (supabase/functions/notify/index.ts).

export const CAIRO = { name: 'Cairo', lat: 30.0444, lng: 31.2357, timeZone: 'Africa/Cairo' };
export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

const rad = (degrees) => (degrees * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;
const fixAngle = (angle) => angle - 360 * Math.floor(angle / 360);
const fixHour = (hour) => hour - 24 * Math.floor(hour / 24);

// Where the sun is on a Julian day: its declination and the equation of time (in hours).
function sun(jd) {
  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const l = fixAngle(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)));
  const e = 23.439 - 0.00000036 * d;
  const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15;
  return {
    declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))),
    equation: q / 15 - fixHour(ra),
  };
}

function julian(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

// Minutes the time zone is ahead of UTC on that day (Egypt moves its clocks in summer).
export function zoneOffsetMinutes(timeZone, year, month, day) {
  const noonUtc = Date.UTC(year, month - 1, day, 12);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(noonUtc)).map((part) => [part.type, part.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((local - noonUtc) / 60000);
}

/**
 * The five prayer times for a day (YYYY-MM-DD) as minutes after local midnight, plus sunrise.
 * adjust: optional minutes to add to each prayer, for example { fajr: 2 } to match your mosque.
 */
export function prayerTimes(day, place = CAIRO, adjust = {}) {
  const [year, month, date] = day.split('-').map(Number);
  const zone = zoneOffsetMinutes(place.timeZone, year, month, date) / 60;
  const jd = julian(year, month, date) - place.lng / (15 * 24);

  // Each time is worked out twice: once from a first guess, then from that answer, for accuracy.
  const noonAt = (fraction) => fixHour(12 - sun(jd + fraction).equation);
  const angleTime = (angle, fraction, before) => {
    const { declination } = sun(jd + fraction);
    const noon = noonAt(fraction);
    const cos = (-Math.sin(rad(angle)) - Math.sin(rad(declination)) * Math.sin(rad(place.lat)))
      / (Math.cos(rad(declination)) * Math.cos(rad(place.lat)));
    const t = deg(Math.acos(Math.max(-1, Math.min(1, cos)))) / 15;
    return noon + (before ? -t : t);
  };
  const asrTime = (fraction) => {
    const { declination } = sun(jd + fraction);
    const angle = -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(place.lat - declination))))));
    return angleTime(angle, fraction, false);
  };

  const guess = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  let times = guess;
  for (let round = 0; round < 2; round++) {
    const f = Object.fromEntries(Object.entries(times).map(([name, hour]) => [name, hour / 24]));
    times = {
      fajr: angleTime(19.5, f.fajr, true),
      sunrise: angleTime(0.833, f.sunrise, true),
      dhuhr: noonAt(f.dhuhr),
      asr: asrTime(f.asr),
      maghrib: angleTime(0.833, f.maghrib, false),
      isha: angleTime(17.5, f.isha, false),
    };
  }

  // From the sun's own clock to your local clock.
  const result = {};
  for (const [name, hour] of Object.entries(times)) {
    const local = hour + zone - place.lng / 15;
    result[name] = Math.round(fixHour(local) * 60) + (Number(adjust[name]) || 0);
  }
  return result;
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return new Date(2000, 0, 1, hours, mins).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
