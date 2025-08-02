// script.js (v21.0 - Career Analysis Edition)

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let loadedSeasonDataCache = {};
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;
let careerChartInstance = null;
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
        initializePlayerProgressionTab();
        initializeCareerAnalysisTab(); // New tab

        document.body.addEventListener('click', handlePlayerLinkClick);
    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.body.innerHTML = `<div style="text-align:center; padding: 50px; font-size:1.2em;">Error: Could not load data. ${e.message}</div>`;
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
async function handlePlayerLinkClick(e) {
    const link = e.target.closest('.player-link');
    if (!link) return;
    e.preventDefault();
    const personId = parseInt(link.dataset.personId, 10);
    const profile = fullData.playerProfiles?.[personId];
    if (!profile) return;
    await showPlayerProfileOverlay(profile);
}

async function showPlayerProfileOverlay(profile) {
    const overlay = document.getElementById("player-profile-overlay");
    overlay.innerHTML = buildPlayerProfileModalHTML(profile);
    overlay.classList.add("visible");
    
    await renderPlayerSeasonChart(profile.personId);

    const closeModal = () => overlay.classList.remove("visible");
    overlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
}

function buildPlayerProfileModalHTML(profile) {
    return `
    <div class="grade-modal player-modal">
        <div class="modal-header"><h2>${profile.name}</h2><button class="modal-close">×</button></div>
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
                <h3>Seasonal Z-Score Performance</h3>
                <div class="chart-wrapper" style="height:250px;"><canvas id="player-season-chart"></canvas></div>
            </div>
        </div>
    </div>`;
}

async function renderPlayerSeasonChart(personId) {
    const ctx = document.getElementById('player-season-chart')?.getContext('2d');
    if (!ctx) return;

    let seasonalData = [];
    const dataSources = Object.keys(fullData.seasonLongDataManifest)
        .filter(key => key.startsWith('actuals_') && key.includes('_full_'));

    for (const key of dataSources) {
        const seasonData = await fetchSeasonData(key);
        const playerData = seasonData?.find(p => p.personId === personId);
        if (playerData) {
            let z_Total = 0;
            STAT_KEYS_MAIN.forEach(stat => { z_Total += playerData[STAT_CONFIG[stat].zKey] || 0; });
            seasonalData.push({
                season: fullData.seasonLongDataManifest[key].label.split(' ')[0],
                z_Total: z_Total
            });
        }
    }
    seasonalData.sort((a,b) => a.season.localeCompare(b.season));

    if (seasonalData.length > 0) {
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: seasonalData.map(d => d.season),
                datasets: [{ label: 'Total Z-Score', data: seasonalData.map(d => d.z_Total), backgroundColor: 'var(--primary-color)' }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    } else {
        ctx.canvas.parentElement.innerHTML = '<p>No historical season data found for this player.</p>';
    }
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
    } catch (e) { console.error(e); return null; }
}


// --- SEASON-LONG, DAILY, TEAM, PROGRESSION TABS (Functions unchanged from v20.3, placed at end for clarity) ---

// --- NEW: PLAYER CAREER ANALYSIS TAB ---
function initializeCareerAnalysisTab() {
    const controls = document.getElementById("career-controls");
    controls?.addEventListener('change', renderCareerChart);
    controls?.querySelector('#career-search-player').addEventListener('input', renderCareerChart);
    renderCareerChart();
}

async function renderCareerChart() {
    const chartWrapper = document.getElementById("career-chart-wrapper");
    if (careerChartInstance) careerChartInstance.destroy();
    chartWrapper.innerHTML = '<canvas id="career-chart"></canvas>'; // Reset canvas
    const ctx = document.getElementById('career-chart').getContext('2d');

    const careerData = await fetchSeasonData('career_data');
    if (!careerData) {
        chartWrapper.innerHTML = `<p style="text-align:center; color: var(--danger-color);">Could not load career analysis data.</p>`;
        return;
    }

    const stat = document.getElementById("career-stat-selector").value;
    const xAxis = document.getElementById("career-xaxis-selector").value;
    const searchTerm = document.getElementById("career-search-player").value.toLowerCase().trim();
    
    let highlightedPlayerId = null;
    if (searchTerm) {
        const foundPlayer = Object.entries(fullData.playerProfiles).find(([id, profile]) => profile.name.toLowerCase().includes(searchTerm));
        if (foundPlayer) highlightedPlayerId = parseInt(foundPlayer[0], 10);
    }
    
    const datasets = [];
    
    // 1. All other players (the "cloud")
    const allPlayersData = Object.entries(careerData.players).flatMap(([id, data]) => {
        if (parseInt(id) === highlightedPlayerId) return []; // Exclude highlighted player from cloud
        return {
            label: `Player ${id}`,
            data: data.map(d => ({ x: d[xAxis], y: d[stat] })),
            borderColor: 'rgba(128, 128, 128, 0.1)',
            borderWidth: 1,
            pointRadius: 0,
            showLine: true
        };
    });
    datasets.push(...allPlayersData);

    // 2. Highlighted Player
    if (highlightedPlayerId && careerData.players[highlightedPlayerId]) {
        datasets.push({
            label: fullData.playerProfiles[highlightedPlayerId].name,
            data: careerData.players[highlightedPlayerId].map(d => ({ x: d[xAxis], y: d[stat] })),
            borderColor: 'var(--warning-color)',
            backgroundColor: 'var(--warning-color)',
            borderWidth: 3,
            pointRadius: 2,
            showLine: true
        });
    }

    // 3. Comparison lines (if player is highlighted)
    if (highlightedPlayerId) {
        const profile = Object.values(await fetchSeasonData('actuals_2024_full_per_game'))
            .find(p => p.personId === highlightedPlayerId) || {};
            
        const draftYearData = careerData.by_year[profile.draftYear];
        const draftPickData = careerData.by_pick[profile.pickOverall];
        const binSize = careerData.game_bin_size;

        if(draftYearData) {
             datasets.push({
                label: `Avg. Draft Year ${profile.draftYear}`,
                data: draftYearData.map(d => ({ x: xAxis === 'age' ? d.age : d.game_bin * binSize, y: d[stat] })),
                borderColor: 'var(--success-color)',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                showLine: true
            });
        }
        if(draftPickData) {
             datasets.push({
                label: `Avg. Draft Pick #${profile.pickOverall}`,
                data: draftPickData.map(d => ({ x: xAxis === 'age' ? d.age : d.game_bin * binSize, y: d[stat] })),
                borderColor: 'var(--danger-color)',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                showLine: true
            });
        }
    }
    
    careerChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Performance improvement
            parsing: false, // Performance improvement
            plugins: {
                legend: {
                    labels: {
                        // Only show labels for non-cloud datasets
                        filter: item => !item.borderColor.startsWith('rgba')
                    }
                },
                decimation: { // Performance improvement
                    enabled: true,
                    algorithm: 'lttb',
                    samples: 100,
                },
                tooltip: {
                    enabled: false // Disable default tooltip for performance
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: xAxis === 'age' ? 'Player Age' : 'NBA Games Played' }
                },
                y: {
                    title: { display: true, text: `Monthly Average ${stat}` }
                }
            }
        }
    });
}


// --- UNCHANGED FUNCTIONS FROM v20.3 (for completeness) ---

function initializeSeasonTab() {
    const selector = document.getElementById("data-source-selector");
    selector.innerHTML = Object.entries(fullData.seasonLongDataManifest)
        .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
        .map(([key, { label }]) => `<option value="${key}">${label}</option>`).join('');
    
    document.getElementById("category-weights-grid").innerHTML = ALL_STAT_KEYS.map(key => `
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
    tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;">Loading player data...</td></tr>`;
    const data = await fetchSeasonData(settings.sourceKey);
    if (!data) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center; color: var(--danger-color);">Could not load data for this source.</td></tr>`;
        return;
    }
    let processedData = data.map(player => ({
        ...player,
        custom_z_score: settings.activeCategories.size > 0 ? Array.from(settings.activeCategories).reduce((acc, catKey) => acc + (player[STAT_CONFIG[catKey].zKey] || 0), 0) : 0
    }));
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
    if (currentSort.column === sortKey) currentSort.direction = currentSort.direction === "desc" ? "asc" : "desc";
    else { currentSort.column = sortKey; currentSort.direction = ["playerName", "pos", "team"].includes(sortKey) ? "asc" : "desc"; }
    sortSeasonData();
    renderSeasonTableBody(parseInt(document.getElementById("show-count").value, 10));
}

function sortSeasonData() {
    const { column, direction, data } = currentSort;
    if (!data) return;
    const mod = direction === "asc" ? 1 : -1;
    data.sort((a, b) => {
        let valA = a[column] ?? 0, valB = b[column] ?? 0;
        if (typeof valA === 'string') return valA.localeCompare(valB) * mod;
        return (valA - valB) * mod;
    });
}

function renderSeasonTableBody(showCount) {
    const thead = document.getElementById("predictions-thead");
    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];
    const headerRow = `<tr> ${['R#','PLAYER','POS','TEAM','GP','MPG',...STAT_KEYS_MAIN,'FG%','FT%','TOTAL'].map(h => `<th data-sort-key="${h.replace('%','_impact')}">${h}</th>`).join('')} </tr>`;
    thead.innerHTML = headerRow;
    
    if (!dataToRender.length) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;">No players match criteria.</td></tr>`;
        return;
    }
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    tbody.innerHTML = dataToRender.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a></td>
            <td>${p.pos || 'N/A'}</td>
            <td>${p.team || 'N/A'}</td>
            <td>${p.GP || 0}</td>
            <td>${(p.MIN || 0).toFixed(1)}</td>
            ${STAT_KEYS_MAIN.map(key => `<td class="stat-cell"><div class="color-cell-bg ${getZClass(p[STAT_CONFIG[key].zKey])}"><span class="stat-value">${(p[key] || 0).toFixed(1)}</span><span class="z-score-value">${(p[STAT_CONFIG[key].zKey] || 0).toFixed(2)}</span></div></td>`).join('')}
            ${STAT_KEYS_IMPACT.map(key => `<td class="stat-cell"><div class="color-cell-bg ${getZClass(p[STAT_CONFIG[key].zKey])}"><span class="stat-value">${(p[key] || 0).toFixed(2)}</span><span class="z-score-value">${(p[STAT_CONFIG[key].zKey] || 0).toFixed(2)}</span></div></td>`).join('')}
            <td>${p.custom_z_score.toFixed(2)}</td>
        </tr>`).join('');
}

function initializeDailyTab() {
    document.getElementById("accuracy-metric-selector")?.addEventListener('change', renderAccuracyChart);
    const dateTabs = document.getElementById("daily-date-tabs");
    const sortedDates = fullData.dailyGamesByDate ? Object.keys(fullData.dailyGamesByDate).sort((a, b) => new Date(b) - new Date(a)) : [];
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
    const games = fullData.dailyGamesByDate ? (fullData.dailyGamesByDate[date] || []) : [];
    if (games.length === 0) {
        container.innerHTML = '<div class="card"><p>No games for this date.</p></div>';
        return;
    }
    container.innerHTML = games.map(game => {
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
        if (actual === undefined || actual === null) return '';
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
            const predRow = `<tr class="player-row-pred">
                <td rowspan="${isGraded ? 2 : 1}" class="player-name-cell">${nameHtml}</td>
                ${isGraded ? '<td class="stat-type-cell">P</td>' : ''}
                <td>${(p.Predicted_Minutes || 0).toFixed(1)}</td>
                <td>${(p.points || 0).toFixed(1)}</td>
                <td>${(p.reb || 0).toFixed(1)}</td>
                <td>${(p.ast || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.stl || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.blk || 0).toFixed(1)}</td>
            </tr>`;
            const actualRow = isGraded && actuals ? `<tr class="player-row-actual">
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
    return `<div class="team-box-score">
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
        default:
            const barData = sortedDates.map(date => {
                const values = gradesByDate[date].map(g => metric === 'scoreCloseness' ? g.scoreCloseness : g.statErrors[metric]);
                return values.reduce((a, b) => a + b, 0) / values.length;
            });
            chartConfig = { type: 'bar', data: { labels: sortedDates.map(d => new Date(d+"T00:00:00").toLocaleDateString('en-US', {month:'short', day:'numeric'})), datasets: [{ label: `Avg Daily ${metric}`, data: barData, backgroundColor: 'var(--primary-color)' }] } };
    }
    if (accuracyChartInstance) accuracyChartInstance.destroy();
    accuracyChartInstance = new Chart(ctx, { ...chartConfig, options: { ...chartConfig.options, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}
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
    const dataWithZ = data.map(player => ({
        ...player,
        custom_z_score: STAT_KEYS_MAIN.reduce((acc, key) => acc + (player[STAT_CONFIG[key].zKey] || 0), 0)
    }));
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
                <td>${p.GP}</td><td>${(p.MIN || 0).toFixed(1)}</td><td>${(p.PTS || 0).toFixed(1)}</td><td>${(p.REB || 0).toFixed(1)}</td><td>${(p.AST || 0).toFixed(1)}</td><td>${p.custom_z_score.toFixed(2)}</td>
            </tr>`).join('');
        return `<div class="team-card">
            <div class="team-card-header"><h3>${teamName}</h3><div class="team-strength-score" title="Sum of Player Z-Scores">${teamStrength.toFixed(2)}</div></div>
            <div class="table-container">
                <table>
                    <thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>Score</th></tr></thead>
                    <tbody>${playerRows}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}
async function initializePlayerProgressionTab() {
    const container = document.getElementById("player-progression-container");
    container.innerHTML = '<div class="card"><p>Loading player progression data...</p></div>';
    const data = await fetchSeasonData('progression');
    if (!data) {
        container.innerHTML = '<div class="card"><p style="color:var(--danger-color)">Could not load progression data.</p></div>';
        return;
    }
    
    const risers = [...data].sort((a,b) => b.z_Change - a.z_Change).slice(0, 25);
    const fallers = [...data].sort((a,b) => a.z_Change - b.z_Change).slice(0, 25);

    container.innerHTML = `
        <div class="progression-grid">
            ${createProgressionTable('Top 25 Risers', risers)}
            ${createProgressionTable('Top 25 Fallers', fallers)}
        </div>
    `;
}
function createProgressionTable(title, players) {
    const rows = players.map(p => `
        <tr>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td>
            <td>${p.team}</td>
            <td>${p.z_Total_2023.toFixed(2)}</td>
            <td>${p.z_Total_2024.toFixed(2)}</td>
            <td class="${p.z_Change > 0 ? 'text-success' : 'text-danger'}">${p.z_Change > 0 ? '+' : ''}${p.z_Change.toFixed(2)}</td>
        </tr>
    `).join('');
    return `
        <div class="card">
            <h3>${title}</h3>
            <div class="table-container" style="max-height: 50vh;">
                <table>
                    <thead><tr><th>Player</th><th>Team</th><th>'23 Z-Score</th><th>'24 Z-Score</th><th>Change</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}