/*
   VISION-FOOTBALL — API-SPORTS cards (fixture, team, combined standings table)
   + the team and fixture detail panels.
*/

import { PALETTE, BACKEND, esc, fmtDate } from "./vision-shared.js";

// data-league / data-season carry the league context so a clicked team can load its table + fixtures.
function leagueContextAttrs(league, season) {
  return `${league != null ? ` data-league="${esc(league)}"` : ""}${season != null ? ` data-season="${esc(season)}"` : ""}`;
}

/* ---------- cards ---------- */

export function fixtureCard(c) {
  return `
    <div class="card card--fixture"${c.id != null ? ` data-fixture-id="${esc(c.id)}"` : ""}${leagueContextAttrs(c.league_id, c.season)}>
      <div class="league">${esc(c.league)}</div>
      <div class="matchup">
        <div class="team">
          ${c.home_logo ? `<img class="crest" src="${esc(c.home_logo)}" alt="" loading="lazy" />` : ""}
          <span>${esc(c.home)}</span>
        </div>
        <div class="score">${c.home_goals ?? "-"} : ${c.away_goals ?? "-"}</div>
        <div class="team">
          ${c.away_logo ? `<img class="crest" src="${esc(c.away_logo)}" alt="" loading="lazy" />` : ""}
          <span>${esc(c.away)}</span>
        </div>
      </div>
      <div class="status">${esc(c.status)}</div>
    </div>`;
}

export function teamCard(c) {
  return `
    <div class="card card--team"${c.id != null ? ` data-team-id="${esc(c.id)}"` : ""}>
      ${c.logo ? `<img class="crest crest--lg" src="${esc(c.logo)}" alt="" loading="lazy" />` : ""}
      <div class="body">
        <h3>${esc(c.name)}</h3>
        <p class="meta">${esc(c.country)}${c.founded ? ` · est. ${esc(c.founded)}` : ""}</p>
        ${c.venue ? `<p class="meta">${esc(c.venue)}</p>` : ""}
      </div>
    </div>`;
}

/** All standing rows of a payload render as ONE table card. */
export function standingsCard(rows) {
  const body = rows.map(r => `
    <tr${r.team_id != null ? ` class="clickable" data-team-id="${esc(r.team_id)}"${leagueContextAttrs(r.league_id, r.season)}` : ""}>
      <td>${esc(r.rank)}</td>
      <td class="team-name">${esc(r.team)}</td>
      <td>${esc(r.played)}</td>
      <td>${esc(r.win)}</td>
      <td>${esc(r.draw)}</td>
      <td>${esc(r.lose)}</td>
      <td>${esc(r.goals_diff)}</td>
      <td class="pts">${esc(r.points)}</td>
    </tr>`).join("");
  return `
    <div class="card card--standings">
      <table>
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/* ---------- detail panels ---------- */

function fixtureRow(f) {
  return `
    <div class="frow" data-fixture-id="${esc(f.id)}"${leagueContextAttrs(f.league_id, f.season)}>
      <span class="fdate">${esc(fmtDate(f.date))}</span>
      <span class="fteam">${esc(f.home)}</span>
      <b class="fscore">${f.home_goals ?? "-"} : ${f.away_goals ?? "-"}</b>
      <span class="fteam">${esc(f.away)}</span>
      <span class="fstat">${esc(f.league)}</span>
    </div>`;
}

const EVENT_ICON = (e) =>
  e.type === "Goal" ? "⚽" :
  e.type === "Card" ? (/red/i.test(e.detail || "") ? "🟥" : "🟨") :
  e.type === "subst" ? "🔁" : e.type === "Var" ? "📺" : "•";

function teamPanelHtml(d) {
  const meta = [d.country, d.founded ? `est. ${d.founded}` : "", d.venue].filter(Boolean).join("  ·  ");
  const rows = (d.standings || []).map(r => `
    <tr${r.team_id === d.id ? ' class="me"' : ` class="clickable" data-team-id="${esc(r.team_id)}"${leagueContextAttrs(r.league_id, r.season)}`}>
      <td>${esc(r.rank)}</td><td class="team-name">${esc(r.team)}</td><td>${esc(r.played)}</td>
      <td>${esc(r.win)}</td><td>${esc(r.draw)}</td><td>${esc(r.lose)}</td><td>${esc(r.goals_diff)}</td><td class="pts">${esc(r.points)}</td>
    </tr>`).join("");
  return `
    <div class="d-top d-top--team">
      ${d.logo ? `<img class="crest crest--xl" src="${esc(d.logo)}" alt="" />` : ""}
      <div class="d-info"><h2>${esc(d.name)}</h2><div class="d-meta">${esc(meta)}</div></div>
    </div>
    ${d.recent?.length ? `<h4>RECENT MATCHES</h4><div class="flist">${d.recent.map(fixtureRow).join("")}</div>` : ""}
    ${d.upcoming?.length ? `<h4>UPCOMING</h4><div class="flist">${d.upcoming.map(fixtureRow).join("")}</div>` : ""}
    ${rows ? `<h4>LEAGUE TABLE</h4>
      <table class="dtable"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${!d.recent?.length && !d.upcoming?.length && !rows ? `<div class="msg">NO MORE VISIONS FOR THIS TEAM</div>` : ""}`;
}

function fixturePanelHtml(d) {
  const ctx = leagueContextAttrs(d.league_id, d.season);
  const side = (id, name, logo) => `
    <div class="fp-team"${id != null ? ` data-team-id="${esc(id)}"${ctx}` : ""}>
      ${logo ? `<img class="crest crest--lg" src="${esc(logo)}" alt="" />` : ""}<span>${esc(name)}</span>
    </div>`;
  const ht = d.halftime && (d.halftime.home != null) ? `HT ${d.halftime.home}:${d.halftime.away}` : "";
  const meta = [d.league, fmtDate(d.date), d.venue, d.referee ? `Ref: ${d.referee}` : "", ht].filter(Boolean).join("  ·  ");
  const status = d.elapsed && !/finished/i.test(d.status || "") ? `${d.status} · ${d.elapsed}'` : d.status;

  const events = (d.events || []).map(e => `
    <div class="ev ${e.team_id === d.home_id ? "ev--home" : "ev--away"}">
      <span class="ev-min">${esc(e.minute)}'</span><span>${EVENT_ICON(e)}</span>
      <span>${esc(e.player)} <em>${esc(e.detail)}</em></span>
    </div>`).join("");

  const lineups = (d.lineups || []).map(l => `
    <div class="lineup">
      <b>${esc(l.team)} ${l.formation ? `<em>${esc(l.formation)}</em>` : ""}</b>
      ${l.coach ? `<div class="d-meta">Coach: ${esc(l.coach)}</div>` : ""}
      ${(l.start_xi || []).map(p => `<div class="pl"><span>${esc(p.number)}</span>${esc(p.name)}</div>`).join("")}
    </div>`).join("");

  const homeStats = (d.statistics || []).find(x => x.team_id === d.home_id)?.stats || {};
  const awayStats = (d.statistics || []).find(x => x.team_id === d.away_id)?.stats || {};
  const stats = Object.keys(homeStats).map(k => `
    <tr><td>${esc(homeStats[k] ?? "-")}</td><td class="stat-k">${esc(k)}</td><td>${esc(awayStats[k] ?? "-")}</td></tr>`).join("");

  return `
    <div class="fp-head">
      ${side(d.home_id, d.home, d.home_logo)}
      <div class="fp-score"><div>${d.home_goals ?? "-"} : ${d.away_goals ?? "-"}</div><small>${esc(status)}</small></div>
      ${side(d.away_id, d.away, d.away_logo)}
    </div>
    <div class="d-meta fp-meta">${esc(meta)}</div>
    ${events ? `<h4>EVENTS</h4><div class="events">${events}</div>` : ""}
    ${stats ? `<h4>STATISTICS</h4><table class="dtable stats"><tbody>${stats}</tbody></table>` : ""}
    ${lineups ? `<h4>LINEUPS</h4><div class="lineups">${lineups}</div>` : ""}
    ${!events && !stats && !lineups ? `<div class="msg">THE MATCH HOLDS NO MORE SECRETS YET</div>` : ""}`;
}

/** Detail panels: { url(target) -> endpoint, render(data) -> html }. */
export const teamPanel = {
  url: ({ id, league, season }) => {
    const qs = new URLSearchParams();
    if (league) qs.set("league", league);
    if (season) qs.set("season", season);
    return `${BACKEND}/api/v1/football/team/${id}${qs.size ? `?${qs}` : ""}`;
  },
  render: teamPanelHtml,
};

export const fixturePanel = {
  url: ({ id }) => `${BACKEND}/api/v1/football/fixture/${id}`,
  render: fixturePanelHtml,
};

/* Rule order matters here: `tr.me td` and `tr:nth-child(even) td` share a
   specificity, so the panel rules stay BEFORE the generic table rules. */
export const styles = `
        .card--fixture[data-fixture-id], .card--team[data-team-id] { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        .card--fixture[data-fixture-id]:hover, .card--team[data-team-id]:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        tr.clickable { cursor: pointer; } tr.clickable:hover td { background: rgba(53,224,242,0.14); }
        tr.me td { background: rgba(53,224,242,0.22); color: ${PALETTE.text}; }
        .crest--xl { width: 96px; height: 96px; object-fit: contain; }
        .crest--lg { width: 64px; height: 64px; object-fit: contain; }
        .d-top--team { align-items: center; }
        .flist { display: flex; flex-direction: column; gap: 4px; }
        .frow {
          display: grid; grid-template-columns: 96px 1fr 64px 1fr 1.2fr; gap: 10px; align-items: center;
          padding: 8px 12px; font-size: 12px; border: 1px solid transparent; border-radius: 4px; cursor: pointer;
          background: rgba(139,233,253,0.04);
        }
        .frow:hover { border-color: ${PALETTE.border}; background: rgba(53,224,242,0.1); }
        .frow .fdate, .frow .fstat { color: ${PALETTE.textDim}; font-size: 10px; }
        .frow .fteam:first-of-type { text-align: right; }
        .frow .fscore { text-align: center; color: ${PALETTE.accent}; }
        .dtable { border-collapse: collapse; font-size: 12px; width: 100%; max-width: 640px; }
        .dtable td.stat-k { color: ${PALETTE.textDim}; font-size: 10px; letter-spacing: 1px; }
        .fp-head { display: flex; align-items: center; justify-content: center; gap: 28px; margin-top: 22px; }
        .fp-team { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; max-width: 240px; text-align: center; font-size: 14px; }
        .fp-team[data-team-id] { cursor: pointer; } .fp-team[data-team-id]:hover span { color: ${PALETTE.accent}; }
        .fp-score { text-align: center; font-size: 40px; color: ${PALETTE.accent}; font-weight: bold; }
        .fp-score small { display: block; font-size: 11px; color: ${PALETTE.textDim}; font-weight: normal; letter-spacing: 2px; }
        .fp-meta { text-align: center; margin-top: 14px; }
        .events { max-width: 640px; display: flex; flex-direction: column; gap: 3px; }
        .ev { display: grid; grid-template-columns: 44px 26px 1fr; font-size: 12px; padding: 4px 8px; border-left: 2px solid ${PALETTE.border}; }
        .ev--away { border-left-color: transparent; border-right: 2px solid ${PALETTE.border}; }
        .ev-min { color: ${PALETTE.textDim}; } .ev em, .lineup em { color: ${PALETTE.textDim}; font-size: 10px; font-style: normal; }
        .lineups { display: flex; gap: 40px; flex-wrap: wrap; }
        .lineup { min-width: 200px; font-size: 12px; }
        .pl { padding: 2px 0; } .pl span { display: inline-block; width: 28px; color: ${PALETTE.textDim}; }
        @media (max-width: 767px) {
          .frow { grid-template-columns: 1fr 52px 1fr; } .frow .fdate, .frow .fstat { display: none; }
          .fp-head { gap: 10px; } .fp-score { font-size: 28px; }
        }

        .card--fixture { width: 260px; padding: 16px; }
        .card--fixture .league { font-size: 10px; letter-spacing: 2px; color: ${PALETTE.textDim}; margin-bottom: 10px; text-align: center; }
        .card--fixture .matchup { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .card--fixture .team { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; flex: 1; text-align: center; }
        .card--fixture .crest { width: 32px; height: 32px; object-fit: contain; }
        .card--fixture .score { font-size: 20px; color: ${PALETTE.accent}; font-weight: bold; }
        .card--fixture .status { margin-top: 12px; font-size: 10px; text-align: center; color: rgba(230,251,255,0.6); letter-spacing: 1px; }

        .card--team { width: 260px; padding: 20px; display: flex; align-items: center; gap: 16px; }
        .card--team .crest--lg { width: 56px; height: 56px; object-fit: contain; }
        .card--team h3 { font-size: 14px; margin-bottom: 4px; }
        .card--team .meta { font-size: 11px; color: ${PALETTE.textDim}; }

        .card--standings { padding: 18px; max-height: 70vh; overflow-y: auto; }
        table { border-collapse: collapse; font-size: 11px; }
        th, td { padding: 5px 10px; text-align: center; white-space: nowrap; }
        th { color: ${PALETTE.textDim}; letter-spacing: 1px; font-size: 10px; border-bottom: 1px solid rgba(139,233,253,0.25); }
        td.team-name { text-align: left; color: ${PALETTE.text}; }
        td.pts { color: ${PALETTE.accent}; font-weight: bold; }
        tr:nth-child(even) td { background: rgba(139,233,253,0.04); }
`;
