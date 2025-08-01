
// --- GLOBAL STATE ---
let originalData = {};

// --- EVENT LISTENERS ---
window.addEventListener('DOMContentLoaded', fetchAndInitialize);

// --- INITIALIZATION ---
async function fetchAndInitialize() {
    try {
        const response = await fetch('predictions.json');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        originalData = await response.json();
        
        document.getElementById('last-updated').textContent = new Date(originalData.lastUpdated).toLocaleString();
        
        renderDailyGames();

    } catch (error) {
        console.error('Failed to load or initialize data:', error);
        document.getElementById('daily-games-container').innerHTML = '<div class="card"><p>Failed to load daily game data. Please check console for errors.</p></div>';
    }
}

// --- RENDERING (DAILY) ---
function renderDailyGames() {
    const container = document.getElementById('daily-games-container');
    container.innerHTML = '';
    if (!originalData.dailyGames || originalData.dailyGames.length === 0) {
        container.innerHTML = "<div class='card'><p>No daily game predictions available at this time.</p></div>";
        return;
    }

    originalData.dailyGames.forEach(game => {
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        
        let teamsHTML = game.predictions.map(team => `
            <div class="team-prediction-container">
                <h3>${team.teamName}</h3>
                <div class="table-container">
                    <table class="daily-table">
                        <thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr></thead>
                        <tbody>
                            ${team.players.map(p => `
                                <tr>
                                    <td>${p['Player_Name']}</td>
                                    <td>${p['Predicted_Minutes']}</td>
                                    <td>${p.points_lower}-${p.points_upper}</td>
                                    <td>${p.reboundsTotal_lower}-${p.reboundsTotal_upper}</td>
                                    <td>${p.assists_lower}-${p.assists_upper}</td>
                                    <td>${p.steals_lower}-${p.steals_upper}</td>
                                    <td>${p.blocks_lower}-${p.blocks_upper}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`).join('');

        gameCard.innerHTML = `<div class="game-card-header">${game.teams}</div>${teamsHTML}`;
        container.appendChild(gameCard);
    });
}
