// script.js (v27.1 - Definitive Data Integrity Fix)

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let loadedSeasonDataCache = {};
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;
let careerChartInstance = null;
let modalChartInstance = null;

const STAT_CONFIG = {
    PTS: { name: "PTS", zKey: "z_PTS" }, REB: { name: "REB", zKey: "z_REB" }, AST: { name: "AST", zKey: "z_AST" }, STL: { name: "STL", zKey: "z_STL" }, BLK: { name: "BLK", zKey: "z_BLK" }, '3PM': { name: "3PM", zKey: "z_3PM" }, TOV: { name: "TOV", zKey: "z_TOV" }, FG_impact: { name: "FG%", zKey: "z_FG_impact" }, FT_impact: { name: "FT%", zKey: "z_FT_impact" }
};
const ALL_STAT_KEYS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TOV", "FG_impact", "FT_impact"];
const TEAM_ANALYSIS_STATS = ["GP", "MPG", "PTS", "REB", "AST"];

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
        initializeCareerAnalysisTab();

        document.body.addEventListener('click', handleGlobalClicks);
        document.querySelector('.tab-link').click();

    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.body.innerHTML = `<div style="text-align:center; padding: 50px; font-size:1.2em;">Error: Could not load core application data. Please check the browser console (F12) for details. The "predictions.json" file may be missing or corrupt.<br><br><i>${e.message}</i></div>`;
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
        // FIX: Check for profile existence before showing overlay
        if (fullData.playerProfiles && fullData.playerProfiles[personId]) {
            showPlayerProfileOverlay(fullData.playerProfiles[personId], personId);
        } else {
            console.warn(`No profile found for personId: ${personId}. This is expected for some historical players.`);
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


// --- PLAYER PROFILE MODAL ---
async function showPlayerProfileOverlay(profile, personId) {
    const overlay = document.getElementById("player-profile-overlay");
    overlay.innerHTML = buildPlayerProfileModalHTML(profile);
    overlay.classList.add("visible");
    
    const chartToggle = overlay.querySelector('#chart-toggle-checkbox');
    const statlineToggle = overlay.querySelector('#statline-toggle-checkbox');
    const chartToggleContainer = overlay.querySelector('.chart-toggle-container');

    const renderContent = async () => {
        if (statlineToggle.checked) {
            if(chartToggleContainer) chartToggleContainer.style.display = 'none';
            await renderPlayerStatlineView(personId);
        } else {
            if(chartToggleContainer) chartToggleContainer.style.display = 'flex';
            if (chartToggle.checked) {
                 await renderPlayerCareerCurveChart(personId);
            } else {
                 renderPlayerPerformanceHistoryChart(profile);
            }
        }
    };
    
    await renderContent();
    chartToggle.addEventListener('change', renderContent);
    statlineToggle.addEventListener('change', renderContent);

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
            <div class="modal-toggles">
                 <div class="chart-toggle">
                    <span class="chart-toggle-label">Full Stat Line</span>
                    <label class="chart-toggle-switch">
                        <input type="checkbox" id="statline-toggle-checkbox">
                        <span class="chart-toggle-slider"></span>
                    </label>
                </div>
            </div>
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
                    <h3 id="modal-chart-title">Performance History</h3>
                     <div class="chart-toggle chart-toggle-container">
                        <span class="chart-toggle-label">Career Curve</span>
                        <label class="chart-toggle-switch">
                            <input type="checkbox" id="chart-toggle-checkbox">
                            <span class="chart-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="chart-wrapper" id="modal-chart-container"><canvas id="modal-chart"></canvas></div>
            </div>
        </div>
    </div>`;
}

async function renderPlayerStatlineView(personId) {
    document.getElementById('modal-chart-title').textContent = 'Historical Performance';
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
    
    container.innerHTML = `<div class="statline-placeholder"><p>Loading historical data...</p></div>`;

    const historicalSources = Object.keys(fullData.seasonLongDataManifest)
        .filter(k => k.startsWith('actuals_') && k.endsWith('_full_per_game'))
        .sort().reverse();
    
    let allStats = [];
    for (const sourceKey of historicalSources) {
        const seasonData = await fetchSeasonData(sourceKey);
        const playerData = seasonData?.find(p => p.personId === personId);
        if (playerData) {
            allStats.push({
                season: fullData.seasonLongDataManifest[sourceKey].label.replace(' Full Season', ''),
                ...playerData
            });
        }
    }

    if (allStats.length === 0) {
        container.innerHTML = `<div class="statline-placeholder"><p>No historical data found for this player.</p></div>`;
        return;
    }

    const tableHeaders = ['Season', 'Team', 'GP', 'MPG', 'PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'TOV', 'FG%', 'FT%'];
    const tableHTML = `
        <div class="table-container modal-table">
            <table>
                <thead>
                    <tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${allStats.map(s => `
                        <tr>
                            <td>${s.season || 'N/A'}</td>
                            <td>${s.team || 'N/A'}</td>
                            <td>${(s.GP || 0).toFixed(0)}</td>
                            <td>${(s.MIN || 0).toFixed(1)}</td>
                            <td>${(s.PTS || 0).toFixed(1)}</td>
                            <td>${(s.REB || 0).toFixed(1)}</td>
                            <td>${(s.AST || 0).toFixed(1)}</td>
                            <td>${(s.STL || 0).toFixed(1)}</td>
                            <td>${(s.BLK || 0).toFixed(1)}</td>
                            <td>${(s['3PM'] || 0).toFixed(1)}</td>
                            <td>${(s.TOV || 0).toFixed(1)}</td>
                            <td>${(s.FGA > 0 ? (s.FGM / s.FGA * 100) : 0).toFixed(1)}%</td>
                            <td>${(s.FTA > 0 ? (s.FTM / s.FTA * 100) : 0).toFixed(1)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    container.innerHTML = tableHTML;
}

async function renderPlayerPerformanceHistoryChart(profile) {
    document.getElementById('modal-chart-title').textContent = 'Performance History (Predicted vs Actual)';
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    const history = profile.performanceHistory;
    if (!history || history.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">No recent performance history available.</p>';
        return;
    }
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(d => new Date(d.date + "T00:00:00").toLocaleDateString('en-US', {month: 'short', day: 'numeric'})),
            datasets: [
                { label: 'Actual PTS', data: history.map(d => d.actual_pts), borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)', fill: false, tension: 0.1 },
                { label: 'Predicted PTS', data: history.map(d => d.predicted_pts), borderColor: 'var(--text-secondary)', backgroundColor: 'var(--text-secondary)', borderDash: [5, 5], fill: false, tension: 0.1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

async function renderPlayerCareerCurveChart(personId) {
    document.getElementById('modal-chart-title').textContent = 'Career Curve (Monthly PTS Avg)';
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    const careerData = await fetchSeasonData('career_data');
    const playerData = careerData?.players?.[personId];
    if (!playerData || playerData.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">No long-term career data available for this player.</p>';
        return;
    }
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets: [{ label: 'Monthly PTS Average', data: playerData.map(d => ({ x: d.x_games, y: d.PTS })), borderColor: 'var(--primary-color)', backgroundColor: 'var(--primary-color)', tension: 0.1, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { type: 'linear', title: { display: true, text: 'NBA Games Played' } }, y: { title: { display: true, text: 'Points Per Game' } } } }
    });
}

// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    const manifest = fullData.seasonLongDataManifest || {};
    const seasonSelector = document.getElementById("season-selector");
    const splitSelector = document.getElementById("split-selector");

    const sourcesBySeason = {};
    for (const key in manifest) {
        const match = key.match(/(projections|\d{4})/);
        if (!match) continue;
        const year = match[1];
        if (!sourcesBySeason[year]) sourcesBySeason[year] = [];
        let splitKey = "projections";
        if (key.includes('full')) splitKey = 'full';
        else if (key.includes('pre_trade')) splitKey = 'pre_trade';
        else if (key.includes('post_trade')) splitKey = 'post_trade';
        const sourceObject = { key: key.replace(/_per_game|_total/g, ''), label: manifest[key].label, split: splitKey };
        if (!sourcesBySeason[year].some(s => s.key === sourceObject.key)) { sourcesBySeason[year].push(sourceObject); }
    }

    const sortedSeasons = Object.keys(sourcesBySeason).sort((a, b) => {
        if (a.includes('proj')) return -1;
        if (b.includes('proj')) return 1;
        return b.localeCompare(a);
    });

    seasonSelector.innerHTML = sortedSeasons.map(year => {
        const repSource = sourcesBySeason[year].find(s => s.split === 'full' || s.split === 'projections');
        const label = repSource ? repSource.label.match(/(\d{4}-\d{2})|(\d{4}-\d{2}\s\w+)|(Projections)/)[0] : year;
        return `<option value="${year}">${label.replace(/ Full Season/g, '')}</option>`;
    }).join('');

    function updateSplitSelector() {
        const selectedYear = seasonSelector.value;
        const splits = sourcesBySeason[selectedYear];
        const splitLabels = { 'projections': 'Projections', 'full': 'Full Season', 'pre_trade': 'Pre-Trade Deadline', 'post_trade': 'Post-Trade Deadline' };
        splitSelector.innerHTML = splits.map(s => `<option value="${s.key}">${splitLabels[s.split]}</option>`).join('');
    }

    seasonSelector.addEventListener('change', () => { updateSplitSelector(); renderSeasonTable(); });
    splitSelector.addEventListener('change', renderSeasonTable);
    updateSplitSelector();

    document.getElementById("category-weights-grid").innerHTML = ALL_STAT_KEYS.map(key => `<div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${STAT_CONFIG[key].name}</label></div>`).join('');
    document.getElementById("season-controls")?.addEventListener("change", renderSeasonTable);
    document.getElementById("search-player")?.addEventListener("input", renderSeasonTable);
    document.getElementById("predictions-thead")?.addEventListener("click", handleSortSeason);
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
    if (!data) { tbody.innerHTML = `<tr><td colspan="17" class="error-cell">Could not load data for '${sourceKey}.json'.</td></tr>`; return; }
    
    // FIX [Z-Score Philosophy]: Re-calculate the displayed Total based ONLY on the sum of z-scores for active categories.
    let processedData = data.map(player => {
        const pg_z_score = Array.from(settings.activeCategories).reduce((acc, catKey) => acc + (player[STAT_CONFIG[catKey].zKey] || 0), 0)
        return {
            ...player,
            custom_z_score_display: pg_z_score
        }
    });
    
    // Always sort by the full, unpunted value for consistency, but display the punted value.
    currentSort.column = 'custom_z_score'; 
    currentSort.direction = 'desc';

    if (settings.searchTerm) {
        processedData = processedData.filter(p => p.playerName?.toLowerCase().includes(settings.searchTerm));
    }

    currentSort.data = processedData;
    sortSeasonData(); // Sorts based on currentSort state
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
        // Default sort direction
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
    thead.innerHTML = `<tr><th>R#</th><th data-sort-key="playerName">Player</th><th data-sort-key="position">Pos</th><th data-sort-key="team">Team</th><th data-sort-key="GP">GP</th><th data-sort-key="MIN">MPG</th>${ALL_STAT_KEYS.map(k=>`<th data-sort-key="${k.replace(/_impact/g, '')}">${STAT_CONFIG[k].name}</th>`).join('')}<th data-sort-key="custom_z_score">TOTAL▼</th></tr>`;
    document.querySelectorAll('#predictions-thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    const currentTh = thead.querySelector(`[data-sort-key="${currentSort.column}"]`);
    if(currentTh) currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];
    if (!dataToRender.length) { tbody.innerHTML = `<tr><td colspan="17" class="error-cell">No players match criteria.</td></tr>`; return; }
    
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1.0 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1.0 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    const isTotalMode = document.getElementById("calculation-mode").value === 'total';
    
    tbody.innerHTML = dataToRender.map((p, i) => {
        const mpg = p.MIN || 0;
        const gp = p.GP || 1;
        
        return `
        <tr>
            <td>${i + 1}</td>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a></td>
            <td>${p.position || 'N/A'}</td>
            <td>${p.team || 'N/A'}</td>
            <td>${gp}</td>
            <td>${(isTotalMode ? mpg / gp : mpg).toFixed(1)}</td>

            ${ALL_STAT_KEYS.map(key => {
                const zKey = STAT_CONFIG[key].zKey;
                const zValue = p[zKey] || 0;
                let displayValue;
                const rawKey = key.replace('_impact', '');
                const value = p[rawKey] || 0;

                if (key.includes('_impact')) {
                    const made = key === 'FG_impact' ? p.FGM : p.FTM;
                    const att = key === 'FG_impact' ? p.FGA : p.FTA;
                    displayValue = att > 0 ? (made / att).toFixed(3) : (p[key === 'FG_impact' ? 'FG_pct' : 'FT_pct'] || 0).toFixed(3);
                } else {
                    displayValue = (isTotalMode ? value : value / gp).toFixed(isTotalMode ? 0 : 1);
                }
                
                return `<td class="stat-cell ${getZClass(zValue)}"><span class="stat-value">${displayValue}</span><span class="z-score-value">${zValue.toFixed(2)}</span></td>`;
            }).join('')}
            <td>${p.custom_z_score_display.toFixed(2)}</td>
        </tr>`
    }).join('');
}

// --- DAILY PROJECTIONS TAB ---
function initializeDailyTab() {
    const accuracySelector = document.getElementById("accuracy-metric-selector");
    if (accuracySelector) accuracySelector.addEventListener('change', renderAccuracyChart);
    const dateTabs = document.getElementById("daily-date-tabs");
    const sortedDates = fullData.dailyGamesByDate ? Object.keys(fullData.dailyGamesByDate).sort((a, b) => new Date(b) - new Date(a)) : [];
    if (!sortedDates.length) {
        document.getElementById("daily-games-container").innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
        if (document.getElementById("accuracy-chart-container")) document.getElementById("accuracy-chart-container").style.display = 'none';
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
    if (games.length === 0) { container.innerHTML = '<div class="card"><p>No games for this date.</p></div>'; return; }
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';

    container.innerHTML = games.map(game => {
        const [team1, team2] = game.projections;
        let scoreHTML = `Predicted: <strong>${team1.totalPoints}-${team2.totalPoints}</strong>`;
        if (game.grade?.isGraded) {
            const actual1 = Object.values(game.grade.gameSummary.actual)[0];
            const actual2 = Object.values(game.grade.gameSummary.actual)[1];
            scoreHTML += ` | Actual: <strong class="actual-score ${game.grade.correctWinner ? 'prediction-correct' : 'prediction-incorrect'}">${actual1}-${actual2}</strong>`;
        }
        const createCompactSummary = (teamData) => teamData.players.sort((a, b) => (b.Predicted_Minutes || 0) - (a.Predicted_Minutes || 0)).slice(0, 5).map(p => `<div class="compact-player-badge ${getZClass((p.points-15)/8)}" title="${p.Player_Name} (Proj. ${p.points} pts)">${p.Player_Name.split(' ').pop()}</div>`).join('');
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
        if (relativeError < 0.20) return 'pi-good';
        if (relativeError > 0.60 && diff > 3) return 'pi-bad';
        return 'pi-neutral';
    };
    const playersHtml = teamData.players.sort((a, b) => (b.Predicted_Minutes || 0) - (a.Predicted_Minutes || 0)).map(p => {
        const pId = p.personId || p.Player_ID, actuals = isGraded ? gameGrade.playerActuals?.[pId] : null;
        const nameHtml = `<a href="#" class="player-link" data-person-id="${pId}">${p.Player_Name}</a>`;
        const predRow = `<tr class="player-row-pred"><td rowspan="${isGraded ? 2 : 1}" class="player-name-cell">${nameHtml}</td><td class="stat-type-cell">P</td><td>${(p.Predicted_Minutes||0).toFixed(1)}</td><td>${(p.points||0).toFixed(1)}</td><td>${(p.reb||0).toFixed(1)}</td><td>${(p.ast||0).toFixed(1)}</td></tr>`;
        const actualRow = isGraded && actuals ? `<tr class="player-row-actual">
                <td class="stat-type-cell">A</td>
                <td>-</td>
                <td>${actuals.PTS.toFixed(0)}<span class="performance-indicator ${getPerfIndicator(p.points, actuals.PTS)}"></span></td>
                <td>${actuals.REB.toFixed(0)}<span class="performance-indicator ${getPerfIndicator(p.reb, actuals.REB)}"></span></td>
                <td>${actuals.AST.toFixed(0)}<span class="performance-indicator ${getPerfIndicator(p.ast, actuals.AST)}"></span></td>
            </tr>` : isGraded ? `<tr class="player-row-actual"><td class="stat-type-cell">A</td><td colspan="4" style="text-align:center;">DNP</td></tr>` : '';
        return predRow + actualRow;
    }).join('');
    return `<div class="team-box-score"><h3 class="team-header">${teamData.teamName}</h3><table class="daily-table"><thead><tr><th style="text-align:left;">Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${playersHtml}</tbody></table></div>`;
}

function renderAccuracyChart() {
    const container = document.getElementById("accuracy-chart-container");
    if(!container) return;
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
            chartConfig = { type: 'line', data: { datasets: [{ label: 'Cumulative W/L %', data: cumulativeData, borderColor: 'var
