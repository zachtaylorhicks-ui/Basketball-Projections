// script.js

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let processedSeasonData = [];
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;

const STAT_CONFIG = {
    PTS: { name: "PTS", zKey: "z_points" },
    REB: { name: "REB", zKey: "z_reboundsTotal" },
    AST: { name: "AST", zKey: "z_assists" },
    STL: { name: "STL", zKey: "z_steals" },
    BLK: { name: "BLK", zKey: "z_blocks" },
    '3PM': { name: "3PM", zKey: "z_threePointersMade" },
    TOV: { name: "TO", zKey: "z_turnovers", invert: true },
    FG_impact: { name: "FG% Impact", zKey: "z_FG_impact" },
    FT_impact: { name: "FT% Impact", zKey: "z_FT_impact" },
};

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
    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.getElementById("loading-message").textContent = "Error: Could not load projection data. Please try again later.";
    }
});

function initializeTheme() {
    const themeSwitcher = document.querySelector('.theme-switcher');
    const doc = document.documentElement;
    const onMediaChange = (e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        doc.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    };

    const storedTheme = localStorage.getItem('theme');
    const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const currentTheme = storedTheme || preferredTheme;
    doc.setAttribute('data-theme', currentTheme);

    themeSwitcher.addEventListener('click', () => {
        const newTheme = doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        doc.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
    
    // Watch for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onMediaChange);
}


// --- TABS ---
function openTab(evt, tabName) {
    document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
    document.querySelectorAll(".tab-link").forEach(link => link.classList.remove("active"));
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
    if (tabName === 'Daily') document.getElementById("daily-games-container").classList.remove("show-advanced");
}

// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    if (!fullData.seasonLongData || Object.keys(fullData.seasonLongData).length === 0) {
        document.getElementById("loading-message").textContent = "No season-long data available.";
        document.getElementById("season-controls").style.display = "none";
        return;
    }
    
    setupSeasonControls();
    addSeasonEventListeners();
    recalculateAndRenderSeason();

    document.getElementById("loading-message").style.display = "none";
    document.getElementById("predictions-table").style.display = "table";
}

function setupSeasonControls() {
    // Populate Data Source Dropdown
    const sourceSelector = document.getElementById("projection-source-selector");
    sourceSelector.innerHTML = Object.entries(fullData.seasonLongData)
        .map(([key, { label }]) => `<option value="${key}">${label}</option>`)
        .join('');

    // Populate Category Checkboxes
    const catGrid = document.getElementById("category-weights-grid");
    catGrid.innerHTML = Object.entries(STAT_CONFIG)
        .map(([key, { name }]) => `
            <div class="category-item" id="cat-item-${key}">
                <label><input type="checkbox" id="cb-${key}" data-key="${key}" checked> ${name}</label>
            </div>
        `).join('');
}

function addSeasonEventListeners() {
    document.getElementById("season-controls").addEventListener("change", recalculateAndRenderSeason);
    document.getElementById("search-player").addEventListener("input", recalculateAndRenderSeason);
    document.getElementById("predictions-thead").addEventListener("click", handleSortSeason);
}

function recalculateAndRenderSeason() {
    const settings = getSeasonControlSettings();
    const sourceData = fullData.seasonLongData[settings.sourceKey].data;

    processedSeasonData = sourceData.map(player => {
        let customZScore = 0;
        settings.activeCategories.forEach(catKey => {
            const config = STAT_CONFIG[catKey];
            let zValue = player[config.zKey] || 0;
            if (config.invert) zValue *= -1;
            customZScore += zValue;
        });
        return { ...player, custom_z_score: customZScore };
    });

    if (settings.searchTerm) {
        processedSeasonData = processedSeasonData.filter(p =>
            (p.playerName || "").toLowerCase().includes(settings.searchTerm)
        );
    }
    
    sortSeasonData();
    renderSeasonTable(settings);
}

function getSeasonControlSettings() {
    const activeCategories = new Set();
    document.querySelectorAll("#category-weights-grid input:checked").forEach(cb => activeCategories.add(cb.dataset.key));
    
    return {
        sourceKey: document.getElementById("projection-source-selector").value,
        activeCategories,
        showCount: parseInt(document.getElementById("show-count").value, 10),
        searchTerm: document.getElementById("search-player").value.toLowerCase().trim(),
    };
}

function renderSeasonTable(settings) {
    renderSeasonTableHeader();
    renderSeasonTableBody(settings);
}

function renderSeasonTableHeader() {
    const baseHeaders = [{key: "rank", name: "R#"}, {key: "playerName", name: "PLAYER"}, {key: "pos", name: "POS"}, {key: "team", name: "TEAM"}, {key: "GP", name: "GP"}, {key: "MIN", name: "MPG"}];
    const statHeaders = Object.entries(STAT_CONFIG).map(([key, { name }]) => ({ key, name: name.replace(" Impact", "") }));
    const totalHeader = { key: "custom_z_score", name: "TOTAL" };
    const allHeaders = [...baseHeaders, ...statHeaders, totalHeader];

    document.getElementById("predictions-thead").innerHTML = `<tr>${allHeaders.map(h => 
        `<th data-sort-key="${h.key}">${h.name}</th>`
    ).join('')}</tr>`;
}

function renderSeasonTableBody(settings) {
    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = processedSeasonData.slice(0, settings.showCount);

    if (!dataToRender.length) {
        tbody.innerHTML = `<tr><td colspan="${Object.keys(STAT_CONFIG).length + 7}">No players match your criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = dataToRender.map((player, index) => {
        let rowHtml = `
            <td>${index + 1}</td>
            <td><b>${player.playerName || 'N/A'}</b></td>
            <td>${player.pos || 'N/A'}</td>
            <td>${player.team || 'N/A'}</td>
            <td>${player.GP || 0}</td>
            <td>${(player.MIN || 0).toFixed(1)}</td>
        `;

        for (const [key, config] of Object.entries(STAT_CONFIG)) {
            const rawValue = player[key] || 0;
            const zValue = player[config.zKey] || 0;
            const zScoreDisplay = zValue.toFixed(2);
            const zScoreClass = getZScoreClass(zValue);
            
            rowHtml += `
                <td class="stat-cell">
                    <div class="color-cell-bg ${zScoreClass}">
                        <span class="stat-value">${rawValue.toFixed(1)}</span>
                        <span class="z-score-value">${zScoreDisplay}</span>
                    </div>
                </td>`;
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
        let valA = a[column] || 0;
        let valB = b[column] || 0;
        if (typeof valA === 'string') {
            return valA.localeCompare(valB) * sortModifier;
        }
        return (valA - valB) * sortModifier;
    });
}

function getZScoreClass(z) {
    if (z === null || z === undefined) return "average";
    if (z >= 1.75) return "elite";
    if (z >= 1.25) return "very-good";
    if (z >= 0.75) return "good";
    if (z <= -1.25) return "not-good";
    if (z <= -0.75) return "below-average";
    return "average";
}

// --- DAILY PROJECTIONS TAB ---
function initializeDailyTab() {
    renderAccuracyChart();
    const gamesContainer = document.getElementById("daily-games-container");
    const dateTabsContainer = document.getElementById("daily-date-tabs");
    const sortedDates = Object.keys(fullData.dailyGamesByDate || {}).sort((a, b) => new Date(b) - new Date(a));

    if (!sortedDates.length) {
        gamesContainer.innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
        return;
    }

    dateTabsContainer.innerHTML = sortedDates.map((date, index) =>
        `<button class="date-tab ${index === 0 ? 'active' : ''}" data-date="${date}">
            ${new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </button>`
    ).join('');

    dateTabsContainer.addEventListener("click", e => {
        const tab = e.target.closest(".date-tab");
        if (tab) {
            document.querySelectorAll(".date-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            renderDailyGamesForDate(tab.dataset.date);
        }
    });

    gamesContainer.addEventListener("click", e => {
        if (e.target.classList.contains("grade-button")) {
            const gameId = e.target.dataset.gameId;
            const date = e.target.dataset.date;
            const gameData = fullData.dailyGamesByDate[date].find(g => g.gameId == gameId);
            if (gameData && gameData.grade.isGraded) showGradeOverlay(gameData);
        }
    });

    document.getElementById("toggle-advanced-stats").addEventListener("click", () => {
        gamesContainer.classList.toggle("show-advanced");
    });

    renderDailyGamesForDate(sortedDates[0]);
}

function renderAccuracyChart() {
    const container = document.getElementById("accuracy-chart-container");
    if (!fullData.historicalGrades || fullData.historicalGrades.length < 2) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    const ctx = document.getElementById('accuracy-chart').getContext('2d');
    const labels = fullData.historicalGrades.map(g => new Date(g.date + "T00:00:00").toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const data = fullData.historicalGrades.map(g => g.overallMAE);

    if (accuracyChartInstance) accuracyChartInstance.destroy();

    accuracyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Prediction Error (Lower is Better)',
                data,
                borderColor: 'var(--primary-color)',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: true,
                tension: 0.1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderDailyGamesForDate(date) {
    const container = document.getElementById("daily-games-container");
    container.innerHTML = ""; // Clear previous games
    const games = fullData.dailyGamesByDate[date] || [];

    games.forEach(game => {
        const matchupCard = document.createElement("div");
        matchupCard.className = "matchup-card";
        const [team1, team2] = game.projections;

        const gradeButton = game.grade && game.grade.isGraded
            ? `<button class="grade-button" data-game-id="${game.gameId}" data-date="${date}">View Prediction Grade</button>`
            : '';

        matchupCard.innerHTML = `
            <div class="matchup-header">
                <span class="matchup-header-teams">${team1.teamName} vs ${team2.teamName}</span>
                ${gradeButton}
            </div>
            <div class="matchup-body">
                ${createTeamTableHTML(team1)}
                ${createTeamTableHTML(team2)}
            </div>`;
        container.appendChild(matchupCard);
    });
}

function createTeamTableHTML(teamData) {
    const playersHtml = teamData.players
        .sort((a, b) => (b.Predicted_Minutes || 0) - (a.Predicted_Minutes || 0))
        .map(p => `
            <tr>
                <td>${p.Player_Name}</td>
                <td>${(p.Predicted_Minutes || 0).toFixed(1)}</td>
                <td>${(p.points || 0).toFixed(1)}</td>
                <td>${(p.reb || 0).toFixed(1)}</td>
                <td>${(p.ast || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.stl || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.blk || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.three_pm || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.tov || 0).toFixed(1)}</td>
                <td class="advanced-stat">${(p.fp || 0).toFixed(1)}</td>
            </tr>
        `).join('');

    return `
        <div class="team-box-score">
            <div class="team-header">
                <h3>${teamData.teamName} (${teamData.winProb}%)</h3>
                <div class="team-total">Proj. Total: <strong>${teamData.totalPoints.toFixed(1)}</strong></div>
            </div>
            <table class="daily-table">
                <thead>
                    <tr>
                        <th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th>
                        <th class="advanced-stat">STL</th><th class="advanced-stat">BLK</th>
                        <th class="advanced-stat">3PM</th><th class="advanced-stat">TOV</th>
                        <th class="advanced-stat">FP</th>
                    </tr>
                </thead>
                <tbody>${playersHtml}</tbody>
            </table>
        </div>`;
}


// --- GRADE MODAL ---
function showGradeOverlay(gameData) {
    const overlay = document.getElementById("grade-overlay");
    const modalContent = document.getElementById("grade-modal-content");
    
    modalContent.innerHTML = buildGradeModalHTML(gameData.grade);
    overlay.classList.add("visible");
    
    const closeModal = () => overlay.classList.remove("visible");
    overlay.querySelector(".modal-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", e => {
        if (e.target === overlay) closeModal();
    });
}

function createStatComparisonHTML(playerGrade) {
    return ["PTS", "REB", "AST", "STL", "BLK"].map(stat => {
        const pred = playerGrade.predicted[stat] || 0;
        const actual = playerGrade.actual[stat] || 0;
        const diff = actual - pred;
        const diffSign = diff >= 0 ? "+" : "";
        const diffClass = Math.abs(diff) > 2 ? 'negative' : 'positive';
        
        return `
            <div class="stat-comparison-group">
                <div class="stat-label">${stat}</div>
                <div class="stat-row">
                    <span class="stat-value-pred">${pred.toFixed(1)}</span>
                    <span class="stat-value-actual">${actual.toFixed(1)}</span>
                </div>
                <div class="stat-diff ${diffClass}">${diffSign}${diff.toFixed(1)}</div>
            </div>`;
    }).join('');
}

function buildGradeModalHTML(grade) {
    const [team1, team2] = Object.keys(grade.gameSummary.predicted);
    const gradeClass = `grade-${grade.overallGrade.replace('+', '-plus')}`;

    return `
    <div class="grade-modal-inner">
        <div class="modal-header">
            <h2>Prediction Grade</h2>
            <span class="grade-badge ${gradeClass}">${grade.overallGrade}</span>
            <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
            <div class="modal-sidebar">
                <div class="modal-section scoreboard">
                    <h3>📊 Game Score</h3>
                    <div class="scoreboard-grid">
                        <div class="team-name">${team1}</div><div>vs</div><div class="team-name">${team2}</div>
                        <div class="score-type">Predicted</div><div></div><div class="score-type">Predicted</div>
                        <div class="score">${grade.gameSummary.predicted[team1]}</div><div></div><div class="score">${grade.gameSummary.predicted[team2]}</div>
                        <div class="score-type">Actual</div><div></div><div class="score-type">Actual</div>
                        <div class="score">${grade.gameSummary.actual[team1]}</div><div></div><div class="score">${grade.gameSummary.actual[team2]}</div>
                    </div>
                </div>
                <div class="modal-section accuracy-breakdown">
                    <h3>🎯 Stat Accuracy (Avg. Error)</h3>
                    <table class="accuracy-table">
                        <tbody>
                            ${Object.entries(grade.statErrors).map(([stat, error]) => `
                                <tr><td>${stat}</td><td>${error.toFixed(2)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-main">
                <div class="modal-section">
                    <h3><span class="icon">⭐</span> Shining Stars (Most Accurate)</h3>
                    <ul class="player-grade-list">
                        ${grade.shiningStars.map(p => `
                            <li class="player-grade-item">
                                <div class="player-name">${p.playerName}</div>
                                <div class="stats-comparison">${createStatComparisonHTML(p)}</div>
                            </li>`).join('')}
                    </ul>
                </div>
                <div class="modal-section">
                     <h3><span class="icon">🔬</span> Tough Calls (Largest Misses)</h3>
                     <ul class="player-grade-list">
                        ${grade.toughCalls.map(p => `
                            <li class="player-grade-item">
                                <div class="player-name">${p.playerName}</div>
                                <div class="stats-comparison">${createStatComparisonHTML(p)}</div>
                            </li>`).join('')}
                     </ul>
                </div>
            </div>
        </div>
    </div>`;
}