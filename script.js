// script.js (v27.0 - Definitive and Stable)

// --- GLOBAL STATE & CONFIGURATION ---
let fullData = {};
let loadedSeasonDataCache = {};
let currentSort = { column: "custom_z_score", direction: "desc" };
let accuracyChartInstance = null;
let careerChartInstance = null;
let modalChartInstance = null;

const STAT_CONFIG = {
    PTS: { name: "PTS", zKey: "z_PTS", color: '#0d6efd' }, 
    REB: { name: "REB", zKey: "z_REB", color: '#198754' }, 
    AST: { name: "AST", zKey: "z_AST", color: '#ffc107' }, 
    STL: { name: "STL", zKey: "z_STL", color: '#dc3545' }, 
    BLK: { name: "BLK", zKey: "z_BLK", color: '#8e44ad' }, 
    '3PM': { name: "3PM", zKey: "z_3PM" }, 
    TOV: { name: "TOV", zKey: "z_TOV" }, 
    FG_impact: { name: "FG%", zKey: "z_FG_impact" }, 
    FT_impact: { name: "FT%", zKey: "z_FT_impact" }
};
const ALL_STAT_KEYS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TOV", "FG_impact", "FT_impact"];
const TEAM_ANALYSIS_STATS = ["GP", "MIN", "PTS", "REB", "AST"];
const CHART_STATS = ['PTS', 'REB', 'AST', 'STL', 'BLK'];

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
        const profile = fullData.playerProfiles?.[personId];
        if (profile) showPlayerProfileOverlay(profile, personId);
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
    
    const careerToggle = overlay.querySelector('#career-toggle-checkbox');
    const statlineToggle = overlay.querySelector('#statline-toggle-checkbox');

    const renderContent = async () => {
        const showFullStatLine = statlineToggle.checked;
        if (careerToggle.checked) {
            await renderPlayerCareerCurveChart(personId, showFullStatLine);
        } else {
            renderPlayerPerformanceHistoryChart(profile, showFullStatLine);
        }
    };
    
    await renderContent();
    careerToggle.addEventListener('change', renderContent);
    statlineToggle.addEventListener('change', renderContent);

    const closeModal = () => {
        overlay.classList.remove("visible");
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
            <h2>${profile.name}</h2>
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
                     <div class="chart-toggle">
                        <span class="chart-toggle-label">Career Curve</span>
                        <label class="chart-toggle-switch">
                            <input type="checkbox" id="career-toggle-checkbox">
                            <span class="chart-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="chart-wrapper" id="modal-chart-container"><canvas id="modal-chart"></canvas></div>
            </div>
        </div>
    </div>`;
}

function renderPlayerPerformanceHistoryChart(profile, showFullStatLine) {
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    
    document.getElementById('modal-chart-title').textContent = `Performance History ${showFullStatLine ? '(Full Stat Line)' : '(Points)'}`;

    const history = profile.performanceHistory;
    if (!history || history.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">No recent performance history available.</p>';
        return;
    }

    const statsToChart = showFullStatLine ? CHART_STATS : ['PTS'];
    const datasets = [];

    statsToChart.forEach(stat => {
        const statLower = stat.toLowerCase();
        datasets.push({
            label: `Actual ${stat}`,
            data: history.map(d => d[`actual_${statLower}`] ?? d.actual_pts),
            borderColor: STAT_CONFIG[stat].color,
            backgroundColor: STAT_CONFIG[stat].color,
            yAxisID: `y-${stat}`,
            tension: 0.1
        });
        datasets.push({
            label: `Predicted ${stat}`,
            data: history.map(d => d[`predicted_${statLower}`] ?? d.predicted_pts),
            borderColor: STAT_CONFIG[stat].color,
            backgroundColor: STAT_CONFIG[stat].color,
            borderDash: [5, 5],
            yAxisID: `y-${stat}`,
            tension: 0.1
        });
    });

    const scales = { x: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } } };
    statsToChart.forEach(stat => { scales[`y-${stat}`] = { type: 'linear', display: false, beginAtZero: true }; });
    
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(d => new Date(d.date + "T00:00:00").toLocaleDateString('en-US', {month: 'short', day: 'numeric'})),
            datasets: datasets
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: scales }
    });
}

async function renderPlayerCareerCurveChart(personId, showFullStatLine) {
    const container = document.getElementById('modal-chart-container');
    if (modalChartInstance) modalChartInstance.destroy();
    container.innerHTML = '<canvas id="modal-chart"></canvas>';
    const ctx = document.getElementById('modal-chart').getContext('2d');
    
    document.getElementById('modal-chart-title').textContent = `Career Curve ${showFullStatLine ? '(Full Stat Line)' : '(Points)'}`;
    
    const careerData = await fetchSeasonData('career_data');
    const playerData = careerData?.players?.[personId];
    if (!playerData || playerData.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">No long-term career data available.</p>';
        return;
    }
    
    const statsToChart = showFullStatLine ? CHART_STATS : ['PTS'];
    const datasets = [];

    statsToChart.forEach(stat => {
        datasets.push({
            label: `Avg ${stat}`,
            data: playerData.map(d => ({ x: d.game_bin * careerData.bin_size, y: d[stat] })),
            borderColor: STAT_CONFIG[stat].color,
            backgroundColor: STAT_CONFIG[stat].color,
            yAxisID: `y-${stat}`,
            tension: 0.1
        });
    });

    const scales = { x: { type: 'linear', title: { display: true, text: `Games Played (in blocks of ${careerData.bin_size})` }, ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } } };
    statsToChart.forEach(stat => { scales[`y-${stat}`] = { type: 'linear', display: false, beginAtZero: true }; });

    modalChartInstance = new Chart(ctx, {
        type: 'line', data: { datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: scales }
    });
}


// --- SEASON-LONG RANKINGS TAB ---
function initializeSeasonTab() {
    const controls = document.getElementById("season-controls");
    controls.addEventListener("change", renderSeasonTable);
    controls.addEventListener("input", renderSeasonTable);
    document.getElementById("predictions-thead").addEventListener("click", handleSortSeason);
    populateFilterOptions();
    renderSeasonTable();
}

async function populateFilterOptions() {
    const dataSource = document.getElementById("data-source-selector");
    const manifest = fullData.seasonLongDataManifest || {};
    const sources = Object.keys(manifest).map(k => k.replace(/_per_game|_total/g, '')).filter((v, i, a) => a.indexOf(v) === i).sort((a,b) => { const yearA = a.match(/\d{4}/); const yearB = b.match(/\d{4}/); if (yearA && yearB && yearB[0] !== yearA[0]) return yearB[0] - yearA[0]; if (a.includes('proj')) return -1; if (b.includes('proj')) return 1; return b.localeCompare(a); });
    dataSource.innerHTML = sources.map(key => `<option value="${key}">${manifest[key+'_per_game']?.label || key}</option>`).join('');
    document.getElementById("category-weights-grid").innerHTML = ALL_STAT_KEYS.map(key => `<div class="category-item"><label><input type="checkbox" data-key="${key}" checked> ${STAT_CONFIG[key].name || key}</label></div>`).join('');
    const data = await fetchSeasonData('actuals_2024_full_per_game');
    if (!data) return;
    const positions = [...new Set(data.map(p => p.position).filter(Boolean))].sort();
    const draftYears = [...new Set(data.map(p => p.draft_year).filter(y => y > 1980))].sort((a,b) => b-a);
    document.getElementById('filter-position').innerHTML = '<option value="all">All Positions</option>' + positions.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('filter-draft-year').innerHTML = '<option value="all">All Draft Years</option>' + draftYears.map(y => `<option value="${y}">${y}</option>`).join('');
}

async function renderSeasonTable() {
    const settings = {
        sourceBaseKey: document.getElementById("data-source-selector").value, calcMode: document.getElementById("calculation-mode").value,
        showCount: parseInt(document.getElementById("show-count").value, 10), searchTerm: document.getElementById("search-player").value.toLowerCase().trim(),
        activeCategories: new Set(Array.from(document.querySelectorAll("#category-weights-grid input:checked")).map(cb => cb.dataset.key)),
        filterPosition: document.getElementById('filter-position').value, filterDraftYear: document.getElementById('filter-draft-year').value,
    };
    const sourceKey = `${settings.sourceBaseKey}_${settings.calcMode}`;
    const tbody = document.getElementById("predictions-tbody");
    tbody.innerHTML = `<tr><td colspan="17" style="text-align:center;">Loading player data...</td></tr>`;
    const data = await fetchSeasonData(sourceKey);
    if (!data) { tbody.innerHTML = `<tr><td colspan="17" style="text-align:center; color: var(--danger-color);">Could not load data.</td></tr>`; return; }
    let processedData = data.map(player => ({ ...player, custom_z_score: Array.from(settings.activeCategories).reduce((acc, catKey) => acc + (player[STAT_CONFIG[catKey].zKey] || 0), 0) }));
    if (settings.searchTerm) processedData = processedData.filter(p => p.playerName?.toLowerCase().includes(settings.searchTerm));
    if (settings.filterPosition !== 'all') processedData = processedData.filter(p => p.position === settings.filterPosition);
    if (settings.filterDraftYear !== 'all') processedData = processedData.filter(p => p.draft_year == settings.filterDraftYear);
    currentSort.data = processedData;
    sortSeasonData();
    renderSeasonTableBody(settings.showCount);
}

function handleSortSeason(e) {
    const th = e.target.closest("th"); const sortKey = th?.dataset.sortKey; if (!sortKey) return;
    if (currentSort.column === sortKey) { currentSort.direction = currentSort.direction === "desc" ? "asc" : "desc"; } else { currentSort.column = sortKey; currentSort.direction = ["playerName", "pos", "team"].includes(sortKey) ? "asc" : "desc"; }
    sortSeasonData(); renderSeasonTableBody(parseInt(document.getElementById("show-count").value, 10));
}

function sortSeasonData() {
    const { column, direction, data } = currentSort; if (!data) return;
    const mod = direction === "asc" ? 1 : -1;
    data.sort((a, b) => { let valA = a[column] ?? -Infinity; let valB = b[column] ?? -Infinity; if (typeof valA === 'string') return valA.localeCompare(valB) * mod; return (valA - valB) * mod; });
}

function renderSeasonTableBody(showCount) {
    const thead = document.getElementById("predictions-thead");
    thead.innerHTML = `<tr> <th data-sort-key="rank">R#</th> <th data-sort-key="playerName">Player</th> <th data-sort-key="pos">Pos</th> <th data-sort-key="team">Team</th> <th data-sort-key="GP">GP</th> <th data-sort-key="MIN">MPG</th> ${ALL_STAT_KEYS.map(key => `<th data-sort-key="${key.replace('%', '_impact')}">${STAT_CONFIG[key].name}</th>`).join('')} <th data-sort-key="custom_z_score">TOTAL</th> </tr>`;
    document.querySelectorAll('#predictions-thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    const currentTh = thead.querySelector(`[data-sort-key="${currentSort.column}"]`); if(currentTh) currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];
    if (!dataToRender.length) { tbody.innerHTML = `<tr><td colspan="17" style="text-align:center;">No players match criteria.</td></tr>`; return; }
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1.0 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1.0 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    const isTotalMode = document.getElementById("calculation-mode").value === 'total';
    tbody.innerHTML = dataToRender.map((p, i) => { const minutes = isTotalMode ? (p.MIN || p.total_MIN || 0) / (p.GP || 1) : (p.MIN || 0);
        return `<tr><td>${i + 1}</td><td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a></td><td>${p.pos || p.position || 'N/A'}</td><td>${p.team || 'N/A'}</td><td>${p.GP || 0}</td><td>${minutes.toFixed(1)}</td>
            ${ALL_STAT_KEYS.map(key => { const zKey = STAT_CONFIG[key].zKey; const rawKey = key.replace('_impact', ''); const value = p[rawKey] || 0; const zValue = p[zKey] || 0; const precision = key.includes('impact') ? 2 : (isTotalMode ? 0 : 1);
                return `<td class="stat-cell ${getZClass(zValue)}"> <span class="stat-value">${value.toFixed(precision)}</span> <span class="z-score-value">${zValue.toFixed(2)}</span> </td>`;
            }).join('')}<td>${p.custom_z_score.toFixed(2)}</td></tr>`}).join('');
}

// --- DAILY PROJECTIONS & OTHER TABS ---
function initializeDailyTab() { document.getElementById('Daily').innerHTML = '<div class="card"><p>Daily projections are temporarily disabled for maintenance.</p></div>'; }
function initializeTeamAnalysisTab() {
    const selector = document.getElementById("team-analysis-source-selector"); const manifest = fullData.seasonLongDataManifest || {};
    const sources = Object.keys(manifest).filter(key => key.endsWith('_per_game')).sort((a,b) => b.localeCompare(a));
    selector.innerHTML = sources.map(key => `<option value="${key}">${manifest[key].label}</option>`).join(''); selector.addEventListener('change', renderTeamAnalysis); renderTeamAnalysis();
}

async function renderTeamAnalysis() {
    const container = document.getElementById("team-analysis-container"); container.innerHTML = '<div class="card"><p>Loading team data...</p></div>';
    const sourceKey = document.getElementById("team-analysis-source-selector").value; const data = await fetchSeasonData(sourceKey);
    if (!data) { container.innerHTML = '<div class="card"><p style="color:var(--danger-color)">Could not load data for this source.</p></div>'; return; }
    const teams = data.reduce((acc, p) => { const teamName = p.team || 'FA'; (acc[teamName] = acc[teamName] || []).push(p); return acc; }, {});
    const sortedTeams = Object.entries(teams).sort(([teamA, playersA], [teamB, playersB]) => { if(teamA === 'FA') return 1; if(teamB === 'FA') return -1; const strengthA = playersA.reduce((s,p) => s + (p.z_value || 0), 0); const strengthB = playersB.reduce((s,p) => s + (p.z_value || 0), 0); return strengthB - strengthA; });
    container.innerHTML = sortedTeams.map(([teamName, players]) => {
        const teamStrength = players.reduce((sum, p) => sum + (p.custom_z_score || 0), 0);
        const playerRows = players.sort((a,b) => (b.custom_z_score || 0) - (a.custom_z_score || 0)).map(p => `<tr> <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td> ${TEAM_ANALYSIS_STATS.map(stat => `<td>${(p[stat] || 0).toFixed(stat === 'GP' ? 0 : 1)}</td>`).join('')} <td>${p.custom_z_score.toFixed(2)}</td> </tr>`).join('');
        return `<div class="team-card"> <div class="team-card-header"><h3>${teamName === 'FA' ? 'Free Agents' : teamName}</h3><div class="team-strength-score">${teamStrength.toFixed(2)}</div></div> <div class="table-container"> <table> <thead><tr><th>Player</th>${TEAM_ANALYSIS_STATS.map(s => `<th>${s.replace('MIN', 'MPG')}</th>`).join('')}<th>Z-Score</th></tr></thead> <tbody>${playerRows}</tbody> </table> </div> </div>`;
    }).join('');
}

async function initializePlayerProgressionTab() {
    const container = document.getElementById("player-progression-container"); container.innerHTML = '<div class="card" style="padding:20px; text-align:center;">Loading...</div>';
    const futureData = await fetchSeasonData('progression'); const historicalData = await fetchSeasonData('progression_historical');
    if (!futureData && !historicalData) { container.innerHTML = '<div class="card" style="color:var(--danger-color)">Could not load progression data.</div>'; return; }
    let html = '';
    if (futureData) { html += createProgressionTable('Top 15 Risers (vs. \'25 Proj.)', [...futureData].sort((a,b) => b.z_Change - a.z_Change).slice(0, 15), "'24 Z-Score", "'25 Proj. Z", "z_Total_2024", "z_Total_2025_Proj"); html += createProgressionTable('Top 15 Fallers (vs. \'25 Proj.)', [...futureData].sort((a,b) => a.z_Change - b.z_Change).slice(0, 15), "'24 Z-Score", "'25 Proj. Z", "z_Total_2024", "z_Total_2025_Proj");}
    if (historicalData) { html += createProgressionTable('Top 15 Risers (\'23 vs \'24)', [...historicalData].sort((a,b) => b.z_Change - a.z_Change).slice(0, 15), "'23 Z-Score", "'24 Z-Score", "z_Total_2023", "z_Total_2024"); html += createProgressionTable('Top 15 Fallers (\'23 vs \'24)', [...historicalData].sort((a,b) => a.z_Change - b.z_Change).slice(0, 15), "'23 Z-Score", "'24 Z-Score", "z_Total_2023", "z_Total_2024");}
    container.innerHTML = html;
}

function createProgressionTable(title, players, th1, th2, key1, key2) {
    const rows = players.map(p => `<tr> <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName}</a></td> <td>${p.team}</td> <td>${(p[key1] || 0).toFixed(2)}</td> <td>${(p[key2]|| 0).toFixed(2)}</td> <td class="${p.z_Change >= 0 ? 'text-success' : 'text-danger'}">${p.z_Change >= 0 ? '+' : ''}${p.z_Change.toFixed(2)}</td> </tr>`).join('');
    return `<div class="card"> <h3>${title}</h3> <div class="table-container"> <table> <thead><tr><th>Player</th><th>Team</th><th>${th1}</th><th>${th2}</th><th>Change</th></tr></thead> <tbody>${rows}</tbody> </table> </div> </div>`;
}

async function initializeCareerAnalysisTab() {
    const controls = document.getElementById("career-controls");
    await populateCareerFilterOptions();
    controls.addEventListener('change', renderCareerChart);
    controls.querySelector('#career-search-player').addEventListener('input', renderCareerChart);
    renderCareerChart();
}

async function populateCareerFilterOptions() {
    const careerData = await fetchSeasonData('career_data'); if (!careerData) return;
    const comparisonGroup = document.getElementById('career-comparison-group'); const comparisonValue = document.getElementById('career-comparison-value');
    const options = { 'by_position': Object.keys(careerData.by_position || {}).sort(), 'by_draft_year': Object.keys(careerData.by_draft_year || {}).sort((a,b) => b-a), };
    comparisonGroup.addEventListener('change', () => {
        const selectedGroup = comparisonGroup.value;
        if (options[selectedGroup]) { comparisonValue.innerHTML = options[selectedGroup].map(opt => `<option value="${opt}">${opt}</option>`).join(''); comparisonValue.disabled = false; } else { comparisonValue.innerHTML = ''; comparisonValue.disabled = true; }
        renderCareerChart();
    });
    comparisonGroup.dispatchEvent(new Event('change'));
}

async function renderCareerChart() {
    const chartWrapper = document.getElementById("career-chart-wrapper"); if (careerChartInstance) careerChartInstance.destroy();
    chartWrapper.innerHTML = '<canvas id="career-chart"></canvas>'; const ctx = document.getElementById('career-chart')?.getContext('2d'); if (!ctx) return;
    const careerData = await fetchSeasonData('career_data');
    if (!careerData || !careerData.players) { chartWrapper.innerHTML = `<p style="text-align:center; color: var(--danger-color);">Could not load career analysis data.</p>`; return; }
    const stat = document.getElementById("career-stat-selector").value; const xAxis = document.getElementById("career-xaxis-selector").value; const searchTerm = document.getElementById("career-search-player").value.toLowerCase().trim();
    const comparisonGroupKey = document.getElementById('career-comparison-group').value; const comparisonValueKey = document.getElementById('career-comparison-value').value;
    const datasets = [];
    if (comparisonGroupKey !== 'none' && comparisonValueKey && careerData[comparisonGroupKey]?.[comparisonValueKey]) {
        datasets.push({ label: `Avg: ${comparisonValueKey}`, data: careerData[comparisonGroupKey][comparisonValueKey].map(d => ({ x: xAxis === 'age' ? d.age : d.game_bin * careerData.bin_size, y: d[stat] })), borderColor: 'var(--danger-color)', borderWidth: 2.5, pointRadius: 0, });
    }
    if (searchTerm) {
        const entry = Object.entries(fullData.playerProfiles).find(([id, profile]) => profile.name.toLowerCase().includes(searchTerm));
        if (entry) {
            const personId = parseInt(entry[0], 10); const playerData = careerData.players[personId];
            if(playerData) { datasets.push({ label: entry[1].name, data: playerData.map(d => ({ x: xAxis === 'age' ? d.age : d.game_bin * careerData.bin_size, y: d[stat] })), borderColor: 'var(--warning-color)', borderWidth: 3, pointRadius: 0, }); }
        }
    }
    careerChartInstance = new Chart(ctx, { type: 'line', data: { datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: 'var(--text-primary)' } } },
            scales: { x: { type: 'linear', title: { display: true, text: xAxis === 'game_bin' ? `Games Played (in blocks of ${careerData.bin_size})` : 'Player Age', color: 'var(--text-primary)' }, ticks: {color: 'var(--text-secondary)'}, grid: {color: 'var(--border-color)'} },
                      y: { title: { display: true, text: `Per-Game Average ${stat}`, color: 'var(--text-primary)' }, ticks: {color: 'var(--text-secondary)'}, grid: {color: 'var(--border-color)'} } } }
    });
}