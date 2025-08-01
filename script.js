
    let fullData = {}; let processedSeasonData = [];
    let currentSort = { column: "z_score_total", direction: "desc" };
    let accuracyChartInstance = null; let statErrorChartInstance = null;
    
    const STAT_CONFIG = {
        points: { name: "PTS", dataKey: "points", zKey: "z_points" },
        reboundsTotal: { name: "REB", dataKey: "reboundsTotal", zKey: "z_reboundsTotal" },
        assists: { name: "AST", dataKey: "assists", zKey: "z_assists" },
        steals: { name: "STL", dataKey: "steals", zKey: "z_steals" },
        blocks: { name: "BLK", dataKey: "blocks", zKey: "z_blocks" },
        threePointersMade: { name: "3PM", dataKey: "threePointersMade", zKey: "z_threePointersMade" },
        turnovers: { name: "TO", dataKey: "turnovers", zKey: "z_turnovers", invert: true },
        FG_impact: { name: "FG% Impact", dataKey: "FG%", zKey: "z_FG_impact" },
        FT_impact: { name: "FT% Impact", dataKey: "FT%", zKey: "z_FT_impact" },
    };

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const response = await fetch("predictions.json");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            fullData = await response.json();
            document.getElementById("last-updated").textContent = new Date(fullData.lastUpdated).toLocaleString();
            
            initializeSeasonTab(); 
            initializeDailyTab();
            
        } catch (e) {
            console.error("Failed to initialize:", e);
            document.querySelector('main').innerHTML = `<div class="card" style="color: red;"><h2>Failed to Load Data</h2><p>Could not fetch or parse predictions.json. Please check the file and try again.</p><p>Error: ${e.message}</p></div>`;
        }
    });

    function openTab(evt, tabName) {
        document.querySelectorAll(".tab-content").forEach(tc => tc.style.display = "none");
        document.querySelectorAll(".tab-link").forEach(tl => tl.classList.remove("active"));
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.classList.add("active");
    }

    // --- SEASON TAB ---
    function initializeSeasonTab() {
        const container = document.getElementById('season-table-container');
        const controls = document.getElementById('season-controls');
        if (!fullData.seasonLongProjections || fullData.seasonLongProjections.length === 0) {
            controls.style.display = 'none';
            container.innerHTML = '<div class="card"><p>No season-long projections available.</p></div>';
            return;
        }
        setupSeasonControls();
        addSeasonEventListeners();
        recalculateAndRenderSeason();
    }
    
    function setupSeasonControls() {
        const grid = document.getElementById('category-weights-grid');
        grid.innerHTML = Object.entries(STAT_CONFIG).map(([key, config]) => `
            <div class="category-item">
                <label for="cb-${key}">
                    <input type="checkbox" id="cb-${key}" data-key="${key}" checked> ${config.name}
                </label>
            </div>
        `).join('');
    }

    function addSeasonEventListeners() {
        document.getElementById('season-controls').addEventListener('change', recalculateAndRenderSeason);
        document.getElementById('search-player').addEventListener('input', recalculateAndRenderSeason);
        document.getElementById('predictions-thead').addEventListener('click', handleSortSeason);
    }
    
    function getSeasonControlSettings() {
        const activeCategories = new Set();
        document.querySelectorAll('#category-weights-grid input[type=checkbox]:checked').forEach(cb => {
            activeCategories.add(cb.dataset.key);
        });
        return {
            activeCategories,
            showCount: parseInt(document.getElementById('show-count').value, 10),
            searchTerm: document.getElementById('search-player').value.toLowerCase().trim()
        };
    }
    
    function recalculateAndRenderSeason() {
        const settings = getSeasonControlSettings();
        processedSeasonData = fullData.seasonLongProjections.map(player => {
            let z_score_total = 0;
            settings.activeCategories.forEach(catKey => {
                const config = STAT_CONFIG[catKey];
                let z_val = player[config.zKey] || 0;
                if (config.invert) {
                    z_val *= -1;
                }
                z_score_total += z_val;
            });
            return { ...player, z_score_total };
        });

        if (settings.searchTerm) {
            processedSeasonData = processedSeasonData.filter(p => 
                p.playerName && p.playerName.toLowerCase().includes(settings.searchTerm)
            );
        }
        sortSeasonData();
        renderSeasonTable();
    }
    
    function sortSeasonData() {
        const { column, direction } = currentSort;
        const sortModifier = direction === 'desc' ? -1 : 1;
        processedSeasonData.sort((a, b) => {
            const valA = a[column] || 0;
            const valB = b[column] || 0;
            if (valA < valB) return -1 * sortModifier;
            if (valA > valB) return 1 * sortModifier;
            return 0;
        });
    }

    function handleSortSeason(e) {
        const key = e.target.dataset.sortKey;
        if (!key) return;
        if (currentSort.column === key) {
            currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
        } else {
            currentSort.column = key;
            currentSort.direction = 'desc';
        }
        recalculateAndRenderSeason();
    }

    function renderSeasonTable() {
        const settings = getSeasonControlSettings();
        const thead = document.getElementById('predictions-thead');
        const tbody = document.getElementById('predictions-tbody');
        const table = document.getElementById('predictions-table');
        
        // Render Header
        let headerHtml = '<tr><th data-sort-key="rank">Rank</th><th data-sort-key="playerName">Player</th>';
        Object.values(STAT_CONFIG).forEach(config => {
             headerHtml += `<th data-sort-key="${config.zKey}">${config.name}</th>`;
        });
        headerHtml += '<th data-sort-key="z_score_total">Total</th></tr>';
        thead.innerHTML = headerHtml;
        
        // Render Body
        const dataToRender = processedSeasonData.slice(0, settings.showCount);
        tbody.innerHTML = dataToRender.map((player, index) => {
            let rowHtml = `<td>${index + 1}</td><td>${player.playerName}</td>`;
            Object.values(STAT_CONFIG).forEach(config => {
                const val = player[config.dataKey] || 0;
                const z_val = player[config.zKey] || 0;
                rowHtml += `<td>${typeof val === 'number' ? val.toFixed(2) : val} <div>(${z_val.toFixed(2)})</div></td>`;
            });
            rowHtml += `<td>${player.z_score_total.toFixed(2)}</td>`;
            return `<tr>${rowHtml}</tr>`;
        }).join('');
        
        document.getElementById('loading-message').style.display = 'none';
        table.style.display = 'table';
    }


    // --- DAILY TAB ---
    function initializeDailyTab() { /* ... unchanged ... */ }
    function renderAccuracyChart() { /* ... unchanged ... */ }
    function renderDailyGamesForDate(date) { /* ... unchanged ... */ }
    function showGradeOverlay(game) { /* ... unchanged ... */ }
    function renderStatErrorChart(errors) { /* ... unchanged ... */ }
    
    // (Pasting the full daily functions for completeness)
    function initializeDailyTab() { renderAccuracyChart(); const dates = Object.keys(fullData.dailyGamesByDate || {}).sort((a, b) => new Date(b) - new Date(a)); const dateTabsContainer = document.getElementById('daily-date-tabs'); if (dates.length === 0) { document.getElementById('daily-games-container').innerHTML = '<div class="card"><p>No daily predictions available.</p></div>'; return; } dateTabsContainer.innerHTML = dates.map((date, i) => `<button class="date-tab ${i === 0 ? 'active' : ''}" data-date="${date}">${new Date(date + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}</button>`).join(''); dateTabsContainer.addEventListener('click', e => { const target = e.target.closest('.date-tab'); if(target) { document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active')); target.classList.add('active'); renderDailyGamesForDate(target.dataset.date); } }); document.getElementById('daily-games-container').addEventListener('click', e => { if (e.target.classList.contains('grade-button')) { const gameId = e.target.dataset.gameId; const date = e.target.dataset.date; const gameData = fullData.dailyGamesByDate[date].find(g => g.gameId == gameId); if (gameData) showGradeOverlay(gameData); } }); renderDailyGamesForDate(dates[0]); }
    function renderAccuracyChart() { const container = document.getElementById('accuracy-chart-container'); if (!fullData.historicalGrades || fullData.historicalGrades.length < 2) { container.style.display = 'none'; return; } container.style.display = 'block'; const ctx = document.getElementById('accuracy-chart').getContext('2d'); const labels = fullData.historicalGrades.map(g => new Date(g.date + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})); const data = fullData.historicalGrades.map(g => g.overallMAEPts); if (accuracyChartInstance) accuracyChartInstance.destroy(); accuracyChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Average Points MAE', data, borderColor: 'rgb(0, 123, 255)', tension: 0.1, backgroundColor: 'rgba(0, 123, 255, 0.1)', fill: true }] }, options: { scales: { y: { reverse: true, title: { display: true, text: 'Prediction Error (Lower is Better)' } } } } }); }
    function renderDailyGamesForDate(date) { const container = document.getElementById('daily-games-container'); container.innerHTML = ''; const games = fullData.dailyGamesByDate[date]; games.forEach(game => { const card = document.createElement('div'); card.className = 'matchup-card'; const [proj1, proj2] = game.projections; const gradeButtonHtml = game.grade.isGraded ? `<button class="grade-button" data-game-id="${game.gameId}" data-date="${date}">View Prediction Grade</button>` : ''; card.innerHTML = `<div class="matchup-header"><span>${proj1.teamName}</span><span>vs</span><span>${proj2.teamName}</span>${gradeButtonHtml}</div>`; container.appendChild(card); }); }
    function showGradeOverlay(game) { const grade = game.grade; const overlay = document.getElementById('grade-overlay'); const modalContent = document.getElementById('grade-modal-content'); const [team1, team2] = Object.keys(grade.gameSummary.predicted); const renderPlayer = p => `<li class="player-grade-item"><div class="player-name">${p.playerName}</div><div class="stats-comparison"><table><thead><tr><th></th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody><tr><td>Predicted</td><td class="predicted">${p.predicted.PTS.toFixed(1)}</td><td class="predicted">${p.predicted.REB.toFixed(1)}</td><td class="predicted">${p.predicted.AST.toFixed(1)}</td></tr><tr><td>Actual</td><td>${p.actual.PTS.toFixed(1)}</td><td>${p.actual.REB.toFixed(1)}</td><td>${p.actual.AST.toFixed(1)}</td></tr></tbody></table></div></li>`; modalContent.innerHTML = `<div class="grade-modal"><div class="modal-header"><h2>Prediction Grade</h2><span class="grade-badge grade-${grade.overallGrade.replace('+', '-plus')}">${grade.overallGrade}</span><button class="modal-close">×</button></div><div class="modal-section scoreboard"><div class="team-name">${team1}</div><div>vs</div><div class="team-name">${team2}</div><div>Predicted: <span class="score">${grade.gameSummary.predicted[team1]}</span></div><div></div><div>Predicted: <span class="score">${grade.gameSummary.predicted[team2]}</span></div><div>Actual: <span class="score">${grade.gameSummary.actual[team1]}</span></div><div></div><div>Actual: <span class="score">${grade.gameSummary.actual[team2]}</span></div></div><div class="modal-section shining-stars"><h3>⭐ Shining Stars (Most Accurate)</h3><ul class="player-grade-list">${grade.shiningStars.map(renderPlayer).join('')}</ul></div><div class="modal-section tough-calls"><h3>🔬 Tough Calls (Largest Misses)</h3><ul class="player-grade-list">${grade.toughCalls.map(renderPlayer).join('')}</ul></div><div class="modal-section"><h3>Stat Accuracy Deep Dive (Avg. Error)</h3><canvas id="stat-error-chart"></canvas></div></div>`; overlay.classList.remove('overlay-hidden'); overlay.classList.add('visible'); overlay.querySelector('.modal-close').addEventListener('click', () => { overlay.classList.remove('visible'); modalContent.innerHTML = ''; }); overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.classList.remove('visible'); modalContent.innerHTML = ''; } }); renderStatErrorChart(grade.statErrors); }
    function renderStatErrorChart(errors) { const ctx = document.getElementById('stat-error-chart').getContext('2d'); if (statErrorChartInstance) statErrorChartInstance.destroy(); statErrorChartInstance = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(errors), datasets: [{ label: 'Average Error', data: Object.values(errors), backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Average Error' } } } } }); }
    