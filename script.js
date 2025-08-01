
    let fullData = {}; let accuracyChartInstance = null; let statErrorChartInstance = null;
    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const response = await fetch("predictions.json");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            fullData = await response.json();
            document.getElementById("last-updated").textContent = new Date(fullData.lastUpdated).toLocaleString();
            
            // NOTE: Add your season tab initialization back here if you use it
            // initializeSeasonTab(); 
            
            initializeDailyTab();
            document.getElementById('daily-games-container').addEventListener('click', e => {
                if (e.target.classList.contains('grade-button')) {
                    const gameId = e.target.dataset.gameId;
                    const date = e.target.dataset.date;
                    const gameData = fullData.dailyGamesByDate[date].find(g => g.gameId == gameId);
                    if (gameData) showGradeOverlay(gameData);
                }
            });
        } catch (e) { console.error("Failed to initialize:", e); }
    });
    function openTab(evt, tabName) {
        document.querySelectorAll(".tab-content").forEach(tc => tc.style.display = "none");
        document.querySelectorAll(".tab-link").forEach(tl => tl.classList.remove("active"));
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.classList.add("active");
    }
    function initializeDailyTab() {
        renderAccuracyChart();
        const dates = Object.keys(fullData.dailyGamesByDate || {}).sort((a, b) => new Date(b) - new Date(a));
        const dateTabsContainer = document.getElementById('daily-date-tabs');
        if (dates.length === 0) {
            document.getElementById('daily-games-container').innerHTML = '<div class="card"><p>No daily predictions available.</p></div>';
            return;
        }
        dateTabsContainer.innerHTML = dates.map((date, i) => `<button class="date-tab ${i === 0 ? 'active' : ''}" data-date="${date}">${new Date(date + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}</button>`).join('');
        dateTabsContainer.addEventListener('click', e => {
            const target = e.target.closest('.date-tab');
            if(target) {
                document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
                target.classList.add('active');
                renderDailyGamesForDate(target.dataset.date);
            }
        });
        renderDailyGamesForDate(dates[0]);
    }
    function renderAccuracyChart() {
        const container = document.getElementById('accuracy-chart-container');
        if (!fullData.historicalGrades || fullData.historicalGrades.length < 2) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        const ctx = document.getElementById('accuracy-chart').getContext('2d');
        const labels = fullData.historicalGrades.map(g => new Date(g.date + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
        const data = fullData.historicalGrades.map(g => g.overallMAEPts);
        if (accuracyChartInstance) accuracyChartInstance.destroy();
        accuracyChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Average Points MAE', data, borderColor: 'rgb(0, 123, 255)', tension: 0.1, backgroundColor: 'rgba(0, 123, 255, 0.1)', fill: true }] }, options: { scales: { y: { reverse: true, title: { display: true, text: 'Prediction Error (Lower is Better)' } } } } });
    }
    function renderDailyGamesForDate(date) {
        const container = document.getElementById('daily-games-container');
        container.innerHTML = '';
        const games = fullData.dailyGamesByDate[date];
        games.forEach(game => {
            const card = document.createElement('div');
            card.className = 'matchup-card';
            const [proj1, proj2] = game.projections;
            const gradeButtonHtml = game.grade.isGraded ? `<button class="grade-button" data-game-id="${game.gameId}" data-date="${date}">View Prediction Grade</button>` : '';
            card.innerHTML = `<div class="matchup-header"><span>${proj1.teamName}</span><span>vs</span><span>${proj2.teamName}</span>${gradeButtonHtml}</div>`;
            container.appendChild(card);
        });
    }
    function showGradeOverlay(game) {
        const grade = game.grade;
        const overlay = document.getElementById('grade-overlay');
        const modalContent = document.getElementById('grade-modal-content');
        const [team1, team2] = Object.keys(grade.gameSummary.predicted);
        const renderPlayer = p => `<li class="player-grade-item"><div class="player-name">${p.playerName}</div><div class="stats-comparison"><table><thead><tr><th></th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody><tr><td>Predicted</td><td class="predicted">${p.predicted.PTS.toFixed(1)}</td><td class="predicted">${p.predicted.REB.toFixed(1)}</td><td class="predicted">${p.predicted.AST.toFixed(1)}</td></tr><tr><td>Actual</td><td>${p.actual.PTS.toFixed(1)}</td><td>${p.actual.REB.toFixed(1)}</td><td>${p.actual.AST.toFixed(1)}</td></tr></tbody></table></div></li>`;
        modalContent.innerHTML = `<div class="grade-modal"><div class="modal-header"><h2>Prediction Grade</h2><span class="grade-badge grade-${grade.overallGrade.replace('+', '-plus')}">${grade.overallGrade}</span><button class="modal-close">×</button></div><div class="modal-section scoreboard"><div class="team-name">${team1}</div><div>vs</div><div class="team-name">${team2}</div><div>Predicted: <span class="score">${grade.gameSummary.predicted[team1]}</span></div><div></div><div>Predicted: <span class="score">${grade.gameSummary.predicted[team2]}</span></div><div>Actual: <span class="score">${grade.gameSummary.actual[team1]}</span></div><div></div><div>Actual: <span class="score">${grade.gameSummary.actual[team2]}</span></div></div><div class="modal-section shining-stars"><h3>⭐ Shining Stars (Most Accurate)</h3><ul class="player-grade-list">${grade.shiningStars.map(renderPlayer).join('')}</ul></div><div class="modal-section tough-calls"><h3>🔬 Tough Calls (Largest Misses)</h3><ul class="player-grade-list">${grade.toughCalls.map(renderPlayer).join('')}</ul></div><div class="modal-section"><h3>Stat Accuracy Deep Dive (Avg. Error)</h3><canvas id="stat-error-chart"></canvas></div></div>`;
        overlay.classList.remove('overlay-hidden');
        overlay.classList.add('visible');
        overlay.querySelector('.modal-close').addEventListener('click', () => { overlay.classList.remove('visible'); modalContent.innerHTML = ''; });
        overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.classList.remove('visible'); modalContent.innerHTML = ''; } });
        renderStatErrorChart(grade.statErrors);
    }
    function renderStatErrorChart(errors) {
        const ctx = document.getElementById('stat-error-chart').getContext('2d');
        if (statErrorChartInstance) statErrorChartInstance.destroy();
        statErrorChartInstance = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(errors), datasets: [{ label: 'Average Error', data: Object.values(errors), backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Average Error' } } } } });
    }
    