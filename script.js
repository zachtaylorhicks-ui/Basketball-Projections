// script.js (v26.6 - Definitive Z-Score Philosophy Fix)

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
const TEAM_ANALYSIS_STATS = ["GP", "MIN", "PTS", "REB", "AST"];

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

// --- GLOBAL CLICK HANDLER ---
function handleGlobalClicks(e) {
    const playerLink = e.target.closest('.player-link');
    if (playerLink) {
        e.preventDefault();
        const personId = parseInt(playerLink.dataset.personId, 10);
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

    const sortedSeasons = Object.keys(sourcesBySeason).sort((a, b) => a.includes('proj') ? -1 : b.includes('proj') ? 1 : b.localeCompare(a));
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
    tbody.innerHTML = `<tr><td colspan="17">Loading...</td></tr>`;
    
    let data = await fetchSeasonData(sourceKey);
    if (!data) { tbody.innerHTML = `<tr><td colspan="17" class="error-cell">Could not load data for '${sourceKey}.json'.</td></tr>`; return; }
    
    // FIX [Z-Score Philosophy]: Re-calculate the displayed Total based ONLY on the sum of z-scores for active categories.
    let processedData = data.map(player => ({
        ...player,
        // The final displayed score is the unweighted sum. The Python script provides the default, and we adjust for punts.
        custom_z_score: Array.from(settings.activeCategories).reduce((acc, catKey) => acc + (player[STAT_CONFIG[catKey].zKey] || 0), 0)
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
    currentSort.direction = (currentSort.column === sortKey && currentSort.direction === "desc") ? "asc" : "desc";
    currentSort.column = sortKey;
    if (["playerName", "position", "team"].includes(sortKey)) { currentSort.direction = "asc"; }
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
    thead.innerHTML = `<tr><th>R#</th><th data-sort-key="playerName">Player</th><th data-sort-key="position">Pos</th><th data-sort-key="team">Team</th><th data-sort-key="GP">GP</th><th data-sort-key="MIN">MPG</th>${ALL_STAT_KEYS.map(k=>`<th data-sort-key="${k}">${STAT_CONFIG[k].name}</th>`).join('')}<th data-sort-key="custom_z_score">TOTAL▼</th></tr>`;
    document.querySelectorAll('#predictions-thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    const currentTh = thead.querySelector(`[data-sort-key="${currentSort.column}"]`);
    if(currentTh) currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

    const tbody = document.getElementById("predictions-tbody");
    const dataToRender = currentSort.data?.slice(0, showCount) || [];
    if (!dataToRender.length) { tbody.innerHTML = `<tr><td colspan="17">No players match criteria.</td></tr>`; return; }
    
    const getZClass = z => z >= 1.5 ? 'elite' : z >= 1.0 ? 'very-good' : z >= 0.5 ? 'good' : z <= -1.0 ? 'not-good' : z <= -0.5 ? 'below-average' : 'average';
    const isTotalMode = document.getElementById("calculation-mode").value === 'total';
    
    tbody.innerHTML = dataToRender.map((p, i) => {
        // FIX [Historical Data Pipeline]: The underlying data is now correct, so we just display it.
        const minutes = p.MIN || 0;
        const gp = p.GP || 1;
        
        return `
        <tr>
            <td>${i + 1}</td>
            <td><a href="#" class="player-link" data-person-id="${p.personId}">${p.playerName || 'N/A'}</a></td>
            <td>${p.position || 'N/A'}</td>
            <td>${p.team || 'N/A'}</td>
            <td>${gp}</td>
            <td>${(isTotalMode ? minutes / gp : minutes).toFixed(1)}</td>

            ${ALL_STAT_KEYS.map(key => {
                const zKey = STAT_CONFIG[key].zKey;
                const zValue = p[zKey] || 0;
                let displayValue;
                const value = p[key.replace('_impact', '')] || 0;

                if (key === 'FG_impact' || key === 'FT_impact') {
                    const made = key === 'FG_impact' ? p.FGM : p.FTM;
                    const att = key === 'FG_impact' ? p.FGA : p.FTA;
                    displayValue = att > 0 ? (made / att).toFixed(3) : (p[key === 'FG_impact' ? 'FG_pct' : 'FT_pct'] || 0).toFixed(3);
                } else {
                    displayValue = (isTotalMode ? value : value).toFixed(key === 'GP' || isTotalMode ? 0 : 1);
                }
                
                return `<td class="stat-cell ${getZClass(zValue)}"><span class="stat-value">${displayValue}</span><span class="z-score-value">${zValue.toFixed(2)}</span></td>`;
            }).join('')}
            <td>${p.custom_z_score.toFixed(2)}</td>
        </tr>`
    }).join('');
}

// --- The rest of the JS file (Daily, Team, Progression, Career) is unchanged from v26.4 ---
function initializeDailyTab(){const a=document.getElementById("accuracy-metric-selector");a&&a.addEventListener("change",renderAccuracyChart);const e=document.getElementById("daily-date-tabs"),t=fullData.dailyGamesByDate?Object.keys(fullData.dailyGamesByDate).sort((a,e)=>new Date(e)-new Date(a)):[];if(!t.length)return document.getElementById("daily-games-container").innerHTML='<div class="card"><p>No daily predictions available.</p></div>',void(document.getElementById("accuracy-chart-container").style.display="none");e.innerHTML=t.map((a,t)=>`<button class="date-tab ${0===t?"active":""}" data-date="${a}">${new Date(a+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</button>`).join(""),e.addEventListener("click",a=>{const t=a.target.closest(".date-tab");t&&(document.querySelectorAll(".date-tab").forEach(a=>a.classList.remove("active")),t.classList.add("active"),renderDailyGamesForDate(t.dataset.date))}),renderAccuracyChart(),renderDailyGamesForDate(t[0])}function renderDailyGamesForDate(a){const e=document.getElementById("daily-games-container"),t=fullData.dailyGamesByDate?.[a]||[];if(0===t.length)return void(e.innerHTML='<div class="card"><p>No games for this date.</p></div>');const d=a=>a>=1.5?"elite":a>=1?"very-good":a>=.5?"good":a<=-1?"not-good":a<=-.5?"below-average":"average";e.innerHTML=t.map(a=>{const[e,t]=a.projections;let r=`Predicted: <strong>${e.totalPoints}-${t.totalPoints}</strong>`;a.grade?.isGraded&&(r+=` | Actual: <strong class="actual-score ${a.grade.correctWinner?"prediction-correct":"prediction-incorrect"}">${Object.values(a.grade.gameSummary.actual)[0]}-${Object.values(a.grade.gameSummary.actual)[1]}</strong>`);return`
        <div class="matchup-card">
            <div class="matchup-header">
                <span class="matchup-teams">${e.teamName} (${e.winProb}%) vs ${t.teamName} (${t.winProb}%)</span>
                <span class="matchup-scores">${r}</span>
            </div>
            <div class="matchup-compact-summary">
                <div class="compact-team">${(l=e,l.players.sort((a,e)=>(e.Predicted_Minutes||0)-(a.Predicted_Minutes||0)).slice(0,5).map(a=>`<div class="compact-player-badge ${d(.125*(a.points-15))}" title="${a.Player_Name} (Proj. ${a.points} pts)">${a.Player_Name.split(" ").pop()}</div>`).join(""))}</div>
                <div class="compact-team">${(n=t,n.players.sort((a,e)=>(e.Predicted_Minutes||0)-(a.Predicted_Minutes||0)).slice(0,5).map(a=>`<div class="compact-player-badge ${d(.125*(a.points-15))}" title="${a.Player_Name} (Proj. ${a.points} pts)">${a.Player_Name.split(" ").pop()}</div>`).join(""))}</div>
            </div>
            <div class="matchup-body">
                ${createTeamTableHTML(e,a.grade)}
                ${createTeamTableHTML(t,a.grade)}
            </div>
            <div class="matchup-footer">
                <button class="button-outline expand-details-btn">Show Details</button>
            </div>
        </div>`;var l,n}).join("")}function createTeamTableHTML(a,e){const t=e?.isGraded,d=a.players.sort((a,e)=>(e.Predicted_Minutes||0)-(a.Predicted_Minutes||0)).map(d=>{const r=d.personId||d.Player_ID,o=t?e.playerActuals?.[r]:null,s=`<a href="#" class="player-link" data-person-id="${r}">${d.Player_Name}</a>`;return`<tr class="player-row-pred">
                <td rowspan="${t?2:1}" class="player-name-cell">${s}</td>
                <td class="stat-type-cell">P</td>
                <td>${(d.Predicted_Minutes||0).toFixed(1)}</td>
                <td>${(d.points||0).toFixed(1)}</td>
                <td>${(d.reb||0).toFixed(1)}</td>
                <td>${(d.ast||0).toFixed(1)}</td>
            </tr>`+(t&&o?`<tr class="player-row-actual">
                <td class="stat-type-cell">A</td>
                <td>-</td>
                <td>${o.PTS.toFixed(0)}<span class="performance-indicator ${(l=d.points,n=o.PTS,null==n||null==l?"":Math.abs(l-n)/(n||l||1)<.2?"pi-good":Math.abs(l-n)/(n||l||1)>.6&&Math.abs(l-n)>3?"pi-bad":"pi-neutral")}"></span></td>
                <td>${o.REB.toFixed(0)}<span class="performance-indicator ${(i=d.reb,c=o.REB,null==c||null==i?"":Math.abs(i-c)/(c||i||1)<.2?"pi-good":Math.abs(i-c)/(c||i||1)>.6&&Math.abs(i-c)>3?"pi-bad":"pi-neutral")}"></span></td>
                <td>${o.AST.toFixed(0)}<span class="performance-indicator ${(p=d.ast,u=o.AST,null==u||null==p?"":Math.abs(p-u)/(u||p||1)<.2?"pi-good":Math.abs(p-u)/(u||p||1)>.6&&Math.abs(p-u)>3?"pi-bad":"pi-neutral")}"></span></td>
            </tr>`:t?'<tr class="player-row-actual"><td class="stat-type-cell">A</td><td colspan="4" style="text-align:center;">DNP</td></tr>':"");var l,n,i,c,p,u}).join("");return`<div class="team-box-score">
        <h3 class="team-header">${a.teamName}</h3>
        <table class="daily-table">
            <thead><tr><th style="text-align:left;">Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
            <tbody>${d}</tbody>
        </table>
    </div>`}function renderAccuracyChart(){const a=document.getElementById("accuracy-chart-container");if(!a)return;const e=document.getElementById("accuracy-chart");if(!e||!fullData.historicalGrades||fullData.historicalGrades.length<1)return void(a.style.display="none");a.style.display="block";const t=e.getContext("2d"),d=document.getElementById("accuracy-metric-selector").value,r=fullData.historicalGrades.reduce((a,e)=>(a[e.date]=a[e.date]||[],a[e.date].push(e),a),{}),o=Object.keys(r).sort((a,e)=>new Date(a)-new Date(e));let s;switch(d){case"cumulativeWinLoss":let a=0,e=0;const t=o.map(t=>(a+=r[t].reduce((a,e)=>a+e.correctWinner,0),e+=r[t].length,{x:new Date(t),y:e>0?a/e*100:0}));s={type:"line",data:{datasets:[{label:"Cumulative W/L %",data:t,borderColor:"var(--primary-color)",backgroundColor:"var(--primary-color)"}]},options:{scales:{y:{min:0,max:100,ticks:{callback:a=>a+"%"}},x:{type:"time",time:{unit:"day"}}}}};break;case"dailyWinLoss":const l=o.map(a=>r[a].reduce((a,e)=>a+e.correctWinner,0)/r[a].length*100);s={type:"bar",data:{labels:o.map(a=>new Date(a+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),datasets:[{label:"Daily W/L Accuracy",data:l,backgroundColor:"var(--primary-color)"}]},options:{scales:{y:{min:0,max:100,ticks:{callback:a=>a+"%"}}}}};break;default:const n=o.map(a=>{const e=r[a].map(a=>"scoreCloseness"===d?a.scoreCloseness:a.statErrors[d]).filter(a=>void 0!==a);return e.length>0?e.reduce((a,e)=>a+e,0)/e.length:0});s={type:"bar",data:{labels:o.map(a=>new Date(a+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),datasets:[{label:`Avg Daily ${d}`,data:n,backgroundColor:"var(--primary-color)"}]}}}accuracyChartInstance&&accuracyChartInstance.destroy(),accuracyChartInstance=new Chart(t,{...s,options:{...s.options,responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}}}})}function initializeTeamAnalysisTab(){const a=document.getElementById("team-analysis-source-selector"),e=fullData.seasonLongDataManifest||{},t=Object.keys(e).filter(a=>a.endsWith("_per_game")).sort((a,e)=>e.localeCompare(a));a.innerHTML=t.map(a=>`<option value="${a}">${e[a].label}</option>`).join(""),a.addEventListener("change",renderTeamAnalysis),renderTeamAnalysis()}async function renderTeamAnalysis(){const a=document.getElementById("team-analysis-container");a.innerHTML='<div class="card"><p>Loading team data...</p></div>';const e=document.getElementById("team-analysis-source-selector").value,t=await fetchSeasonData(e);if(!t)return void(a.innerHTML='<div class="card"><p style="color:var(--danger-color)">Could not load data for this source.</p></div>');const d=t.reduce((a,e)=>{const t=e.team||"FA";return(a[t]=a[t]||[]).push(e),a},{});a.innerHTML=Object.entries(d).sort(([a],[e])=>"FA"===a?1:"FA"===e?-1:d[e].reduce((a,e)=>a+(e.custom_z_score||0),0)-d[a].reduce((a,e)=>a+(e.custom_z_score||0),0)).map(([a,e])=>{const t=e.reduce((a,e)=>a+(e.custom_z_score||0),0),r=e.sort((a,e)=>(e.custom_z_score||0)-(a.custom_z_score||0)).map(a=>`
            <tr>
                <td><a href="#" class="player-link" data-person-id="${a.personId}">${a.playerName}</a></td>
                ${TEAM_ANALYSIS_STATS.map(e=>`<td>${(a[e]||0).toFixed("GP"===e?0:1)}</td>`).join("")}
                <td>${(a.custom_z_score||0).toFixed(2)}</td>
            </tr>`).join("");return`
            <div class="team-card">
                <div class="team-card-header"><h3>${"FA"===a?"Free Agents":a}</h3><div class="team-strength-score">${t.toFixed(2)}</div></div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Player</th>${TEAM_ANALYSIS_STATS.map(a=>`<th>${a.replace("MIN","MPG")}</th>`).join("")}<th>Z-Score</th></tr></thead>
                        <tbody>${r}</tbody>
                    </table>
                </div>
            </div>`}).join("")}async function initializePlayerProgressionTab(){const a=document.getElementById("player-progression-container");a.innerHTML='<div class="card" style="padding:20px; text-align:center;">Loading...</div>';const e=await fetchSeasonData("progression"),t=await fetchSeasonData("progression_historical");if(!e&&!t)return void(a.innerHTML='<div class="card" style="padding:20px; text-align:center; color:var(--danger-color)">Could not load progression data.</div>');let d="";e&&(d+=createProgressionTable("Top Risers (vs. '26 Proj.)",[...e].sort((a,e)=>e.z_Change-a.z_Change).slice(0,15),"'25 Z","'26 Proj. Z","z_Total_2024","z_Total_2025_Proj"),d+=createProgressionTable("Top Fallers (vs. '26 Proj.)",[...e].sort((a,e)=>a.z_Change-e.z_Change).slice(0,15),"'25 Z","'26 Proj. Z","z_Total_2024","z_Total_2025_Proj")),t&&(d+=createProgressionTable("Top Risers ('24 vs '25)",[...t].sort((a,e)=>e.z_Change-a.z_Change).slice(0,15),"'24 Z","'25 Z","z_Total_2023","z_Total_2024"),d+=createProgressionTable("Top Fallers ('24 vs '25)",[...t].sort((a,e)=>a.z_Change-e.z_Change).slice(0,15),"'24 Z","'25 Z","z_Total_2023","z_Total_2024")),a.innerHTML=d}function createProgressionTable(a,e,t,d,r,o){const s=e.map(a=>`<tr>
        <td><a href="#" class="player-link" data-person-id="${a.personId}">${a.playerName}</a></td>
        <td>${a.team}</td>
        <td>${(a[r]||0).toFixed(2)}</td>
        <td>${(a[o]||0).toFixed(2)}</td>
        <td class="${a.z_Change>=0?"text-success":"text-danger"}">${a.z_Change>=0?"+":""}${(a.z_Change||0).toFixed(2)}</td>
    </tr>`).join("");return`<div class="card">
        <h3>${a}</h3>
        <div class="table-container">
            <table>
                <thead><tr><th>Player</th><th>Team</th><th>${t}</th><th>${d}</th><th>Change</th></tr></thead>
                <tbody>${s}</tbody>
            </table>
        </div>
    </div>`}function initializeCareerAnalysisTab(){const a=document.getElementById("career-controls");a?.addEventListener("change",renderCareerChart),a?.querySelector("#career-search-player").addEventListener("input",renderCareerChart),renderCareerChart()}async function renderCareerChart(){const a=document.getElementById("career-chart-wrapper");careerChartInstance&&careerChartInstance.destroy(),a.innerHTML='<canvas id="career-chart"></canvas>';const e=document.getElementById("career-chart")?.getContext("2d");if(!e)return;const t=await fetchSeasonData("career_data");if(!t||!t.players)return void(a.innerHTML='<p style="text-align:center; color: var(--danger-color);">Could not load career analysis data.</p>');const d=document.getElementById("career-stat-selector").value,r=document.getElementById("career-xaxis-selector").value,o=document.getElementById("career-search-player").value.toLowerCase().trim();let s=null;if(o){const a=Object.entries(fullData.playerProfiles).find(([a,e])=>e.playerName?.toLowerCase().includes(o));a&&(s=parseInt(a[0],10))}const l=[];l.push(...Object.entries(t.players).map(([a,{label:e,data:t}])=>{const d=parseInt(a)===s;return{label:`Player ${a}`,data:t,borderColor:d?"var(--warning-color)":"rgba(128, 128, 128, 0.1)",borderWidth:d?2.5:1,pointRadius:0,showLine:!0,order:d?0:1}}));const n=s&&fullData.playerProfiles[s]?fullData.playerProfiles[s].draftInfo||"":"",i=n.match(/(\d{4})/),c=n.match(/P(\d+)/),p=i?parseInt(i[1]):null,u=c?parseInt(c[1]):null,m=t.game_bin_size||20;p&&t.by_year&&t.by_year[p]&&l.push({label:`Avg. Draft Year ${p}`,data:t.by_year[p].map(a=>({x:"age"===r?a.age:a.game_bin*m,y:a[d]})),borderColor:"var(--success-color)",borderWidth:2,borderDash:[5,5],pointRadius:0,showLine:!0,order:2}),u&&t.by_pick&&t.by_pick[u]&&l.push({label:`Avg. Draft Pick #${u}`,data:t.by_pick[u].map(a=>({x:"age"===r?a.age:a.game_bin*m,y:a[d]})),borderColor:"var(--danger-color)",borderWidth:2,borderDash:[5,5],pointRadius:0,showLine:!0,order:3}),careerChartInstance=new Chart(e,{type:"line",data:{datasets:l},options:{responsive:!0,maintainAspectRatio:!1,animation:!1,parsing:!1,plugins:{legend:{labels:{filter:a=>!a.label.startsWith("Player")}},decimation:{enabled:!0,algorithm:"lttb",samples:200},tooltip:{enabled:!1}},scales:{x:{type:"linear",title:{display:!0,text:"age"===r?"Player Age":"NBA Games Played"}},y:{title:{display:!0,text:`Monthly Average ${d}`}}}}})}
