// script.js (v19.2 - Fully Patched)

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let processedSeasonData = [];
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;
let loadedSeasonDataCache = {}; // Cache for on-demand data

const STAT_CONFIG = {
    PTS: { name: "PTS", zKey: "z_PTS" },
    REB: { name: "REB", zKey: "z_REB" },
    AST: { name: "AST", zKey: "z_AST" },
    STL: { name: "STL", zKey: "z_STL" },
    BLK: { name: "BLK", zKey: "z_BLK" },
    '3PM': { name: "3PM", zKey: "z_3PM" },
    TOV: { name: "TOV", zKey: "z_TOV" },
    FG_impact: { name: "FG% Impact", zKey: "z_FG_impact" },
    FT_impact: { name: "FT% Impact", zKey: "z_FT_impact" },
};

// --- INITIALIZATION & THEME ---
document.addEventListener("DOMContentLoaded", async () => {
    initializeTheme();
    try {
        const response = await fetch("predictions.json");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullData = await response.json();
        
        document.getElementById("last-updated").textContent = new Date(fullData.lastUpdated).toLocaleString();
        
        initializeSeasonTab();
        initializeDailyTab();

        document.body.addEventListener('click', handlePlayerLinkClick);

    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.getElementById("loading-message").textContent = "Error: Could not load data manifest. Please try again later.";
    }
});

function initializeTheme() {
    const themeSwitcher = document.querySelector('.theme-switcher');
    const doc = document.documentElement;
    const storedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (doc) {
        doc.setAttribute('data-theme', storedTheme);
    }
    themeSwitcher?.addEventListener('click', () => {
        const newTheme = doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        doc.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// --- TABS ---
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
    if (profile) showPlayerProfileOverlay(profile);
}

function showPlayerProfileOverlay(profile) {
    const overlay = document.getElementById("player-profile-overlay");
    const modalContent = document.getElementById("player-profile-modal-content");
    
    if (overlay && modalContent) {
        modalContent.innerHTML = buildPlayerProfileModalHTML(profile);
        overlay.classList.add("visible");
        
        const closeModal = () => overlay.classList.remove("visible");
        overlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
        overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
    }
}

function buildPlayerProfileModalHTML(profile) {
    const initials = profile.name.split(' ').map(n => n[0]).join('').substring(0, 2);
    return `
        <div class="profile-modal-body">
            <div class="profile-sidebar">
                <div class="profile-avatar">${initials}</div>
                <div class="profile-info-grid">
                    <div class="profile-info-item"><div class="profile-info-label">Height</div><div class="profile-info-value">${profile.height || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Weight</div><div class="profile-info-value">${profile.weight || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">Born</div><div class="profile-info-value">${profile.dob || 'N/A'}</div></div>
                    <div class="profile-info-item"><div class="profile-info-label">From</div><div class="profile-info-value">${profile.collegeOrCountry || 'N/A'}</div></div>
                </div>
            </div>
            <div class="profile-main-content">
                    <div class="modal-header" style="padding:0; border:none; background:transparent;">
                        <h2>${profile.name}</h2>
                        <button class="modal-close">×</button>
                    </div>
                 <h3>Current Team: ${profile.team || 'N/A'}</h3>
                 <p>Full player stats, career logs, and news will be displayed here in a future version.</p>
                 ${profile.wikiUrl ? `<a href="${profile.wikiUrl}" target="_blank" rel="noopener noreferrer">View on Wikipedia</a>` : ''}
            </div>
        </div>`;
}

// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    if (!fullData.seasonLongDataManifest || Object.keys(fullData.seasonLongDataManifest).length === 0) {
        document.getElementById("loading-message").textContent = "No season-long data available.";
        return;
    }
    setupSeasonControls();
    addSeasonEventListeners();
    handleSeasonControlChange();
    document.getElementById("loading-message").style.display = "none";
    document.getElementById("predictions-table").style.display = "table";
}

function setupSeasonControls() {
    const sourceSelector = document.getElementById("data-source-selector");
    const uniqueSources = {};
    Object.keys(fullData.seasonLongDataManifest).forEach(key => {
        const baseKey = key.replace(/_per_game|_totals|_regularseason|_preseason/g, '');
        if (!uniqueSources[baseKey]) {
            uniqueSources[baseKey] = fullData.seasonLongDataManifest[key].label;
        }
    });

    if (sourceSelector) {
        const sortedEntries = Object.entries(uniqueSources).sort(([keyA], [keyB]) => {
            if (keyA.startsWith('projections')) return -1;
            if (keyB.startsWith('projections')) return 1;
            return keyB.localeCompare(keyA);
        });
        sourceSelector.innerHTML = sortedEntries.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
    }

    const catGrid = document.getElementById("category-weights-grid");
    if(catGrid) {
        const statHeaders = Object.entries(STAT_CONFIG)
            .filter(([key]) => !key.includes('impact'))
            .map(([key, { name }]) => `<div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${name.replace(' Impact', '')}</label></div>`).join('');
        const impactHeaders = Object.entries(STAT_CONFIG)
            .filter(([key]) => key.includes('impact'))
            .map(([key, { name }]) => `<div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${name}</label></div>`).join('');
        catGrid.innerHTML = statHeaders + impactHeaders;
    }
}

function addSeasonEventListeners() {
    document.getElementById("season-controls")?.addEventListener("change", handleSeasonControlChange);
    document.getElementById("search-player")?.addEventListener("input", recalculateAndRenderSeason);
    document.getElementById("predictions-thead")?.addEventListener("click", handleSortSeason);
}

async function handleSeasonControlChange() {
    const sourceKey = document.getElementById("data-source-selector")?.value;
    if (!sourceKey) return;
    
    const isHistorical = sourceKey.startsWith('actuals');
    document.getElementById('game-type-filter-group').style.display = isHistorical ? 'block' : 'none';
    
    // Show calc mode for both projections and historicals if they exist
    const hasTotals = fullData.seasonLongDataManifest[`${sourceKey}_totals`] || fullData.seasonLongDataManifest[`${sourceKey}_regularseason_totals`];
    document.getElementById('calc-mode-filter-group').style.display = hasTotals ? 'block' : 'none';

    document.getElementById("predictions-tbody").innerHTML = `<tr><td colspan="15" style="text-align:center;">Loading data...</td></tr>`;
    await recalculateAndRenderSeason();
}

function getSeasonControlSettings() {
    const activeCategories = new Set();
    document.querySelectorAll("#category-weights-grid input:checked").forEach(cb => activeCategories.add(cb.dataset.key));
    
    const baseKey = document.getElementById("data-source-selector").value;
    const calcMode = document.getElementById("calc-mode-selector").value;
    
    let fullKey;
    if (baseKey.startsWith('projections')) {
        fullKey = `${baseKey}_${calcMode}`;
    } else {
        const gameType = document.getElementById("game-type-selector").value;
        fullKey = `${baseKey}_${gameType}_${calcMode}`;
    }

    return {
        sourceKey: fullKey,
        activeCategories,
        showCount: parseInt(document.getElementById("show-count").value, 10),
        searchTerm: document.getElementById("search-player").value.toLowerCase().trim(),
    };
}

async function recalculateAndRenderSeason() {
    const settings = getSeasonControlSettings();
    let sourceData;
    const tbody = document.getElementById("predictions-tbody");

    if (loadedSeasonDataCache[settings.sourceKey]) {
        sourceData = loadedSeasonDataCache[settings.sourceKey];
    } else {
        try {
            const response = await fetch(`data/${settings.sourceKey}.json`);
            if (!response.ok) throw new Error(`Could not load data file: ${settings.sourceKey}.json`);
            sourceData = await response.json();
            loadedSeasonDataCache[settings.sourceKey] = sourceData;
        } catch (error) {
            console.error(error);
            if(tbody) tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; color: var(--danger-color);">Error loading data. The selected combination might not exist.</td></tr>`;
            return;
        }
    }

    processedSeasonData = sourceData.map(player => {
        let customZScore = 0;
        settings.activeCategories.forEach(catKey => {
            const config = STAT_CONFIG[catKey];
            customZScore += player[config.zKey] || 0;
        });
        return { ...player, custom_z_score: customZScore };
    });

    if (settings.searchTerm) {
        processedSeasonData = processedSeasonData.filter(p => (p.playerName || "").toLowerCase().includes(settings.searchTerm));
    }
    
    sortSeasonData();
    renderSeasonTable();
}

function renderSeasonTable() {
    renderSeasonTableHeader();
    renderSeasonTableBody();
}

function renderSeasonTableHeader() {
    const thead = document.getElementById("predictions-thead");
    if(!thead) return;
    const baseHeaders = [{key: "rank", name: "R#"}, {key: "playerName", name: "PLAYER"}, {key: "pos", name: "POS"}, {key: "team", name: "TEAM"}, {key: "GP", name: "GP"}, {key: "MIN", name: "MPG"}];
    const statHeaders = Object.entries(STAT_CONFIG).map(([key, { name }]) => ({ key, name: name.replace(" Impact", "") }));
    const totalHeader = { key: "custom_z_score", name: "TOTAL" };
    const allHeaders = [...baseHeaders, ...statHeaders, totalHeader];
    thead.innerHTML = `<tr>${allHeaders.map(h => `<th data-sort-key="${h.key}">${h.name}</th>`).join('')}</tr>`;
}

function renderSeasonTableBody() {
    const tbody = document.getElementById("predictions-tbody");
    if(!tbody) return;

    const settings = getSeasonControlSettings();
    const dataToRender = processedSeasonData.slice(0, settings.showCount);

    if (!dataToRender.length) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;">No players match your criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = dataToRender.map((player, index) => {
        const hasProfile = fullData.playerProfiles?.[player.personId];
        const nameHtml = hasProfile 
            ? `<a href="#" class="player-link" data-person-id="${player.personId}">${player.playerName || 'N/A'}</a>`
            : `<b class="player-unlinked">${player.playerName || 'N/A'}</b>`;
        
        const getRawValue = (p, statKey) => p[statKey] || p[statKey.toLowerCase()] || p[STAT_CONFIG[statKey]?.zKey.replace('z_','')] || 0;

        let rowHtml = `<td>${index + 1}</td><td>${nameHtml}</td><td>${player.pos || 'N/A'}</td><td>${player.team || 'N/A'}</td><td>${player.GP || 0}</td><td>${(player.MIN || player.numMinutes || 0).toFixed(1)}</td>`;

        for (const [key, config] of Object.entries(STAT_CONFIG)) {
            const zValue = player[config.zKey] || 0;
            const rawValue = getRawValue(player, key);
            rowHtml += `<td class="stat-cell"><div class="color-cell-bg ${getZScoreClass(zValue)}"><span class="stat-value">${rawValue.toFixed(1)}</span><span class="z-score-value">${zValue.toFixed(2)}</span></div></td>`;
        }
        
        rowHtml += `<td><span class="stat-value">${player.custom_z_score.toFixed(2)}</span></td>`;
        return `<tr>${rowHtml}</tr>`;
    }).join('');
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
    recalculateAndRenderSeason();
}

function sortSeasonData() {
    const { column, direction } = currentSort;
    const sortModifier = direction === "asc" ? 1 : -1;
    processedSeasonData.sort((a, b) => {
        let valA = a[column] || 0; let valB = b[column] || 0;
        if (typeof valA === 'string') return valA.localeCompare(valB) * sortModifier;
        return (valA - valB) * sortModifier;
    });
}

function getZScoreClass(z) {
    if (z >= 1.75) return "elite"; if (z >= 1.25) return "very-good"; if (z >= 0.75) return "good";
    if (z <= -1.25) return "not-good"; if (z <= -0.75) return "below-average"; return "average";
}

// --- DAILY PROJECTIONS TAB ---
function initializeDailyTab() {
    document.getElementById("accuracy-metric-selector")?.addEventListener('change', renderAccuracyChart);
    renderAccuracyChart();
    
    const gamesContainer = document.getElementById("daily-games-container");
    const dateTabsContainer = document.getElementById("daily-date-tabs");
    const sortedDates = Object.keys(fullData.dailyGamesByDate || {}).sort((a, b) => new Date(b) - new Date(a));

    if (!sortedDates.length) {
        if(gamesContainer) gamesContainer.innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
        return;
    }

    if(dateTabsContainer) {
        dateTabsContainer.innerHTML = sortedDates.map((date, index) =>
            `<button class="date-tab ${index === 0 ? 'active' : ''}" data-date="${date}">${new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</button>`
        ).join('');
        dateTabsContainer.addEventListener("click", e => {
            const tab = e.target.closest(".date-tab");
            if (tab) {
                document.querySelectorAll(".date-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                renderDailyGamesForDate(tab.dataset.date);
            }
        });
    }

    gamesContainer?.addEventListener("click", e => {
        if (e.target.classList.contains("grade-button")) {
            const gameData = fullData.dailyGamesByDate[e.target.dataset.date].find(g => g.gameId == e.target.dataset.gameId);
            if (gameData?.grade.isGraded) showGradeOverlay(gameData);
        }
    });

    document.getElementById("toggle-advanced-stats")?.addEventListener("click", () => gamesContainer.classList.toggle("show-advanced"));
    renderDailyGamesForDate(sortedDates[0]);
}

function renderAccuracyChart() {
    const container = document.getElementById("accuracy-chart-container");
    const chartCanvas = document.getElementById('accuracy-chart');
    if (!container || !chartCanvas || !fullData.historicalGrades || fullData.historicalGrades.length < 1) {
        if(container) container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    
    const ctx = chartCanvas.getContext('2d');
    const selectedMetric = document.getElementById('accuracy-metric-selector').value;
    
    const gradesByDate = fullData.historicalGrades.reduce((acc, g) => {
        if (!acc[g.date]) acc[g.date] = [];
        if (g[selectedMetric] !== undefined) acc[g.date].push(g[selectedMetric]);
        return acc;
    }, {});
    
    const sortedDates = Object.keys(gradesByDate).sort((a,b) => new Date(a) - new Date(b));
    const labels = sortedDates.map(d => new Date(d + "T00:00:00").toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const data = sortedDates.map(d => {
        const dayGrades = gradesByDate[d];
        return dayGrades.length ? dayGrades.reduce((a, b) => a + b, 0) / dayGrades.length : 0;
    });

    if (accuracyChartInstance) accuracyChartInstance.destroy();
    accuracyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: selectedMetric, data, backgroundColor: 'rgba(13, 110, 253, 0.6)', borderColor: 'var(--primary-color)', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: selectedMetric !== 'scoreDifference', title: { display: true, text: 'Average Value' } } } }
    });
}

function renderDailyGamesForDate(date) {
    const container = document.getElementById("daily-games-container");
    if(!container) return;
    container.innerHTML = "";
    (fullData.dailyGamesByDate[date] || []).forEach(game => {
        const matchupCard = document.createElement("div");
        matchupCard.className = "matchup-card";
        const [team1, team2] = game.projections;
        const gradeButton = game.grade?.isGraded ? `<button class="grade-button" data-game-id="${game.gameId}" data-date="${date}">View Full Grade</button>` : '';
        matchupCard.innerHTML = `<div class="matchup-header"><span class="matchup-header-teams">${team1.teamName} vs ${team2.teamName}</span>${gradeButton}</div><div class="matchup-body">${createTeamTableHTML(team1, game.grade)}${createTeamTableHTML(team2, game.grade)}</div>`;
        container.appendChild(matchupCard);
    });
}

function createTeamTableHTML(teamData, gameGrade) {
    const isGraded = gameGrade?.isGraded;
    const getStatCell = (predVal, actualVal) => {
        predVal = predVal || 0;
        if (actualVal === null || actualVal === undefined) return `<td>${predVal.toFixed(1)}</td>`;
        return `<td class="inline-grade-cell"><span class="inline-grade-pred">${predVal.toFixed(1)}</span><span class="inline-grade-separator">/</span><span class="inline-grade-actual">${actualVal.toFixed(1)}</span></td>`;
    };

    const playersHtml = teamData.players
        .sort((a, b) => (b.Predicted_Minutes || 0) - (a.Predicted_Minutes || 0))
        .map(p => {
            const playerId = p.Player_ID || p.personId;
            const actuals = isGraded ? gameGrade.playerActuals?.[playerId] : null;
            const nameHtml = fullData.playerProfiles?.[playerId] ? `<a href="#" class="player-link" data-person-id="${playerId}">${p.Player_Name}</a>` : `<span class="player-unlinked">${p.Player_Name}</span>`;
            return `<tr><td>${nameHtml}</td><td>${(p.Predicted_Minutes || 0).toFixed(1)}</td>${getStatCell(p.points, actuals?.PTS)}${getStatCell(p.reb, actuals?.REB)}${getStatCell(p.ast, actuals?.AST)}<td class="advanced-stat">${getStatCell(p.stl, actuals?.STL)}</td><td class="advanced-stat">${getStatCell(p.blk, actuals?.BLK)}</td></tr>`;
        }).join('');

    return `<div class="team-box-score"><div class="team-header"><h3>${teamData.teamName} (${teamData.winProb}%)</h3></div><table class="daily-table"><thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th class="advanced-stat">STL</th><th class="advanced-stat">BLK</th></tr></thead><tbody>${playersHtml}</tbody></table></div>`;
}

// --- GRADE MODAL ---
function showGradeOverlay(gameData) {
    const overlay = document.getElementById("grade-overlay");
    const modalContent = document.getElementById("grade-modal-content");
    if(overlay && modalContent) {
        modalContent.innerHTML = buildGradeModalHTML(gameData.grade);
        overlay.classList.add("visible");
        const closeModal = () => overlay.classList.remove("visible");
        overlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
        overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
    }
}

function buildGradeModalHTML(grade) {
    const [team1, team2] = Object.keys(grade.gameSummary.predicted);
    const gradeClass = `grade-${grade.overallGrade.replace('+', '-plus')}`;
    const createStatComparisonHTML = pGrade => ["PTS", "REB", "AST", "STL", "BLK"].map(stat => {
        const pred = pGrade.predicted[stat] || 0, actual = pGrade.actual[stat] || 0, diff = actual - pred;
        return `<div class="stat-comparison-group"><div class="stat-label">${stat}</div><div class="stat-row"><span class="stat-value-pred">${pred.toFixed(1)}</span><span class="stat-value-actual">${actual.toFixed(1)}</span></div><div class="stat-diff ${Math.abs(diff) > 2 ? 'negative' : 'positive'}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}</div></div>`;
    }).join('');

    return `<div class="modal-header"><h2 style="margin-right:20px;">Prediction Grade</h2><span class="grade-badge ${gradeClass}">${grade.overallGrade}</span><button class="modal-close">×</button></div><div class="modal-body"><div class="modal-sidebar"><div class="modal-section scoreboard"><h3>📊 Game Score</h3><div class="scoreboard-grid"><div class="team-name">${team1}</div><div>vs</div><div class="team-name">${team2}</div><div class="score-type">Predicted</div><div></div><div class="score-type">Predicted</div><div class="score">${grade.gameSummary.predicted[team1]}</div><div></div><div class="score">${grade.gameSummary.predicted[team2]}</div><div class="score-type">Actual</div><div></div><div class="score-type">Actual</div><div class="score">${grade.gameSummary.actual[team1]}</div><div></div><div class="score">${grade.gameSummary.actual[team2]}</div></div></div><div class="modal-section accuracy-breakdown"><h3>🎯 Stat Accuracy (Avg. Error)</h3><table class="accuracy-table"><tbody>${Object.entries(grade.statErrors).map(([stat, error]) => `<tr><td>${stat}</td><td>${error.toFixed(2)}</td></tr>`).join('')}</tbody></table></div></div><div class="modal-main"><div class="modal-section"><h3><span class="icon">⭐</span> Shining Stars (Most Accurate)</h3><ul class="player-grade-list">${grade.shiningStars.map(p => `<li class="player-grade-item"><div class="player-name">${p.playerName}</div><div class="stats-comparison">${createStatComparisonHTML(p)}</div></li>`).join('')}</ul></div><div class="modal-section"><h3><span class="icon">🔬</span> Tough Calls (Largest Misses)</h3><ul class="player-grade-list">${grade.toughCalls.map(p => `<li class="player-grade-item"><div class="player-name">${p.playerName}</div><div class="stats-comparison">${createStatComparisonHTML(p)}</div></li>`).join('')}</ul></div></div></div>`;
}