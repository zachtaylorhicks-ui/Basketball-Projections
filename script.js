// script.js (v20.2 - Final Polish)

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let loadedSeasonDataCache = {};
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;
const STAT_CONFIG = { PTS: { zKey: "z_PTS" }, REB: { zKey: "z_REB" }, AST: { zKey: "z_AST" }, STL: { zKey: "z_STL" }, BLK: { zKey: "z_BLK" }, '3PM': { zKey: "z_3PM" }, TOV: { zKey: "z_TOV" }, FG_impact: { name: "FG% Impact", zKey: "z_FG_impact" }, FT_impact: { name: "FT% Impact", zKey: "z_FT_impact" } };
const STAT_KEYS_MAIN = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TOV"];
const STAT_KEYS_IMPACT = ["FG_impact", "FT_impact"];
const ALL_STAT_KEYS = [...STAT_KEYS_MAIN, ...STAT_KEYS_IMPACT];

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    initializeTheme();
    try {
        const response = await fetch("predictions.json");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullData = await response.json();
        document.getElementById("last-updated").textContent = new Date(fullData.lastUpdated).toLocaleString();
        
        initializeSeasonTab();
        initializeDailyTab();
        initializeTeamAnalysisTab();

        document.body.addEventListener('click', handlePlayerLinkClick);
    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.body.innerHTML = `<div style="text-align:center; padding: 50px; font-size:1.2em;">Error: Could not load projection data. ${e.message}</div>`;
    }
});

function initializeTheme() {
    const themeSwitcher = document.querySelector('.theme-switcher');
    const doc = document.documentElement;
    const storedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    doc.setAttribute('data-theme', storedTheme);
    themeSwitcher?.addEventListener('click', () => {
        const newTheme = doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        doc.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

function openTab(evt, tabName) {
    document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
    document.querySelectorAll(".tab-link").forEach(link => link.classList.remove("active"));
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

// --- PLAYER PROFILE MODAL ---
function handlePlayerLinkClick(e) {
    const link = e.target.closest('.player-link');
    if (!link) return;
    e.preventDefault();
    const personId = parseInt(link.dataset.personId, 10);
    const profile = fullData.playerProfiles?.[personId];
    if (!profile) return;
    
    let playerHistory = [];
    if (fullData.dailyGamesByDate) {
         playerHistory = Object.entries(fullData.dailyGamesByDate).flatMap(([date, games]) => 
            games.map(game => ({...game, date})) // Add date to each game
         )
            .filter(game => game.grade?.isGraded)
            .map(game => {
                const playerProj = game.projections.flatMap(p => p.players).find(p => (p.Player_ID || p.personId) === personId);
                const playerActual = game.grade.playerActuals?.[personId];
                if (playerProj && playerActual) {
                    return { date: game.date, predicted: playerProj, actual: playerActual };
                }
                return null;
            }).filter(Boolean);
    }
    showPlayerProfileOverlay(profile, playerHistory);
}

function showPlayerProfileOverlay(profile, history) {
    const overlay = document.getElementById("player-profile-overlay");
    overlay.innerHTML = buildPlayerProfileModalHTML(profile, history);
    overlay.classList.add("visible");
    
    if (history.length > 0) {
        renderPlayerChart(history);
    }

    const closeModal = () => overlay.classList.remove("visible");
    overlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
}

function buildPlayerProfileModalHTML(profile, history) {
    return `
    <div class="grade-modal player-modal">
        <div class="modal-header">
            <h2>${profile.name}</h2>
            <button class="modal-close">×</button>
        </div>
        <div class="player-profile-grid">
            <div class="profile-sidebar">
                <div class="profile-info-grid">
                    <div class="profile-info-item"><div class="profile-info-label">Position</div><div class="profile-info-value">${profile.position || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Height</div><div class="profile-info-value">${profile.height || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Team</div><div class="profile-info-value">${profile.team || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Draft Info</div><div class="profile-info-value">${profile.draftInfo || 'N/A'}</div></div>
                </div>
            </div>
            <div class="profile-main">
                <h3>Performance History (Predicted vs Actual)</h3>
                ${history.length > 0 ? '<div class="chart-wrapper" style="height:250px;"><canvas id="player-perf-chart"></canvas></div>' : '<p>No graded game history available to chart.</p>'}
            </div>
        </div>
    </div>`;
}

function renderPlayerChart(history) {
    const ctx = document.getElementById('player-perf-chart')?.getContext('2d');
    if (!ctx) return;
    const labels = history.map(h => new Date(h.date));
    const predPts = history.map(h => h.predicted.points);
    const actualPts = history.map(h => h.actual.PTS);
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Actual PTS', data: actualPts, borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)', tension: 0.1, pointRadius: 4 },
                { label: 'Predicted PTS', data: predPts, borderColor: 'var(--text-secondary)', tension: 0.1, borderDash: [5, 5], pointRadius: 4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' } } } }
    });
}

// --- DATA FETCHING UTILITY ---
async function fetchSeasonData(key) {
    if (loadedSeasonDataCache[key]) return loadedSeasonDataCache[key];
    try {
        const response = await fetch(`data/${key}.json`);
        if (!response.ok) throw new Error(`File not found for key: ${key}`);
        const data = await response.json();
        loadedSeasonDataCache[key] = data;
        return data;
    } catch (e) {
        console.error(e);
        return null;
    }
}

// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    const selector = document.getElementById("data-source-selector");
    selector.innerHTML = Object.entries(fullData.seasonLongDataManifest)
        .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
        .map(([key, { label }]) => `<option value="${key}">${label}</option>`).join('');
    
    const catGrid = document.getElementById("category-weights-grid");
    catGrid.innerHTML = ALL_STAT_KEYS.map(key => `
        <div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${STAT_CONFIG[key].name || key}</label></div>
    `).join('');

    document.getElementById("season-controls")?.addEventListener("change", renderSeasonTable);
    document.getElementById("predictions-thead")?.addEventListener("click", handleSortSeason);
    renderSeasonTable();
}

async function renderSeasonTable() {
    const settings = {
        sourceKey: document.getElementById("data-source-selector").value,
        showCount: parseInt(document.getElementById("show-count").value, 10),
        searchTerm: document.getElementById("search-player").value.toLowerCase().trim(),
        activeCategories: new Set(Array.from(document.querySelectorAll("#category-weights-grid input:checked")).map(cb => cb.dataset.key))
    };

    const tbody = document.getElementById("predictions-tbody");
    tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;">Loading data...</td></tr>`;

    let data = await fetchSeasonData(settings.sourceKey);
    if (!data) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center; color: var(--danger-color);">Could not load data for this source.</td></tr>`;
        return;
    }

    let processedData = data.map(player => {
        let customZScore = 0;
        settings.activeCategories.forEach(catKey => { customZScore += player[STAT_CONFIG[catKey].zKey] || 0; });
        return { ...player, custom_z_score: customZScore };
    });

    if (settings.searchTerm) {
        processedData = processedData.filter(p => p.playerName?.toLowerCase().includes(settings.searchTerm));
    }
    
    currentSort.data = processedData;
    sortSeasonData();
    renderSeasonTableBody(settings.showCount);
}

function handleSortSeason(e) {
    const sortKey = e.target.closest("th")?.dataset.sortKey;
    if (!sortKey) return;
    if (currentSort.column === sortKey) {
        currentSort.direction = currentSort.direction === "desc" ? "asc" : "desc";
    } else {
        currentSort.column = sortKey;
        currentSort.direction = ["playerName", "pos", "team"].includes(sortKey) ? "asc" : "desc";
    }
    sortSeasonData();
    renderSeasonTableBody(parseInt(document.getElementById("show-count").value, 10));
}

function sortSeasonData() {
    const { column, direction, data } = currentSort;
    if (!data) return;
    const mod = direction === "asc" ? 1 : -1;
    const getSortVal = (p, c) => p[c] ?? p[c.toLowerCase()] ?? 0;
    data.sort((a, b) => {
        let valA = getSortVal(a, column), valB = getSortVal(b, column);
        if (typeof valA === 'string') return valA.localeCompare(valB) * mod;
        return (valA - valB) * mod;
    });
}

function renderSeasonTableBody(showCount) {
    const thead = document.getElementById("predictions-thead");
    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];

    const headerRow = `<tr>
        <th data-sort-key="rank">R#</th>
        <th data-sort-key="playerName">PLAYER</th>
        <th data-sort-key="pos">POS</th>
        <th data-sort-key="team">TEAM</th>
        <th data-sort-key="GP">GP</th>
        <th data-sort-key="MIN">MPG</th>
        ${STAT_KEYS_MAIN.map(k => `<th data-sort-key="${k}">${k}</th>`).join('')}
        <th data-sort-key="FG_impact">FG%</th>
        <th data-sort-key="FT_impact">FT%</th>
        <th data-sort-key="custom_z_score">TOTAL</th>
    </tr>`;
    thead.innerHTML = headerRow;
    
    if (!dataToRender.length) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;">No players match your criteria.</td></tr>`;
        return;
    }

    const getVal = (p, c) => p[c] ?? p[c.toLowerCase()] ?? 0;
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    
    tbody.innerHTML = dataToRender.map((p, i) => {
        const nameHtml = `<a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a>`;
        const statCells = STAT_KEYS_MAIN.map(key => {
            const zKey = STAT_CONFIG[key].zKey;
            return `<td class="stat-cell"><div class="color-cell-bg ${getZClass(p[zKey])}"><span class="stat-value">${getVal(p, key).toFixed(1)}</span><span class="z-score-value">${(p[zKey] || 0).toFixed(2)}</span></div></td>`;
        }).join('');
        const impactCells = STAT_KEYS_IMPACT.map(key => {
             const zKey = STAT_CONFIG[key].zKey;
             return `<td class="stat-cell"><div class="color-cell-bg ${getZClass(p[zKey])}"><span class="stat-value">${getVal(p, key).toFixed(2)}</span><span class="z-score-value">${(p[zKey] || 0).toFixed(2)}</span></div></td>`;
        }).join('');
        return `<tr><td>${i + 1}</td><td>${nameHtml}</td><td>${p.pos || 'N/A'}</td><td>${p.team || 'N/A'}</td><td>${p.GP || 0}</td><td>${getVal(p, 'MIN').toFixed(1)}</td>${statCells}${impactCells}<td>${p.custom_z_score.toFixed(2)}</td></tr>`;
    }).join('');
}

// --- DAILY PROJECTIONS TAB ---
function initializeDailyTab() {
    document.getElementById("accuracy-metric-selector")?.addEventListener('change', renderAccuracyChart);
    const dateTabs = document.getElementById("daily-date-tabs");
    const sortedDates = Object.keys(fullData.dailyGamesByDate || {}).sort((a, b) => new Date(b) - new Date(a));
    if (!sortedDates.length) {
        document.getElementById("daily-games-container").innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
        return;
    }
    dateTabs.innerHTML = sortedDates.map((date, i) => `<button class="date-tab ${i === 0 ? 'active' : ''}" data-date="${date}">${new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</button>`).join('');
    dateTabs.addEventListener("click", e => {
        const tab = e.target.closest(".date-tab");
        if (tab) {
            document.querySelectorAll(".date-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            renderDailyGamesForDate(tab.dataset.date);
        }
    });
    document.getElementById("daily-controls").addEventListener('click', e => {
        if(e.target.id === 'toggle-advanced-stats') document.getElementById('daily-games-container').classList.toggle('show-advanced');
    });

    renderAccuracyChart();
    renderDailyGamesForDate(sortedDates[0]);
}

function renderDailyGamesForDate(date) {
    const container = document.getElementById("daily-games-container");
    container.innerHTML = (fullData.dailyGamesByDate[date] || []).map(game => {
        const [team1, team2] = game.projections;
        let scoreHTML = `Predicted: <strong>${team1.totalPoints}-${team2.totalPoints}</strong>`;
        if (game.grade?.isGraded) {
            const actual1 = game.grade.gameSummary.actual[team1.teamName];
            const actual2 = game.grade.gameSummary.actual[team2.teamName];
            scoreHTML += ` | Actual: <strong class="actual-score">${actual1}-${actual2}</strong>`;
        }
        return `
        <div class="matchup-card">
            <div class="matchup-header">
                <div class="matchup-title">
                    <span class="matchup-teams">${team1.teamName} (${team1.winProb}%) vs ${team2.teamName} (${team2.winProb}%)</span>
                    <span class="matchup-scores">${scoreHTML}</span>
                </div>
            </div>
            <div class="matchup-body">
                ${createTeamTableHTML(team1, game.grade)}
                ${createTeamTableHTML(team2, game.grade)}
            </div>
        </div>`;
    }).join('');
}

function createTeamTableHTML(teamData, gameGrade) {
    const isGraded = gameGrade?.isGraded;
    const getPerfIndicator = (pred, actual) => {
        const diff = Math.abs(pred - actual);
        const relativeError = diff / (actual || pred || 1);
        if (relativeError < 0.20) return 'pi-good';
        if (relativeError > 0.60 && diff > 3) return 'pi-bad';
        return 'pi-neutral';
    };

    const playersHtml = teamData.players
        .sort((a, b) => (b.Predicted_Minutes || 0) - (a.Predicted_Minutes || 0))
        .map(p => {
            const pId = p.Player_ID || p.personId;
            const actuals = isGraded ? gameGrade.playerActuals?.[pId] : null;
            const nameHtml = `<a href="#" class="player-link" data-person-id="${pId}">${p.Player_Name}</a>`;
            const predRow = `
                <tr class="player-row-pred">
                    <td rowspan="${isGraded ? 2 : 1}" class="player-name-cell">${nameHtml}</td>
                    ${isGraded ? '<td class="stat-type-cell">P</td>' : ''}
                    <td>${(p.Predicted_Minutes || 0).toFixed(1)}</td>
                    <td>${(p.points || 0).toFixed(1)}</td>
                    <td>${(p.reb || 0).toFixed(1)}</td>
                    <td>${(p.ast || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.stl || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.blk || 0).toFixed(1)}</td>
                </tr>`;
            const actualRow = isGraded && actuals ? `
                <tr class="player-row-actual">
                    <td class="stat-type-cell">A</td>
                    <td>-</td>
                    <td>${(actuals.PTS).toFixed(1)}<span class="performance-indicator ${getPerfIndicator(p.points, actuals.PTS)}"></span></td>
                    <td>${(actuals.REB).toFixed(1)}<span class="performance-indicator ${getPerfIndicator(p.reb, actuals.REB)}"></span></td>
                    <td>${(actuals.AST).toFixed(1)}<span class="performance-indicator ${getPerfIndicator(p.ast, actuals.AST)}"></span></td>
                    <td class="advanced-stat">${(actuals.STL).toFixed(1)}<span class="performance-indicator ${getPerfIndicator(p.stl, actuals.STL)}"></span></td>
                    <td class="advanced-stat">${(actuals.BLK).toFixed(1)}<span class="performance-indicator ${getPerfIndicator(p.blk, actuals.BLK)}"></span></td>
                </tr>` : isGraded ? `<tr class="player-row-actual"><td class="stat-type-cell">A</td><td colspan="6" style="text-align:center;">DNP</td></tr>` : '';
            return predRow + actualRow;
        }).join('');

    return `
        <div class="team-box-score">
            <h3 class="team-header">${teamData.teamName}</h3>
            <div class="table-container" style="max-height:none; overflow:visible;">
                <table class="daily-table">
                    <thead><tr><th style="text-align:left;">Player</th>${isGraded ? '<th></th>' : ''}<th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th class="advanced-stat">STL</th><th class="advanced-stat">BLK</th></tr></thead>
                    <tbody>${playersHtml}</tbody>
                </table>
            </div>
        </div>`;
}

function renderAccuracyChart() {
    const container = document.getElementById("accuracy-chart-container");
    const chartCanvas = document.getElementById('accuracy-chart');
    if (!container || !chartCanvas || !fullData.historicalGrades || fullData.historicalGrades.length < 1) {
        if(container) container.style.display = 'none'; return;
    }
    container.style.display = 'block';
    
    const ctx = chartCanvas.getContext('2d');
    const metric = document.getElementById('accuracy-metric-selector').value;
    const gradesByDate = fullData.historicalGrades.reduce((acc, g) => {
        (acc[g.date] = acc[g.date] || []).push(g);
        return acc;
    }, {});
    const sortedDates = Object.keys(gradesByDate).sort((a,b) => new Date(a) - new Date(b));

    let chartConfig;
    switch(metric) {
        case 'cumulativeWinLoss':
            let wins = 0, total = 0;
            const cumulativeData = sortedDates.map(date => {
                wins += gradesByDate[date].reduce((sum, g) => sum + g.correctWinner, 0);
                total += gradesByDate[date].length;
                return { x: new Date(date), y: total > 0 ? (wins / total) * 100 : 0 };
            });
            chartConfig = { type: 'line', data: { datasets: [{ label: 'Cumulative W/L %', data: cumulativeData, borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)' }] }, options: { scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, x: { type: 'time', time: { unit: 'day' } } } } };
            break;
        case 'dailyWinLoss':
            const dailyData = sortedDates.map(date => (gradesByDate[date].reduce((sum, g) => sum + g.correctWinner, 0) / gradesByDate[date].length) * 100);
            chartConfig = { type: 'bar', data: { labels: sortedDates.map(d => new Date(d+"T00:00:00").toLocaleDateString('en-US', {month:'short', day:'numeric'})), datasets: [{ label: 'Daily W/L Accuracy', data: dailyData, backgroundColor: 'var(--primary-color)' }] }, options: { scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } } } };
            break;
        default: // MAE or scoreCloseness
            const barData = sortedDates.map(date => {
                const values = gradesByDate[date].map(g => metric === 'scoreCloseness' ? g.scoreCloseness : g.statErrors[metric]);
                return values.reduce((a, b) => a + b, 0) / values.length;
            });
            chartConfig = { type: 'bar', data: { labels: sortedDates.map(d => new Date(d+"T00:00:00").toLocaleDateString('en-US', {month:'short', day:'numeric'})), datasets: [{ label: `Avg Daily ${metric}`, data: barData, backgroundColor: 'var(--primary-color)' }] } };
    }

    if (accuracyChartInstance) accuracyChartInstance.destroy();
    accuracyChartInstance = new Chart(ctx, { ...chartConfig, options: { ...chartConfig.options, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

// --- TEAM ANALYSIS TAB ---
function initializeTeamAnalysisTab() {
    const selector = document.getElementById("team-analysis-source-selector");
    selector.innerHTML = Object.entries(fullData.seasonLongDataManifest)
        .filter(([key]) => key.endsWith('per_game'))
        .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
        .map(([key, { label }]) => `<option value="${key}">${label.replace(' (Per Game)', '')}</option>`).join('');
    selector.addEventListener('change', renderTeamAnalysis);
    renderTeamAnalysis();
}

async function renderTeamAnalysis() {
    const container = document.getElementById("team-analysis-container");
    container.innerHTML = '<div class="card"><p>Loading team data...</p></div>';
    const sourceKey = document.getElementById("team-analysis-source-selector").value;
    const data = await fetchSeasonData(sourceKey);
    if (!data) {
        container.innerHTML = '<div class="card"><p style="color:var(--danger-color)">Could not load data for this source.</p></div>';
        return;
    }
    
    const dataWithZ = data.map(player => {
        let customZScore = 0;
        STAT_KEYS_MAIN.forEach(key => { customZScore += player[STAT_CONFIG[key].zKey] || 0; });
        return { ...player, custom_z_score: customZScore };
    });

    const teams = dataWithZ.reduce((acc, p) => {
        const teamName = p.team || 'Free Agents';
        (acc[teamName] = acc[teamName] || []).push(p);
        return acc;
    }, {});

    container.innerHTML = Object.entries(teams).sort(([teamA], [teamB]) => {
        const strengthA = teams[teamA].reduce((s,p) => s + p.custom_z_score, 0);
        const strengthB = teams[teamB].reduce((s,p) => s + p.custom_z_score, 0);
        return strengthB - strengthA;
    }).map(([teamName, players]) => {
        const teamStrength = players.reduce((sum, p) => sum + p.custom_z_score, 0);
        const playerRows = players.sort((a,b) => b.custom_z_score - a.custom_z_score).map(p => `
            <tr>
                <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td>
                <td>${p.GP}</td><td>${(p.MIN || 0).toFixed(1)}</td><td>${p.PTS.toFixed(1)}</td><td>${p.REB.toFixed(1)}</td><td>${p.AST.toFixed(1)}</td><td>${p.custom_z_score.toFixed(2)}</td>
            </tr>`).join('');
        return `
            <div class="team-card">
                <div class="team-card-header">
                    <h3>${teamName}</h3>
                    <div class="team-strength-score" title="Sum of Player Z-Scores">${teamStrength.toFixed(2)}</div>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>Score</th></tr></thead>
                        <tbody>${playerRows}</tbody>
                    </table>
                </div>
            </div>`;
    }).join('');
}