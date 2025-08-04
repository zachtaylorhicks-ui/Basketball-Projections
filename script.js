// script.js (v29.1 - Definitive Final Version)

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let loadedSeasonDataCache = {};
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;
let careerChartInstance = null;
let modalChartInstance = null;
let careerHighlightedPlayerIds = new Set();
let careerAllProfiles = [];

const STAT_CONFIG = {
    PTS: { name: "PTS", zKey: "z_PTS" }, REB: { name: "REB", zKey: "z_REB" }, AST: { name: "AST", zKey: "z_AST" }, STL: { name: "STL", zKey: "z_STL" }, BLK: { name: "BLK", zKey: "z_BLK" }, '3PM': { name: "3PM", zKey: "z_3PM" }, TOV: { name: "TOV", zKey: "z_TOV" }, FG_impact: { name: "FG%", zKey: "z_FG_impact" }, FT_impact: { name: "FT%", zKey: "z_FT_impact" }
};
const ALL_STAT_KEYS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TOV", "FG_impact", "FT_impact"];

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    initializeTheme();
    try {
        const response = await fetch("predictions.json");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullData = await response.json();
        const lastUpdatedEl = document.getElementById("last-updated");
        if (lastUpdatedEl) lastUpdatedEl.textContent = new Date(fullData.lastUpdated).toLocaleString();

        initializeSeasonTab();
        initializeDailyTab();
        initializeTeamAnalysisTab();
        initializePlayerProgressionTab();
        initializeCareerAnalysisTab();

        document.body.addEventListener('click', handleGlobalClicks);
        const firstTab = document.querySelector('.tab-link');
        if (firstTab) firstTab.click();

    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.body.innerHTML = `<div style="text-align:center; padding: 50px; font-size:1.2em;">Error: Could not load core application data. Please check the browser console (F12) for details. The 'predictions.json' file may be missing or corrupt.<br><br><i>${e.message}</i></div>`;
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
    const tabElement = document.getElementById(tabName);
    if (tabElement) tabElement.style.display = "block";
    evt.currentTarget.classList.add("active");
}

async function fetchSeasonData(key) {
    if (!key) return null;
    if (loadedSeasonDataCache[key]) return loadedSeasonDataCache[key];
    try {
        const response = await fetch(`data/${key}.json`);
        if (!response.ok) throw new Error(`File not found for key: ${key}`);
        const data = await response.json();
        loadedSeasonDataCache[key] = data;
        return data;
    } catch (e) { console.error(e); return null; }
}

function handleGlobalClicks(e) {
    const playerLink = e.target.closest('.player-link');
    if (playerLink) {
        e.preventDefault();
        const personId = parseInt(playerLink.dataset.personId, 10);
        if (fullData.playerProfiles && fullData.playerProfiles[personId]) {
            showPlayerProfileOverlay(fullData.playerProfiles[personId], personId);
        } else {
            console.warn(`No profile found for personId: ${personId}.`);
        }
        return;
    }
    const expandButton = e.target.closest('.expand-details-btn');
    if (expandButton) {
        const card = expandButton.closest('.matchup-card');
        card.classList.toggle('expanded');
        expandButton.textContent = card.classList.contains('expanded') ? 'Hide Details' : 'Show Details';
    }
}

// --- PLAYER PROFILE MODAL (REWORKED) ---
async function showPlayerProfileOverlay(profile, personId) {
    const overlay = document.getElementById("player-profile-overlay");
    if (!overlay) return;
    overlay.innerHTML = buildPlayerProfileModalHTML(profile);
    overlay.classList.add("visible");
    
    const viewToggle = overlay.querySelector('#modal-view-toggle');
    const statSelector = overlay.querySelector('#modal-stat-selector');
    
    const renderContent = () => {
        const showCareerCurve = viewToggle.checked;
        const stat = statSelector.value;
        if (showCareerCurve) { // Career View
            if (stat === 'Z-Score') {
                renderPlayerSeasonZScoreHistory(personId);
            } else {
                renderPlayerCareerCurveChart(personId, stat);
            }
        } else { // Recent Performance View
            if (stat === 'Z-Score') {
                renderPlayerDailyZScoreChart(profile);
            } else {
                renderPlayerPerformanceHistoryChart(profile, stat);
            }
        }
    };
    
    viewToggle.addEventListener('change', renderContent);
    statSelector.addEventListener('change', renderContent);
    renderContent(); // Initial render

    const closeModal = () => {
        overlay.classList.remove("visible");
        overlay.innerHTML = '';
        if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
    };
    overlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
}

function buildPlayerProfileModalHTML(profile) {
    const wikiLink = profile.wikiUrl ? `<a href="${profile.wikiUrl}" target="_blank" rel="noopener noreferrer">View on Wikipedia</a>` : 'N/A';
    return `
    <div class="grade-modal player-modal">
        <div class="modal-header">
            <h2>${profile.playerName || profile.name || 'Unknown Player'}</h2>
            <button class="modal-close">×</button>
        </div>
        <div class="player-profile-grid">
            <div class="profile-sidebar">
                <div class="profile-info-grid">
                    <div class="profile-info-item"><div class="profile-info-label">Position</div><div class="profile-info-value">${profile.position || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Height</div><div class="profile-info-value">${profile.height || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Weight</div><div class="profile-info-value">${profile.weight || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Team</div><div class="profile-info-value">${profile.team || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Draft Info</div><div class="profile-info-value">${profile.draftInfo || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">External Link</div><div class="profile-info-value">${wikiLink}</div></div>
                </div>
            </div>
            <div class="profile-main">
                <div class="profile-main-header">
                    <h3 id="modal-chart-title">Player Analysis</h3>
                    <div id="modal-chart-controls" style="display: flex; align-items: center; gap: 20px;">
                        <div class="filter-group">
                            <label for="modal-stat-selector">STAT</label>
                            <select id="modal-stat-selector">
                                <option value="PTS">Points</option>
                                <option value="REB">Rebounds</option>
                                <option value="AST">Assists</option>
                                <option value="Z-Score">Z-Score</option>
                            </select>
                        </div>
                        <div class="chart-toggle">
                            <span class="chart-toggle-label">Recent</span>
                            <label class="chart-toggle-switch">
                                <input type="checkbox" id="modal-view-toggle">
                                <span class="chart-toggle-slider"></span>
                            </label>
                            <span class="chart-toggle-label">Career</span>
                        </div>
                    </div>
                </div>
                <div class="chart-wrapper" id="modal-chart-container"><canvas id="modal-chart"></canvas></div>
            </div>
        </div>
    </div>`;
}

async function renderPlayerPerformanceHistoryChart(profile, stat = 'PTS') {
    document.getElementById('modal-chart-title').textContent = `Recent ${stat} (Predicted vs Actual)`;
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    const history = profile.performanceHistory;
    if (!history || history.length === 0 || !history[0].hasOwnProperty(`actual_${stat}`)) {
        container.innerHTML = `<p class="error-cell" style="text-align:center; padding: 20px;">No recent performance history for ${stat}.</p>`;
        return;
    }
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(d => new Date(d.date + "T00:00:00").toLocaleDateString('en-US', {month: 'short', day: 'numeric'})),
            datasets: [
                { label: `Actual ${stat}`, data: history.map(d => d[`actual_${stat}`]), borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)', fill: false, tension: 0.1 },
                { label: `Predicted ${stat}`, data: history.map(d => d[`predicted_${stat}`]), borderColor: 'var(--text-secondary)', backgroundColor: 'var(--text-secondary)', borderDash: [5, 5], fill: false, tension: 0.1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

async function renderPlayerDailyZScoreChart(profile) {
    document.getElementById('modal-chart-title').textContent = 'Daily Z-Score (vs. Season Avg)';
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    const history = profile.performanceHistory;
    if (!history || history.length === 0 || !history[0].hasOwnProperty('daily_actual_z_score')) {
        container.innerHTML = '<p class="error-cell" style="text-align:center; padding: 20px;">No daily Z-Score history available for this player.</p>';
        return;
    }
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(d => new Date(d.date + "T00:00:00").toLocaleDateString('en-US', {month: 'short', day: 'numeric'})),
            datasets: [
                { label: 'Actual Daily Z-Score', data: history.map(d => d.daily_actual_z_score), borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)', fill: false, tension: 0.1 },
                { label: 'Predicted Daily Z-Score', data: history.map(d => d.daily_predicted_z_score), borderColor: 'var(--text-secondary)', backgroundColor: 'var(--text-secondary)', borderDash: [5, 5], fill: false, tension: 0.1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'Sum of Daily Z-Scores vs. Season Avg.' } } } }
    });
}

async function renderPlayerCareerCurveChart(personId, stat = 'PTS') {
    document.getElementById('modal-chart-title').textContent = `Career Curve (Monthly ${stat} Avg)`;
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    const careerData = await fetchSeasonData('career_data');
    const playerData = careerData?.players?.[personId];
    if (!playerData || playerData.length === 0) {
        container.innerHTML = '<p class="error-cell" style="text-align:center; padding: 20px;">No long-term career data available for this player.</p>';
        return;
    }
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets: [{ label: `Monthly ${stat} Average`, data: playerData.map(d => ({ x: d.x_games, y: d[stat] })), borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)', tension: 0.1, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { type: 'linear', title: { display: true, text: 'NBA Games Played' } }, y: { title: { display: true, text: `Monthly Average ${stat}` } } } }
    });
}

async function renderPlayerSeasonZScoreHistory(personId) {
    document.getElementById('modal-chart-title').textContent = 'Season-by-Season Fantasy Value';
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    
    const historicalSources = Object.keys(fullData.seasonLongDataManifest)
        .filter(k => k.startsWith('actuals_') && k.endsWith('_full_per_game'))
        .sort();
    
    let zScoreHistory = [];
    for (const sourceKey of historicalSources) {
        const seasonData = await fetchSeasonData(sourceKey);
        const playerData = seasonData?.find(p => p.personId === personId);
        if (playerData && playerData.custom_z_score) {
            const seasonLabel = fullData.seasonLongDataManifest[sourceKey].label.replace(' Full Season', '');
            zScoreHistory.push({ season: seasonLabel, zScore: playerData.custom_z_score });
        }
    }

    if (zScoreHistory.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">No historical Z-Score data found.</p>';
        return;
    }

    modalChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: zScoreHistory.map(d => d.season),
            datasets: [{
                label: 'Overall Z-Score',
                data: zScoreHistory.map(d => d.zScore),
                backgroundColor: zScoreHistory.map(d => d.zScore >= 0 ? 'var(--success-color)' : 'var(--danger-color)')
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: '9-Category Z-Score Total' }}}}
    });
}

// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    const manifest = fullData.seasonLongDataManifest || {};
    const seasonSelector = document.getElementById("season-selector");
    const splitSelector = document.getElementById("split-selector");
    if (!seasonSelector || !splitSelector) {
        console.error("Season tab selectors not found in the DOM.");
        return;
    }
    const sourcesBySeason = {};
    for (const key in manifest) {
        if (!manifest[key] || typeof manifest[key].label !== 'string') continue;
        const match = key.match(/(projections|\d{4})/);
        if (!match) continue;
        const year = match[1];
        if (!sourcesBySeason[year]) sourcesBySeason[year] = [];
        let splitKey = "projections";
        if (key.includes('full')) splitKey = 'full';
        else if (key.includes('pre_trade')) splitKey = 'pre_trade';
        else if (key.includes('post_trade')) splitKey = 'post_trade';
        const sourceObject = { key: key.replace(/_per_game|_total/g, ''), label: manifest[key].label, split: splitKey };
        if (!sourcesBySeason[year].some(s => s.key === sourceObject.key)) {
            sourcesBySeason[year].push(sourceObject);
        }
    }
    const sortedSeasons = Object.keys(sourcesBySeason).sort((a, b) => a.includes('proj') ? -1 : b.includes('proj') ? 1 : b.localeCompare(a));
    seasonSelector.innerHTML = sortedSeasons.map(year => {
        const yearSources = sourcesBySeason[year];
        const repSource = yearSources.find(s => s.split === 'full' || s.split === 'projections') || yearSources[0];
        let label = year;
        if (repSource && repSource.label) {
            const match = repSource.label.match(/(\d{4}-\d{2})|(\d{4}-\d{2}\s\w+)|(Projections)/);
            label = match ? match[0] : repSource.label;
        }
        return `<option value="${year}">${label.replace(/ Full Season/g, '')}</option>`;
    }).join('');
    function updateSplitSelector() {
        const selectedYear = seasonSelector.value;
        const splits = sourcesBySeason[selectedYear];
        if (!splits) { splitSelector.innerHTML = ''; return; }
        const splitLabels = { 'projections': 'Projections', 'full': 'Full Season', 'pre_trade': 'Pre-Trade Deadline', 'post_trade': 'Post-Trade Deadline' };
        splitSelector.innerHTML = splits.map(s => `<option value="${s.key}">${splitLabels[s.split] || s.label}</option>`).join('');
    }
    seasonSelector.addEventListener('change', () => { updateSplitSelector(); renderSeasonTable(); });
    splitSelector.addEventListener('change', renderSeasonTable);
    document.getElementById("category-weights-grid").innerHTML = ALL_STAT_KEYS.map(key => `<div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${STAT_CONFIG[key].name}</label></div>`).join('');
    document.getElementById("season-controls")?.addEventListener("change", renderSeasonTable);
    document.getElementById("search-player")?.addEventListener("input", renderSeasonTable);
    document.getElementById("predictions-thead")?.addEventListener("click", handleSortSeason);
    updateSplitSelector();
    renderSeasonTable();
}

async function renderSeasonTable() {
    const sourceBaseKey = document.getElementById("split-selector").value;
    const calcMode = document.getElementById("calculation-mode").value;
    const sourceKey = `${sourceBaseKey}_${calcMode}`;
    const settings = {
        showCount: parseInt(document.getElementById("show-count").value, 10),
        searchTerm: document.getElementById("search-player").value.toLowerCase().trim(),
        activeCategories: new Set(Array.from(document.querySelectorAll("#category-weights-grid input:checked")).map(cb => cb.dataset.key))
    };
    const tbody = document.getElementById("predictions-tbody");
    tbody.innerHTML = `<tr><td colspan="17" style="text-align:center;">Loading player data...</td></tr>`;
    let data = await fetchSeasonData(sourceKey);
    if (!data) { tbody.innerHTML = `<tr><td colspan="17" class="error-cell">Could not load data for '${sourceKey}'.</td></tr>`; return; }
    let processedData = data.map(player => ({
        ...player,
        custom_z_score_display: Array.from(settings.activeCategories).reduce((acc, catKey) => acc + (player[STAT_CONFIG[catKey].zKey] || 0), 0)
    }));
    if (settings.searchTerm) {
        processedData = processedData.filter(p => p.playerName?.toLowerCase().includes(settings.searchTerm));
    }
    currentSort.data = processedData;
    currentSort.column = 'custom_z_score_display';
    currentSort.direction = 'desc';
    sortSeasonData();
    renderSeasonTableBody(settings.showCount);
}

function handleSortSeason(e) {
    const th = e.target.closest("th");
    const sortKey = th?.dataset.sortKey;
    if (!sortKey) return;
    if (currentSort.column === sortKey) {
        currentSort.direction = currentSort.direction === "desc" ? "asc" : "desc";
    } else {
        currentSort.column = sortKey;
        currentSort.direction = ["playerName", "position", "team"].includes(sortKey) ? "asc" : "desc";
    }
    sortSeasonData();
    renderSeasonTableBody(parseInt(document.getElementById("show-count").value, 10));
}

function sortSeasonData() {
    const { column, direction, data } = currentSort;
    if (!data) return;
    const mod = direction === "asc" ? 1 : -1;
    const sortKey = column === 'custom_z_score' ? 'custom_z_score_display' : column;
    data.sort((a, b) => {
        let valA = a[sortKey] ?? -Infinity;
        let valB = b[sortKey] ?? -Infinity;
        if (typeof valA === 'string') return valA.localeCompare(valB) * mod;
        return (valA - valB) * mod;
    });
}

function renderSeasonTableBody(showCount) {
    const thead = document.getElementById("predictions-thead");
    thead.innerHTML = `<tr><th>R#</th><th data-sort-key="playerName">Player</th><th data-sort-key="position">Pos</th><th data-sort-key="team">Team</th><th data-sort-key="GP">GP</th><th data-sort-key="MIN">MIN/MPG</th>${ALL_STAT_KEYS.map(k=>`<th data-sort-key="${STAT_CONFIG[k].zKey}">${STAT_CONFIG[k].name}</th>`).join('')}<th data-sort-key="custom_z_score">TOTAL</th></tr>`;
    document.querySelectorAll('#predictions-thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    const currentTh = thead.querySelector(`[data-sort-key="${currentSort.column}"]`);
    if(currentTh) currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];
    if (!dataToRender.length) { tbody.innerHTML = `<tr><td colspan="17" class="error-cell">No players match criteria.</td></tr>`; return; }
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1.0 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1.0 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    const isTotalMode = document.getElementById("calculation-mode").value === 'total';
    tbody.innerHTML = dataToRender.map((p, i) => {
        return `
        <tr>
            <td>${i + 1}</td>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a></td>
            <td>${p.position || 'N/A'}</td>
            <td>${p.team || 'N/A'}</td>
            <td>${p.GP ? p.GP.toFixed(0) : 0}</td>
            <td>${isTotalMode ? (p.MIN || 0).toFixed(0) : (p.MIN || 0).toFixed(1)}</td>
            ${ALL_STAT_KEYS.map(key => {
                const zKey = STAT_CONFIG[key].zKey;
                const zValue = p[zKey] || 0;
                let displayValue;
                if (isTotalMode) {
                    if (key === 'FG_impact') { displayValue = `${(p.FGM || 0).toFixed(0)}/${(p.FGA || 0).toFixed(0)}`; }
                    else if (key === 'FT_impact') { displayValue = `${(p.FTM || 0).toFixed(0)}/${(p.FTA || 0).toFixed(0)}`; }
                    else { const rawKey = key.replace('_impact', ''); displayValue = (p[rawKey] || 0).toFixed(0); }
                } else {
                    if (key === 'FG_impact') { displayValue = p.FGA > 0 ? (p.FGM / p.FGA).toFixed(3) : '0.000'; }
                    else if (key === 'FT_impact') { displayValue = p.FTA > 0 ? (p.FTM / p.FTA).toFixed(3) : '0.000'; }
                    else { const rawKey = key.replace('_impact', ''); displayValue = (p[rawKey] || 0).toFixed(1); }
                }
                return `<td class="stat-cell ${getZClass(zValue)}"><span class="stat-value">${displayValue}</span><span class="z-score-value">${zValue.toFixed(2)}</span></td>`;
            }).join('')}
            <td>${(p.custom_z_score_display || 0).toFixed(2)}</td>
        </tr>`;
    }).join('');
}

// --- DAILY PROJECTIONS TAB ---
function initializeDailyTab() {
    const accuracySelector = document.getElementById("accuracy-metric-selector");
    if (accuracySelector) accuracySelector.addEventListener('change', renderAccuracyChart);
    const dateTabs = document.getElementById("daily-date-tabs");
    if (!dateTabs) return;
    const sortedDates = fullData.dailyGamesByDate ? Object.keys(fullData.dailyGamesByDate).sort((a, b) => new Date(b) - new Date(a)) : [];
    if (!sortedDates.length) {
        const container = document.getElementById("daily-games-container");
        if (container) container.innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
        const chartContainer = document.getElementById("accuracy-chart-container");
        if (chartContainer) chartContainer.style.display = 'none';
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
    renderAccuracyChart();
    renderDailyGamesForDate(sortedDates[0]);
}

function renderDailyGamesForDate(date) {
    const container = document.getElementById("daily-games-container");
    const games = fullData.dailyGamesByDate?.[date] || [];
    if (!container || games.length === 0) {
        if(container) container.innerHTML = '<div class="card"><p>No games for this date.</p></div>';
        return;
    }
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';

    container.innerHTML = games.map(game => {
        const [team1, team2] = game.projections;
        let scoreHTML = `Predicted: <strong>${team1.totalPoints}-${team2.totalPoints}</strong>`;
        if (game.grade?.isGraded) {
            const actual1 = Object.values(game.grade.gameSummary.actual)[0];
            const actual2 = Object.values(game.grade.gameSummary.actual)[1];
            scoreHTML += ` | Actual: <strong class="actual-score ${game.grade.correctWinner ? 'prediction-correct' : 'prediction-incorrect'}">${actual1}-${actual2}</strong>`;
        }
        const createCompactSummary = (teamData) => teamData.players.sort((a, b) => (b.MIN || 0) - (a.MIN || 0)).slice(0, 5).map(p => {
            const profile = fullData.playerProfiles[p.personId];
            const playerName = profile ? profile.playerName : '...';
            return `<div class="compact-player-badge ${getZClass((p.PTS-15)/8)}" title="${playerName} (Proj. ${p.PTS} pts)">${playerName.split(' ').pop()}</div>`;
        }).join('');
        return `
        <div class="matchup-card">
            <div class="matchup-header"><span class="matchup-teams">${team1.teamName} (${team1.winProb}%) vs ${team2.teamName} (${team2.winProb}%)</span><span class="matchup-scores">${scoreHTML}</span></div>
            <div class="matchup-compact-summary"><div class="compact-team">${createCompactSummary(team1)}</div><div class="compact-team">${createCompactSummary(team2)}</div></div>
            <div class="matchup-body">${createTeamTableHTML(team1, game.grade)}${createTeamTableHTML(team2, game.grade)}</div>
            <div class="matchup-footer"><button class="button-outline expand-details-btn">Show Details</button></div>
        </div>`;
    }).join('');
}

function createTeamTableHTML(teamData, gameGrade) {
    const isGraded = gameGrade?.isGraded;
    const getPerfIndicator = (pred, actual) => {
        if (actual == null || pred == null) return '';
        const diff = Math.abs(pred - actual), relativeError = diff / (actual || pred || 1);
        if (relativeError < 0.20) return 'pi-good'; if (relativeError > 0.60 && diff > 3) return 'pi-bad'; return 'pi-neutral';
    };
    const playersHtml = teamData.players.sort((a, b) => (b.MIN || 0) - (a.MIN || 0)).map(p => {
        const pId = p.personId;
        const profile = fullData.playerProfiles[pId];
        const playerName = profile ? profile.playerName : 'Unknown Player';
        const actuals = isGraded ? gameGrade.playerActuals?.[pId] : null;
        const nameHtml = `<a href="#" class="player-link" data-person-id="${pId}">${playerName}</a>`;
        const predRow = `<tr class="player-row-pred"><td rowspan="${isGraded ? 2 : 1}" class="player-name-cell">${nameHtml}</td><td class="stat-type-cell">P</td><td>${(p.MIN||0).toFixed(1)}</td><td>${(p.PTS||0).toFixed(1)}</td><td>${(p.REB||0).toFixed(1)}</td><td>${(p.AST||0).toFixed(1)}</td></tr>`;
        const actualRow = isGraded && actuals ? `<tr class="player-row-actual"><td class="stat-type-cell">A</td><td>-</td><td>${actuals.PTS.toFixed(0)}<span class="performance-indicator ${getPerfIndicator(p.PTS, actuals.PTS)}"></span></td><td>${actuals.REB.toFixed(0)}<span class="performance-indicator ${getPerfIndicator(p.REB, actuals.REB)}"></span></td><td>${actuals.AST.toFixed(0)}<span class="performance-indicator ${getPerfIndicator(p.AST, actuals.AST)}"></span></td></tr>` : isGraded ? `<tr class="player-row-actual"><td class="stat-type-cell">A</td><td colspan="4" style="text-align:center;">DNP</td></tr>` : '';
        return predRow + actualRow;
    }).join('');
    return `<div class="team-box-score"><h3 class="team-header">${teamData.teamName}</h3><table class="daily-table"><thead><tr><th style="text-align:left;">Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${playersHtml}</tbody></table></div>`;
}

function renderAccuracyChart() {
    const container = document.getElementById("accuracy-chart-container");
    if (!container) return;
    const chartCanvas = document.getElementById('accuracy-chart');
    if (!chartCanvas || !fullData.historicalGrades || fullData.historicalGrades.length < 1) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const ctx = chartCanvas.getContext('2d'), metric = document.getElementById('accuracy-metric-selector').value;
    const gradesByDate = fullData.historicalGrades.reduce((acc, g) => { (acc[g.date] = acc[g.date] || []).push(g); return acc; }, {});
    const sortedDates = Object.keys(gradesByDate).sort((a, b) => new Date(a) - new Date(b));
    let chartConfig;
    switch (metric) {
        case 'cumulativeWinLoss':
            let wins = 0, total = 0;
            const cumulativeData = sortedDates.map(date => { wins += gradesByDate[date].reduce((s, g) => s + g.correctWinner, 0); total += gradesByDate[date].length; return { x: new Date(date), y: total > 0 ? (wins / total) * 100 : 0 }; });
            chartConfig = { type: 'line', data: { datasets: [{ label: 'Cumulative W/L %', data: cumulativeData, borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)' }] }, options: { scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, x: { type: 'time', time: { unit: 'day' } } } } };
            break;
        case 'dailyWinLoss':
            const dailyData = sortedDates.map(date => (gradesByDate[date].reduce((s, g) => s + g.correctWinner, 0) / gradesByDate[date].length) * 100);
            chartConfig = { type: 'bar', data: { labels: sortedDates.map(d => new Date(d + "T00:00:00").toLocaleDateString('en-US', { month: 'short', day: 'numeric' })), datasets: [{ label: 'Daily W/L Accuracy', data: dailyData, backgroundColor: 'var(--primary-color)' }] }, options: { scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } } } };
            break;
        default: // MAE charts
            const barData = sortedDates.map(date => { const values = gradesByDate[date].map(g => metric === 'scoreCloseness' ? g.scoreCloseness : g.playerActuals ? Object.values(g.playerActuals).reduce((sum, p) => sum + Math.abs(p[metric] - p[`predicted_${metric}`]), 0) / Object.keys(g.playerActuals).length : 0).filter(v => v !== undefined); return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; });
            chartConfig = { type: 'bar', data: { labels: sortedDates.map(d => new Date(d + "T00:00:00").toLocaleDateString('en-US', { month: 'short', day: 'numeric' })), datasets: [{ label: `Avg Daily ${metric}`, data: barData, backgroundColor: 'var(--primary-color)' }] } };
    }
    if (accuracyChartInstance) accuracyChartInstance.destroy();
    accuracyChartInstance = new Chart(ctx, { ...chartConfig, options: { ...chartConfig.options, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}


// --- TEAM ANALYSIS TAB ---
function initializeTeamAnalysisTab() {
    const selector = document.getElementById("team-analysis-source-selector");
    if (!selector) return;
    const manifest = fullData.seasonLongDataManifest || {};
    const sources = Object.keys(manifest).filter(key => key.endsWith('_per_game')).sort((a,b) => b.localeCompare(a));
    selector.innerHTML = sources.map(key => `<option value="${key}">${manifest[key].label}</option>`).join('');
    selector.addEventListener('change', renderTeamAnalysis);
    renderTeamAnalysis();
}

async function renderTeamAnalysis() {
    const container = document.getElementById("team-analysis-container");
    if (!container) return;
    container.innerHTML = '<div class="card"><p>Loading team data...</p></div>';
    const sourceKey = document.getElementById("team-analysis-source-selector").value;
    const data = await fetchSeasonData(sourceKey);
    if (!data) { container.innerHTML = '<div class="card"><p class="error-cell">Could not load data for this source.</p></div>'; return; }
    const teams = data.reduce((acc, p) => { (acc[p.team || 'FA'] = acc[p.team || 'FA'] || []).push(p); return acc; }, {});
    container.innerHTML = Object.entries(teams).sort(([teamA], [teamB]) => {
        if (teamA === 'FA') return 1; if (teamB === 'FA') return -1;
        const strengthA = teams[teamA].reduce((s, p) => s + Math.max(0, (p.wcs || 0)), 0);
        const strengthB = teams[teamB].reduce((s, p) => s + Math.max(0, (p.wcs || 0)), 0);
        return strengthB - strengthA;
    }).map(([teamName, players]) => {
        const teamStrength = players.reduce((sum, p) => sum + Math.max(0, (p.wcs || 0)), 0);
        const playerRows = players.sort((a,b) => (b.wcs || 0) - (a.wcs || 0)).map(p => {
            const mpg = p.MIN || 0;
            return `<tr><td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td><td>${(p.GP||0).toFixed(0)}</td><td>${mpg.toFixed(1)}</td><td>${(p.PTS||0).toFixed(1)}</td><td>${(p.REB||0).toFixed(1)}</td><td>${(p.AST||0).toFixed(1)}</td><td>${(p.wcs||0).toFixed(2)}</td></tr>`;
        }).join('');
        return `
            <div class="team-card">
                <div class="team-card-header"><h3>${teamName === 'FA' ? 'Free Agents' : teamName}</h3><div class="team-strength-score">${teamStrength.toFixed(2)}</div></div>
                <div class="table-container">
                    <table><thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>WCS</th></tr></thead><tbody>${playerRows}</tbody></table>
                </div>
            </div>`;
    }).join('');
}

// --- PLAYER PROGRESSION TAB ---
async function initializePlayerProgressionTab() {
    const container = document.getElementById("player-progression-container");
    if (!container) return;
    container.innerHTML = '<div class="card" style="padding:20px; text-align:center;">Loading...</div>';
    const futureData = await fetchSeasonData('progression');
    const historicalData = await fetchSeasonData('progression_historical');
    if (!futureData && !historicalData) { container.innerHTML = '<div class="card"><p class="error-cell">Could not load progression data.</p></div>'; return; }
    let html = '<div class="progression-grid">';
    if (futureData) {
        html += createProgressionTable('Top Risers (vs. \'26 Proj.)', [...futureData].sort((a,b)=>b.z_Change-a.z_Change).slice(0,15), "'25 Z","'26 Proj. Z", "z_Total_2024", "z_Total_2025_Proj");
        html += createProgressionTable('Top Fallers (vs. \'26 Proj.)', [...futureData].sort((a,b)=>a.z_Change-b.z_Change).slice(0,15), "'25 Z","'26 Proj. Z", "z_Total_2024", "z_Total_2025_Proj");
    }
    if (historicalData) {
        html += createProgressionTable('Top Risers (\'24 vs \'25)', [...historicalData].sort((a,b)=>b.z_Change-a.z_Change).slice(0,15), "'24 Z","'25 Z", "z_Total_2023", "z_Total_2024");
        html += createProgressionTable('Top Fallers (\'24 vs \'25)', [...historicalData].sort((a,b)=>a.z_Change-b.z_Change).slice(0,15), "'24 Z","'25 Z", "z_Total_2023", "z_Total_2024");
    }
    container.innerHTML = html + '</div>';
}

function createProgressionTable(title, players, th1, th2, key1, key2) {
    const rows = players.map(p => `<tr><td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td><td>${p.team}</td><td>${(p[key1]||0).toFixed(2)}</td><td>${(p[key2]||0).toFixed(2)}</td><td class="${p.z_Change>=0?'text-success':'text-danger'}">${p.z_Change>=0?'+':''}${(p.z_Change||0).toFixed(2)}</td></tr>`).join('');
    return `<div class="card"><h3>${title}</h3><div class="table-container"><table><thead><tr><th>Player</th><th>Team</th><th>${th1}</th><th>${th2}</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// --- CAREER ANALYSIS TAB ---
function initializeCareerAnalysisTab() {
    const datalist = document.getElementById('player-datalist');
    const searchInput = document.getElementById("career-search-player");
    const controls = document.getElementById("career-controls");
    if (!datalist || !searchInput || !controls) return;
    careerAllProfiles = Object.entries(fullData.playerProfiles).map(([id, p]) => ({ id: parseInt(id, 10), ...p }));
    datalist.innerHTML = careerAllProfiles
        .filter(p => p.playerName)
        .map(p => `<option value="${p.playerName}"></option>`).join('');
    searchInput.addEventListener('change', (e) => {
        const playerName = e.target.value;
        const player = careerAllProfiles.find(p => p.playerName === playerName);
        if (player && !careerHighlightedPlayerIds.has(player.id)) {
            careerHighlightedPlayerIds.add(player.id);
            renderSelectedPlayers();
            renderCareerChart();
        }
        e.target.value = '';
    });
    controls.addEventListener('change', (e) => {
        if (e.target.id !== 'career-search-player') {
            renderCareerChart();
        }
    });
    document.getElementById('career-selected-players')?.addEventListener('click', e => {
        if (e.target.classList.contains('remove-player-btn')) {
            const idToRemove = parseInt(e.target.parentElement.dataset.id, 10);
            careerHighlightedPlayerIds.delete(idToRemove);
            renderSelectedPlayers();
            renderCareerChart();
        }
    });
    renderCareerChart();
}

function renderSelectedPlayers() {
    const container = document.getElementById('career-selected-players');
    if (!container) return;
    let html = '';
    careerHighlightedPlayerIds.forEach(id => {
        const player = careerAllProfiles.find(p => p.id === id);
        if (player) {
            html += `<span class="selected-player-badge" data-id="${id}">${player.playerName} <button class="remove-player-btn">×</button></span>`;
        }
    });
    container.innerHTML = html;
}

async function renderCareerChart() {
    const chartWrapper = document.getElementById("career-chart-wrapper");
    if (careerChartInstance) careerChartInstance.destroy();
    if (!chartWrapper) return;
    chartWrapper.innerHTML = '<canvas id="career-chart"></canvas>';
    const ctx = document.getElementById('career-chart')?.getContext('2d');
    if (!ctx) return;
    const careerData = await fetchSeasonData('career_data');
    if (!careerData || !careerData.players) {
        chartWrapper.innerHTML = `<p class="error-cell">Could not load career analysis data.</p>`;
        return;
    }
    const stat = document.getElementById("career-stat-selector").value;
    const xAxis = document.getElementById("career-xaxis-selector").value;
    const showPositionAvg = document.getElementById("career-pos-toggle").checked;
    const showTierAvg = document.getElementById("career-tier-toggle").checked;
    const yearFilter = parseInt(document.getElementById("career-year-filter").value, 10);
    const datasets = [];
    const colorPalette = ['#ffc107', '#fd7e14', '#dc3545', '#0d6efd', '#6f42c1', '#20c997'];
    let globalMin = Infinity;
    let globalMax = -Infinity;
    
    Object.values(careerData.players).forEach(playerData => {
        const firstPoint = playerData[0];
        if(!firstPoint) return;
        const profile = fullData.playerProfiles[firstPoint.personId];
        if (!profile || (yearFilter > 0 && profile.draft_year < yearFilter)) { return; }
        playerData.forEach(d => {
            const y = d[stat];
            if (y < globalMin) globalMin = y;
            if (y > globalMax) globalMax = y;
        });
    });

    Object.entries(careerData.players).forEach(([id, data]) => {
        const profile = fullData.playerProfiles[id];
        if (!profile || (yearFilter > 0 && profile.draft_year < yearFilter)) { return; }
        datasets.push({
            data: data.map(d => ({ x: xAxis === 'age' ? d.age : d.x_games, y: d[stat] })),
            borderColor: 'rgba(128, 128, 128, 0.1)', borderWidth: 1, pointRadius: 0
        });
    });

    const addAggregateDataset = (groupData, groupName, color) => {
        if (groupData) {
            datasets.push({
                label: groupName,
                data: groupData.map(d => ({ x: xAxis === 'age' ? d.age : d.x_games, y: d[stat] })),
                borderColor: color, borderWidth: 2, borderDash: [5, 5], pointRadius: 0,
            });
        }
    };
    
    if (showPositionAvg) {
        const posColors = {'C': '#dc3545', 'PF': '#fd7e14', 'SF': '#ffc107', 'SG': '#20c997', 'PG': '#0d6efd'};
        Object.entries(careerData.by_position || {}).forEach(([pos, data]) => {
             if (posColors[pos]) addAggregateDataset(data, `Avg ${pos}`, posColors[pos]);
        });
    }

    if (showTierAvg) {
        const tierColors = {'#1 Pick': '#d4af37', 'Lottery (2-14)': '#a9a9a9', 'Late 1st (15-30)': '#cd7f32', '2nd Round': '#6c757d', 'Undrafted': '#6c757d'};
        Object.entries(careerData.by_draft_tier || {}).forEach(([tier, data]) => {
            if (tierColors[tier]) addAggregateDataset(data, `Avg ${tier}`, tierColors[tier]);
        });
    }

    let colorIndex = 0;
    careerHighlightedPlayerIds.forEach(id => {
        if (careerData.players[id]) {
            const playerProfile = fullData.playerProfiles[id];
            datasets.push({
                label: playerProfile.playerName,
                data: careerData.players[id].map(d => ({ x: xAxis === 'age' ? d.age : d.x_games, y: d[stat] })),
                borderColor: colorPalette[colorIndex % colorPalette.length], 
                borderWidth: 3, pointRadius: 0, order: -1 
            });
            colorIndex++;
        }
    });
    
    const careerChartPlugin = {
        id: 'careerChartPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, scales: {x, y} } = chart;
            chart.data.datasets.forEach((dataset) => {
                if (dataset.label && dataset.label.startsWith('Avg')) {
                    const lastPoint = dataset.data[dataset.data.length - 1];
                    if (lastPoint && lastPoint.x != null && lastPoint.y != null) {
                        ctx.save();
                        ctx.font = 'bold 12px sans-serif';
                        ctx.fillStyle = dataset.borderColor;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(dataset.label, x.getPixelForValue(lastPoint.x) + 6, y.getPixelForValue(lastPoint.y));
                        ctx.restore();
                    }
                }
            });
        }
    };
    
    careerChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        plugins: [careerChartPlugin],
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: {
                legend: { labels: { color: 'var(--text-primary)', filter: item => item.label && !item.label.startsWith('Avg') } },
                tooltip: { enabled: true, mode: 'index', intersect: false }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: xAxis === 'age' ? 'Player Age' : 'NBA Games Played', color: 'var(--text-secondary)'}, ticks: {color: 'var(--text-secondary)'} },
                y: { title: { display: true, text: `Monthly Average ${stat}`, color: 'var(--text-secondary)' }, ticks: {color: 'var(--text-secondary)'},
                    min: globalMin > 0 ? 0 : Math.floor(globalMin - 1),
                    max: Math.ceil(globalMax * 1.05)
                }
            }
        }
    });
}
