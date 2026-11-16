/*
   VISION-WEATHER — Open-Meteo weather card (current conditions + daily forecast).
*/

import { PALETTE, esc } from "./vision-shared.js";

export function weatherCard(c) {
  const where = [c.place, c.region && c.region !== c.place ? c.region : null, c.country].filter(Boolean).join(", ");
  const days = (c.days || []).map(d => `
    <div class="wx-day">
      <span class="wx-dow">${esc(new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }))}</span>
      <span class="wx-cond">${esc(d.condition || "")}</span>
      <span class="wx-range">${esc(Math.round(d.temp_max))}° / ${esc(Math.round(d.temp_min))}°</span>
      ${d.rain_chance != null ? `<span class="wx-rain">${esc(d.rain_chance)}%</span>` : ""}
    </div>`).join("");
  return `
    <div class="card card--weather">
      <p class="wx-place">${esc(where)}</p>
      <div class="wx-now">
        <span class="wx-temp">${c.temperature != null ? esc(Math.round(c.temperature)) : "–"}°C</span>
        <span class="wx-desc">${esc(c.condition || "")}</span>
      </div>
      <p class="meta">feels ${c.feels_like != null ? esc(Math.round(c.feels_like)) : "–"}° · humidity ${esc(c.humidity ?? "–")}% · wind ${c.wind_kmh != null ? esc(Math.round(c.wind_kmh)) : "–"} km/h</p>
      <div class="wx-days">${days}</div>
    </div>`;
}

export const styles = `
        .card--weather { width: 280px; padding: 18px; }
        .card--weather .wx-place { font-size: 10px; letter-spacing: 2px; color: ${PALETTE.textDim}; text-transform: uppercase; margin-bottom: 10px; }
        .card--weather .wx-now { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
        .card--weather .wx-temp { font-size: 36px; color: ${PALETTE.accent}; font-weight: bold; }
        .card--weather .wx-desc { font-size: 13px; text-transform: capitalize; }
        .card--weather .meta { font-size: 11px; color: ${PALETTE.textDim}; }
        .card--weather .wx-days { margin-top: 14px; border-top: 1px solid ${PALETTE.border}; padding-top: 8px; }
        .card--weather .wx-day { display: grid; grid-template-columns: 34px 1fr auto 34px; gap: 8px; font-size: 11px; padding: 4px 0; align-items: center; }
        .card--weather .wx-cond { text-transform: capitalize; color: ${PALETTE.textDim}; }
        .card--weather .wx-rain { text-align: right; color: ${PALETTE.accent}; }
`;
