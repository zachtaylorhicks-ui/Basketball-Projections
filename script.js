// script.js (v22.0 - Definitive Restoration & Enhancement)

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

        document.body.addEventListener('click', handlePlayerLinkClick);
        // Set the first tab as active
        document.querySelector('.tab-link').click();

    } catch (e) {
        console.error("FATAL: Failed to initialize application.", e);
        document.body.innerHTML = `<div style="text-align:center; padding: 50px; font-size:1.2em;">Error: Could not load core application data. ${e.message}</div>`;
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

// --- DATA FETCHING UTILITY ---
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

// --- PLAYER PROFILE MODAL ---
async function handlePlayerLinkClick(e) {
    const link = e.target.closest('.player-link');
    if (!link) return;
    e.preventDefault();
    const personId = parseInt(link.dataset.personId, 10);
    const profile = fullData.playerProfiles?.[personId];
    if (!profile) return;
    await showPlayerProfileOverlay(profile, personId);
}

async function showPlayerProfileOverlay(profile, personId) {
    const overlay = document.getElementById("player-profile-overlay");
    overlay.innerHTML = buildPlayerProfileModalHTML(profile);
    overlay.classList.add("visible");
    
    const chartToggle = overlay.querySelector('#chart-toggle-checkbox');
    const renderChart = () => {
        if (chartToggle.checked) {
             renderPlayerCareerCurveChart(personId);
        } else {
             renderPlayerPerformanceHistoryChart(profile);
        }
    };
    
    renderChart(); // Initial render
    chartToggle.addEventListener('change', renderChart);

    const closeModal = () => {
        overlay.classList.remove("visible");
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
    };
    overlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
}

function buildPlayerProfileModalHTML(profile) {
    const wikiLink = profile.wikiUrl ? `<a href="${profile.wikiUrl}" target="_blank" rel="noopener noreferrer">View on Wikipedia</a>` : 'N/A';
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
                    <div class="profile-info-item"><div class="profile-info-label">External Link</div><div class="profile-info-value">${wikiLink}</div></div>
                </div>
            </div>
            <div class="profile-main">
                <div class="profile-main-header">
                    <h3 id="modal-chart-title">Performance History (Predicted vs Actual)</h3>
                    <div class="chart-toggle">
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

function renderPlayerPerformanceHistoryChart(profile) {
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
                {
                    label: 'Actual PTS',
                    data: history.map(d => d.actual_pts),
                    borderColor: 'var(--primary-color)',
                    backgroundColor: 'var(--primary-color)',
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Predicted PTS',
                    data: history.map(d => d.predicted_pts),
                    borderColor: 'var(--text-secondary)',
                    backgroundColor: 'var(--text-secondary)',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1
                }
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
        data: {
            datasets: [{
                label: 'Monthly PTS Average',
                data: playerData.map(d => ({ x: d.x_games, y: d.PTS })),
                borderColor: 'var(--primary-color)',
                backgroundColor: 'var(--primary-color)',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'NBA Games Played' } },
                y: { title: { display: true, text: 'Points Per Game' } }
            }
        }
    });
}


// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    const selector = document.getElementById("data-source-selector");
    const manifest = fullData.seasonLongDataManifest || {};
    const sources = Object.keys(manifest)
      .filter(key => key.includes('projections') || key.includes('actuals'))
      .map(key => key.replace(/_per_game|_total/g, ''))
      .filter((v, i, a) => a.indexOf(v) === i) // Unique keys
      .sort((a,b) => b.localeCompare(a));
    
    selector.innerHTML = sources.map(key => `<option value="${key}">${manifest[key+'_per_game']?.label || key}</option>`).join('');

    document.getElementById("category-weights-grid").innerHTML = ALL_STAT_KEYS.map(key => `
        <div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${STAT_CONFIG[key].name || key}</label></div>
    `).join('');

    document.getElementById("season-controls")?.addEventListener("change", renderSeasonTable);
    document.getElementById("search-player")?.addEventListener("input", renderSeasonTable);
    document.getElementById("predictions-thead")?.addEventListener("click", handleSortSeason);
    renderSeasonTable();
}

async function renderSeasonTable() {
    const settings = {
        sourceBaseKey: document.getElementById("data-source-selector").value,
        calcMode: document.getElementById("calculation-mode").value,
        showCount: parseInt(document.getElementById("show-count").value, 10),
        searchTerm: document.getElementById("search-player").value.toLowerCase().trim(),
        activeCategories: new Set(Array.from(document.querySelectorAll("#category-weights-grid input:checked")).map(cb => cb.dataset.key))
    };
    const sourceKey = `${settings.sourceBaseKey}_${settings.calcMode}`;
    const tbody = document.getElementById("predictions-tbody");
    tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;">Loading player data...</td></tr>`;
    
    const data = await fetchSeasonData(sourceKey);
    if (!data) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center; color: var(--danger-color);">Could not load data for this source. It may not exist for the selected calculation mode.</td></tr>`;
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
    const th = e.target.closest("th");
    const sortKey = th?.dataset.sortKey;
    if (!sortKey) return;

    if (currentSort.column === sortKey) {
        currentSort.direction = currentSort.direction === "desc" ? "asc" : "desc";
    } else {
        currentSort.column = sortKey;
        currentSort.direction = ["playerName", "pos", "team"].includes(sortKey) ? "asc" : "desc";
    }
    
    // Visual indicator
    document.querySelectorAll('#predictions-thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

    sortSeasonData();
    renderSeasonTableBody(parseInt(document.getElementById("show-count").value, 10));
}

function sortSeasonData() {
    const { column, direction, data } = currentSort;
    if (!data) return;
    const mod = direction === "asc" ? 1 : -1;
    data.sort((a, b) => {
        let valA = a[column] ?? (column.startsWith('z_') || column === 'custom_z_score' ? -Infinity : '');
        let valB = b[column] ?? (column.startsWith('z_') || column === 'custom_z_score' ? -Infinity : '');
        if (typeof valA === 'string') return valA.localeCompare(valB) * mod;
        return (valA - valB) * mod;
    });
}

function renderSeasonTableBody(showCount) {
    const thead = document.getElementById("predictions-thead");
    thead.innerHTML = `
        <tr>
            <th data-sort-key="rank">R#</th>
            <th data-sort-key="playerName">Player</th>
            <th data-sort-key="pos">Pos</th>
            <th data-sort-key="team">Team</th>
            <th data-sort-key="GP">GP</th>
            <th data-sort-key="MIN">MPG</th>
            ${ALL_STAT_KEYS.map(key => `<th data-sort-key="${STAT_CONFIG[key].zKey}">${STAT_CONFIG[key].name}</th>`).join('')}
            <th data-sort-key="custom_z_score">TOTAL</th>
        </tr>`;

    // Re-apply sort indicator
    const currentTh = thead.querySelector(`[data-sort-key="${currentSort.column}"]`);
    if(currentTh) currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];
    
    if (!dataToRender.length) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;">No players match criteria.</td></tr>`;
        return;
    }
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1.0 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1.0 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    
    tbody.innerHTML = dataToRender.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a></td>
            <td>${p.pos || 'N/A'}</td>
            <td>${p.team || 'N/A'}</td>
            <td>${p.GP || 0}</td>
            <td>${(p.MIN || 0).toFixed(1)}</td>
            ${ALL_STAT_KEYS.map(key => {
                const zKey = STAT_CONFIG[key].zKey;
                const value = p[key.replace('_impact', '')] || 0;
                const zValue = p[zKey] || 0;
                return `<td class="stat-cell ${getZClass(zValue)}">
                    <span class="stat-value">${value.toFixed(key.includes('impact') ? 2 : 1)}</span>
                    <span class="z-score-value">${zValue.toFixed(2)}</span>
                </td>`;
            }).join('')}
            <td>${p.custom_z_score.toFixed(2)}</td>
        </tr>`).join('');
}


// --- DAILY PROJECTIONS TAB ---
function initializeDailyTab() {
    const accuracySelector = document.getElementById("accuracy-metric-selector");
    if(accuracySelector) accuracySelector.addEventListener('change', renderAccuracyChart);
    
    const dateTabs = document.getElementById("daily-date-tabs");
    const sortedDates = fullData.dailyGamesByDate ? Object.keys(fullData.dailyGamesByDate).sort((a, b) => new Date(b) - new Date(a)) : [];
    
    if (!sortedDates.length) {
        document.getElementById("daily-games-container").innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
        document.getElementById("accuracy-chart-container").style.display = 'none';
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
    
    document.getElementById("toggle-advanced-stats")?.addEventListener('click', e => {
        document.getElementById('daily-games-container').classList.toggle('show-advanced');
        e.target.textContent = e.target.textContent.includes('Show') ? 'Hide Advanced Stats' : 'Show Advanced Stats';
    });
    
    renderAccuracyChart();
    renderDailyGamesForDate(sortedDates[0]);
}
function renderDailyGamesForDate(date) {
    const container = document.getElementById("daily-games-container");
    const games = fullData.dailyGamesByDate?.[date] || [];
    if (games.length === 0) {
        container.innerHTML = '<div class="card"><p>No games for this date.</p></div>';
        return;
    }
    container.innerHTML = games.map(game => {
        const [team1, team2] = game.projections;
        let scoreHTML = `Predicted: <strong>${team1.totalPoints}-${team2.totalPoints}</strong>`;
        if (game.grade?.isGraded) {
            const actual1 = Object.values(game.grade.gameSummary.actual)[0];
            const actual2 = Object.values(game.grade.gameSummary.actual)[1];
            scoreHTML += ` | Actual: <strong class="actual-score">${actual1}-${actual2}</strong>`;
        }
        return `
        <div class="matchup-card">
            <div class="matchup-header">
                <span class="matchup-teams">${team1.teamName} (${team1.winProb}%) vs ${team2.teamName} (${team2.winProb}%)</span>
                <span class="matchup-scores">${scoreHTML}</span>
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
            const pId = p.personId || p.Player_ID;
            const actuals = isGraded ? gameGrade.playerActuals?.[pId] : null;
            const nameHtml = `<a href="#" class="player-link" data-person-id="${pId}">${p.Player_Name}</a>`;
            const statsRow = (type, stats, isPred) => {
                const pts = stats.points || stats.PTS || 0;
                const reb = stats.reb || stats.REB || 0;
                const ast = stats.ast || stats.AST || 0;
                const stl = stats.stl || stats.STL || 0;
                const blk = stats.blk || stats.BLK || 0;
                
                const indicator = (statName) => isPred || !isGraded || !actuals ? '' : `<span class="performance-indicator ${getPerfIndicator(p[statName.toLowerCase()], stats[statName.toUpperCase()])}"></span>`;

                return `
                    <td class="stat-type-cell">${type}</td>
                    <td>${isPred ? (p.Predicted_Minutes || 0).toFixed(1) : '-'}</td>
                    <td>${pts.toFixed(1)}${indicator('points')}</td>
                    <td>${reb.toFixed(1)}${indicator('reb')}</td>
                    <td>${ast.toFixed(1)}${indicator('ast')}</td>
                    <td class="advanced-stat">${stl.toFixed(1)}${indicator('stl')}</td>
                    <td class="advanced-stat">${blk.toFixed(1)}${indicator('blk')}</td>
                `;
            };

            let rows = `<tr><td rowspan="${isGraded ? 2 : 1}" class="player-name-cell">${nameHtml}</td>${statsRow('P', p, true)}</tr>`;
            if (isGraded) {
                rows += `<tr>${actuals ? statsRow('A', actuals, false) : '<td colspan="7" style="text-align:center;">DNP</td>'}</tr>`;
            }
            return rows;
        }).join('');

    return `<div class="team-box-score">
        <h3 class="team-header">${teamData.teamName}</h3>
        <table class="daily-table">
            <thead><tr><th>Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th class="advanced-stat">STL</th><th class="advanced-stat">BLK</th></tr></thead>
            <tbody>${playersHtml}</tbody>
        </table>
    </div>`;
}

function renderAccuracyChart() {
    const container = document.getElementById("accuracy-chart-container");
    if(!container) return;
    const chartCanvas = document.getElementById('accuracy-chart');
    if (!chartCanvas || !fullData.historicalGrades || fullData.historicalGrades.length < 1) {
        container.style.display = 'none'; return;
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


// --- TEAM ANALYSIS TAB ---
function initializeTeamAnalysisTab() {
    const selector = document.getElementById("team-analysis-source-selector");
    const manifest = fullData.seasonLongDataManifest || {};
    const sources = Object.keys(manifest)
      .filter(key => key.endsWith('_per_game'))
      .sort((a,b) => b.localeCompare(a));
    
    selector.innerHTML = sources.map(key => `<option value="${key}">${manifest[key].label}</option>`).join('');
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
        custom_z_score: ALL_STAT_KEYS.reduce((acc, key) => acc + (player[STAT_CONFIG[key].zKey] || 0), 0)
    }));
    
    const teams = dataWithZ.reduce((acc, p) => {
        const teamName = p.team || 'Free Agents';
        (acc[teamName] = acc[teamName] || []).push(p);
        return acc;
    }, {});

    container.innerHTML = Object.entries(teams).sort(([teamA], [teamB]) => {
        if(teamA === 'Free Agents') return 1;
        if(teamB === 'Free Agents') return -1;
        const strengthA = teams[teamA].reduce((s,p) => s + p.custom_z_score, 0);
        const strengthB = teams[teamB].reduce((s,p) => s + p.custom_z_score, 0);
        return strengthB - strengthA;
    }).map(([teamName, players]) => {
        const teamStrength = players.reduce((sum, p) => sum + p.custom_z_score, 0);
        const playerRows = players.sort((a,b) => b.custom_z_score - a.custom_z_score).map(p => `
            <tr>
                <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td>
                ${TEAM_ANALYSIS_STATS.map(stat => `<td>${(p[stat] || 0).toFixed(stat === 'GP' ? 0 : 1)}</td>`).join('')}
                <td>${p.custom_z_score.toFixed(2)}</td>
            </tr>`).join('');
        return `<div class="team-card">
            <div class="team-card-header"><h3>${teamName}</h3><div class="team-strength-score">${teamStrength.toFixed(2)}</div></div>
            <div class="table-container">
                <table>
                    <thead><tr><th>Player</th>${TEAM_ANALYSIS_STATS.map(s => `<th>${s}</th>`).join('')}<th>Score</th></tr></thead>
                    <tbody>${playerRows}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}


// --- PLAYER PROGRESSION TAB ---
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
        ${createProgressionTable('Top 25 Risers', risers)}
        ${createProgressionTable('Top 25 Fallers', fallers)}
    `;
}
function createProgressionTable(title, players) {
    const rows = players.map(p => `
        <tr>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td>
            <td>${p.team}</td>
            <td>${p.z_Total_2024.toFixed(2)}</td>
            <td>${p.z_Total_2025_Proj.toFixed(2)}</td>
            <td class="${p.z_Change >= 0 ? 'text-success' : 'text-danger'}">${p.z_Change >= 0 ? '+' : ''}${p.z_Change.toFixed(2)}</td>
        </tr>
    `).join('');
    return `
        <div class="card">
            <h3>${title}</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Player</th><th>Team</th><th>'24 Z-Score</th><th>'25 Proj. Z-Score</th><th>Change</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

// --- CAREER ANALYSIS TAB ---
function initializeCareerAnalysisTab() {
    const controls = document.getElementById("career-controls");
    controls?.addEventListener('change', renderCareerChart);
    controls?.querySelector('#career-search-player').addEventListener('input', renderCareerChart);
    renderCareerChart();
}

async function renderCareerChart() {
    const chartWrapper = document.getElementById("career-chart-wrapper");
    if (careerChartInstance) careerChartInstance.destroy();
    chartWrapper.innerHTML = '<canvas id="career-chart"></canvas>';
    const ctx = document.getElementById('career-chart').getContext('2d');

    const careerData = await fetchSeasonData('career_data');
    if (!careerData || !careerData.players) {
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
    const allPlayersData = Object.entries(careerData.players).map(([id, data]) => {
        const isHighlighted = parseInt(id) === highlightedPlayerId;
        return {
            label: `Player ${id}`,
            data: data.map(d => ({ x: d[xAxis], y: d[stat] })),
            borderColor: isHighlighted ? 'var(--warning-color)' : 'rgba(128, 128, 128, 0.1)',
            borderWidth: isHighlighted ? 3 : 1,
            pointRadius: 0,
            showLine: true,
            order: isHighlighted ? 0 : 1 // Render highlighted player on top
        };
    });
    datasets.push(...allPlayersData);

    if (highlightedPlayerId) {
        // Fetch last full season data to get draft info
        const playerInfoFromHist = (await fetchSeasonData('actuals_2024_full_per_game'))?.find(p => p.personId === highlightedPlayerId);
        const playerProfile = fullData.playerProfiles[highlightedPlayerId];

        if (playerInfoFromHist && playerProfile) {
            // Attempt to get draft year/number from profile if available, fallback to historical
            const draftInfoStr = playerProfile.draftInfo || '';
            const draftYearMatch = draftInfoStr.match(/(\d{4}) \/ Round/);
            const draftPickMatch = draftInfoStr.match(/Pick (\d+)/);
            
            const draftYear = draftYearMatch ? parseInt(draftYearMatch[1]) : playerInfoFromHist.draftYear;
            const draftNumber = draftPickMatch ? parseInt(draftPickMatch[1]) : playerInfoFromHist.draftNumber;
            
            const binSize = careerData.game_bin_size;

            if(draftYear && careerData.by_year?.[draftYear]) {
                datasets.push({ label: `Avg. Draft Year ${draftYear}`, data: careerData.by_year[draftYear].map(d => ({ x: xAxis === 'age' ? d.age : d.game_bin * binSize, y: d[stat] })), borderColor: 'var(--success-color)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, showLine: true, order: 2 });
            }
            if(draftNumber && careerData.by_pick?.[draftNumber]) {
                datasets.push({ label: `Avg. Draft Pick #${draftNumber}`, data: careerData.by_pick[draftNumber].map(d => ({ x: xAxis === 'age' ? d.age : d.game_bin * binSize, y: d[stat] })), borderColor: 'var(--danger-color)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, showLine: true, order: 3 });
            }
        }
    }
    
    careerChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
            plugins: {
                legend: { labels: { filter: item => !item.label.startsWith('Player') } },
                decimation: { enabled: true, algorithm: 'lttb', samples: 200 },
                tooltip: { enabled: false }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: xAxis === 'age' ? 'Player Age' : 'NBA Games Played' } },
                y: { title: { display: true, text: `Monthly Average ${stat}` } }
            }
        }
    });
}