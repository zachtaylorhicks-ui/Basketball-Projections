
// --- CONFIGURATION ---
// This object defines the statistical categories, their display names, and the keys used to access their data and z-scores from predictions.json.
// This is the single source of truth for all season-long stat rendering.
const STAT_CONFIG = {
    pts:       { name: "PTS",        dataKey: "pts",       zKey: "z_pts" },
    reb:       { name: "REB",        dataKey: "reb",       zKey: "z_reb" },
    ast:       { name: "AST",        dataKey: "ast",       zKey: "z_ast" },
    stl:       { name: "STL",        dataKey: "stl",       zKey: "z_stl" },
    blk:       { name: "BLK",        dataKey: "blk",       zKey: "z_blk" },
    three_pm:  { name: "3PM",        dataKey: "three_pm",  zKey: "z_three_pm" },
    tov:       { name: "TO (Neg)",   dataKey: "tov",       zKey: "z_tov",        invertColor: true }, // Turnovers are bad, so we invert their color mapping.
    fg_impact: { name: "FG% Impact", dataKey: "fg_pct",    zKey: "z_fg_impact" },
    ft_impact: { name: "FT% Impact", dataKey: "ft_pct",    zKey: "z_ft_impact" }
};
const WEIGHT_OPTIONS = [
    { text: "Punt (x0)", value: 0 }, { text: "x 0.25", value: 0.25 },
    { text: "x 0.5", value: 0.5 }, { text: "x 0.75", value: 0.75 },
    { text: "Standard (x1)", value: 1 }, { text: "x 1.25", value: 1.25 },
    { text: "x 1.5", value: 1.5 }, { text: "x 2.0", value: 2 }
];

// --- GLOBAL STATE ---
let fullData = {}; // Will hold the entire dataset from predictions.json
let processedData = []; // Holds the data after z-scores are calculated and weighted
let currentSort = { column: "weighted_z_score", direction: "desc" }; // Default sort order

// --- DOM ELEMENT CACHE ---
const elements = {
    lastUpdated: document.getElementById("last-updated"),
    showCount: document.getElementById("show-count"),
    searchPlayer: document.getElementById("search-player"),
    categoryGrid: document.getElementById("category-weights-grid"),
    table: document.getElementById("predictions-table"),
    tableHead: document.getElementById("predictions-thead"),
    tableBody: document.getElementById("predictions-tbody"),
    loadingMessage: document.getElementById("loading-message"),
    dailyGamesContainer: document.getElementById("daily-games-container")
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("predictions.json");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullData = await response.json();

        elements.lastUpdated.textContent = new Date(fullData.lastUpdated).toLocaleString();
        
        // Initialize both tabs
        initializeSeasonTab();
        renderDailyGamesTab();

    } catch (error) {
        console.error("Failed to initialize:", error);
        elements.loadingMessage.textContent = 'Error loading data. Please check the console and try again later.';
        elements.dailyGamesContainer.innerHTML = '<p class="card">Error loading daily games data.</p>';
    }
});

// --- TAB LOGIC ---
function openTab(evt, tabName) {
    document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
    document.querySelectorAll(".tab-link").forEach(link => link.classList.remove("active"));
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
    // This fixes an issue where the table header isn't positioned correctly on first load.
    if (tabName === 'Season') document.getElementById(tabName).classList.add("active");
    else document.getElementById('Season').classList.remove("active");
}
// Set initial active tab display
document.getElementById('Season').style.display = 'block';

// --- SEASON TAB LOGIC ---

/**
 * Sets up the entire season tab: builds controls, adds event listeners, and performs the initial render.
 */
function initializeSeasonTab() {
    if (!fullData.seasonLongProjections || fullData.seasonLongProjections.length === 0) {
        elements.loadingMessage.textContent = 'No season-long projections are available.';
        return;
    }
    setupSeasonControls();
    addSeasonEventListeners();
    recalculateAndRender();
    elements.loadingMessage.style.display = 'none';
    elements.table.style.display = 'table';
}

/**
 * Dynamically creates the category checkboxes and weight dropdowns from STAT_CONFIG.
 */
function setupSeasonControls() {
    elements.categoryGrid.innerHTML = Object.entries(STAT_CONFIG).map(([key, config]) => `
        <div class="category-item" id="cat-item-${key}">
            <label for="cb-${key}"><input type="checkbox" id="cb-${key}" data-key="${key}" checked> ${config.name}</label>
            <select id="sel-${key}" data-key="${key}">
                ${WEIGHT_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value === 1 ? "selected" : ""}>${opt.text}</option>`).join("")}
            </select>
        </div>`).join("");
}

/**
 * Attaches event listeners to all interactive controls on the season tab.
 */
function addSeasonEventListeners() {
    elements.categoryGrid.addEventListener("change", recalculateAndRender);
    elements.showCount.addEventListener("change", recalculateAndRender);
    elements.searchPlayer.addEventListener("input", recalculateAndRender);
    elements.tableHead.addEventListener("click", handleSort);
}

/**
 * The main function that orchestrates the filtering, calculating, sorting, and rendering of the table.
 * This runs every time a control is changed.
 */
function recalculateAndRender() {
    const settings = getControlSettings();

    // 1. Calculate weighted Z-scores for all players based on current settings
    processedData = fullData.seasonLongProjections.map(player => {
        let weighted_z_score = 0;
        let activeCategories = 0;
        for (const key in STAT_CONFIG) {
            const weight = settings.weights[key];
            if (weight > 0) {
                const zKey = STAT_CONFIG[key].zKey;
                weighted_z_score += (player[zKey] || 0) * weight;
                activeCategories++;
            }
        }
        // Normalize the score by number of active categories to keep scores comparable
        const final_score = activeCategories > 0 ? (weighted_z_score / activeCategories) * 3 : 0;
        return { ...player, weighted_z_score: final_score };
    });

    // 2. Filter by search term
    if (settings.searchTerm) {
        processedData = processedData.filter(p => p.playerName.toLowerCase().includes(settings.searchTerm));
    }

    // 3. Sort the data
    sortData(processedData);

    // 4. Render the table with the final, processed data
    renderTable(settings.activeColumns);
}

/**
 * Reads the current state of all UI controls (search, weights, etc.).
 * @returns {object} An object containing the current user settings.
 */
function getControlSettings() {
    const weights = {};
    const activeColumns = new Set();

    document.querySelectorAll(".category-item").forEach(item => {
        const key = item.querySelector("input").dataset.key;
        const checkbox = item.querySelector("input");
        const select = item.querySelector("select");
        weights[key] = checkbox.checked ? parseFloat(select.value) : 0;
        if (checkbox.checked) {
            activeColumns.add(key);
        }
    });

    return {
        weights,
        activeColumns,
        showCount: parseInt(elements.showCount.value, 10),
        searchTerm: elements.searchPlayer.value.toLowerCase().trim()
    };
}

/**
 * Renders both the header and the body of the main predictions table.
 * @param {Set<string>} activeColumns - A set of stat keys that are currently active.
 */
function renderTable(activeColumns) {
    renderTableHeader(activeColumns);
    renderTableBody(activeColumns);
}

/**
 * Constructs and injects the HTML for the table header (<thead>).
 * @param {Set<string>} activeColumns - A set of stat keys to determine which stat headers to show.
 */
function renderTableHeader(activeColumns) {
    const baseHeaders = [
        { key: "rank", name: "R#" }, { key: "playerName", name: "PLAYER" },
        { key: "pos", name: "POS" }, { key: "team", name: "TEAM" },
        { key: "gp", name: "GP" }, { key: "mpg", name: "MPG" }
    ];

    const statHeaders = Object.entries(STAT_CONFIG)
        .filter(([key]) => activeColumns.has(key))
        .map(([key, config]) => ({ 
            key: config.dataKey, 
            name: config.name.replace(" (Neg)", "").replace(" Impact", "") 
        }));

    const finalHeader = { key: "weighted_z_score", name: "TOTAL" };
    const allHeaders = [...baseHeaders, ...statHeaders, finalHeader];

    elements.tableHead.innerHTML = `<tr>${allHeaders.map(h => `
        <th data-sort-key="${h.key}">${h.name}<span class="sort-indicator"></span></th>`).join("")}</tr>`;
    
    updateSortIndicators();
}

/**
 * Constructs and injects the HTML for the table body (<tbody>).
 * @param {Set<string>} activeColumns - A set of stat keys to determine which stat columns to show.
 */
function renderTableBody(activeColumns) {
    const dataToRender = processedData.slice(0, parseInt(elements.showCount.value, 10));
    let html = "";

    if (dataToRender.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="20">No players match your criteria.</td></tr>';
        return;
    }
    
    dataToRender.forEach((player, index) => {
        let row = '<tr>';
        row += `<td>${player.original_rank}</td>`;
        row += `<td><b>${player.playerName}</b></td>`;
        row += `<td>${player.pos}</td>`;
        row += `<td>${player.team}</td>`;
        row += `<td>${player.gp}</td>`;
        row += `<td>${player.mpg}</td>`;

        for (const [key, config] of Object.entries(STAT_CONFIG)) {
            if (activeColumns.has(key)) {
                const zScore = player[config.zKey] || 0;
                const value = player[config.dataKey] || 0;
                row += `<td class="cell-value color-cell ${getZScoreClass(zScore, config.invertColor)}">${value}</td>`;
            }
        }

        row += `<td><b>${player.weighted_z_score.toFixed(2)}</b></td>`;
        row += '</tr>';
        html += row;
    });

    elements.tableBody.innerHTML = html;
}

/**
 * Handles clicks on the table header to change the sort order.
 * @param {Event} e - The click event.
 */
function handleSort(e) {
    const key = e.target.closest("th")?.dataset.sortKey;
    if (!key) return;

    if (currentSort.column === key) {
        currentSort.direction = currentSort.direction === "desc" ? "asc" : "desc";
    } else {
        currentSort.column = key;
        currentSort.direction = (key === 'playerName' || key === 'pos' || key === 'team') ? 'asc' : 'desc'; // Default text to asc, numeric to desc
    }
    
    recalculateAndRender();
}

/**
 * Sorts an array of player data based on the `currentSort` global state.
 * @param {Array<object>} data - The array of player objects to sort.
 */
function sortData(data) {
    const { column, direction } = currentSort;
    const mod = direction === "asc" ? 1 : -1;

    // Add original rank before sorting
    data.forEach((p, i) => p.original_rank = i + 1);
    
    data.sort((a, b) => {
        // Special case for initial rank
        if (column === 'rank') return (a.original_rank - b.original_rank) * mod;

        let valA = a[column];
        let valB = b[column];

        if (typeof valA === 'string') {
            return valA.localeCompare(valB) * mod;
        }
        if (valA < valB) return -1 * mod;
        if (valA > valB) return 1 * mod;
        return 0;
    });
}

/**
 * Determines the CSS class for a cell based on its Z-score.
 * @param {number} z - The Z-score.
 * @param {boolean} invert - Whether to invert the color scale (for turnovers).
 * @returns {string} The appropriate CSS class name.
 */
function getZScoreClass(z, invert = false) {
    if (z === undefined || z === null) return "average";
    const val = invert ? -z : z;
    if (val >= 1.75) return "elite";
    if (val >= 1.25) return "very-good";
    if (val >= 0.75) return "good";
    if (val <= -1.25) return "not-good";
    if (val <= -0.75) return "below-average";
    return "average";
}

/**
 * Updates the sort indicators (▲/▼) in the table header.
 */
function updateSortIndicators() {
    elements.tableHead.querySelectorAll("th").forEach(th => {
        const indicator = th.querySelector(".sort-indicator");
        if (indicator) {
            indicator.textContent = th.dataset.sortKey === currentSort.column
                ? (currentSort.direction === "asc" ? "▲" : "▼")
                : "";
        }
    });
}


// --- DAILY GAMES TAB LOGIC ---
function renderDailyGamesTab() {
    const container = elements.dailyGamesContainer;
    container.innerHTML = "";

    if (!fullData.dailyGames || fullData.dailyGames.length === 0) {
        container.innerHTML = "<div class='card'><p>No daily game predictions available at this time.</p></div>";
        return;
    }

    fullData.dailyGames.forEach(game => {
        const gameCard = document.createElement("div");
        gameCard.className = "game-card";

        let teamsHTML = game.predictions.map(team => `
            <div class="team-prediction-container">
                <h3>${team.teamName}</h3>
                <div class="table-container">
                    <table class="daily-table">
                        <thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr></thead>
                        <tbody>
                            ${team.players.map(p => `
                                <tr>
                                    <td>${p.Player_Name}</td>
                                    <td>${p.Predicted_Minutes}</td>
                                    <td>${p.points_lower}-${p.points_upper}</td>
                                    <td>${p.reboundsTotal_lower}-${p.reboundsTotal_upper}</td>
                                    <td>${p.assists_lower}-${p.assists_upper}</td>
                                    <td>${p.steals_lower}-${p.steals_upper}</td>
                                    <td>${p.blocks_lower}-${p.blocks_upper}</td>
                                </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>`).join("");

        gameCard.innerHTML = `<div class="game-card-header">${game.teams}</div>${teamsHTML}`;
        container.appendChild(gameCard);
    });
}
