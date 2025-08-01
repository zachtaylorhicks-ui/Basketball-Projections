
// --- GLOBAL STATE & CONFIGURATION ---
let originalData = {};
let displayedSeasonData = [];

// Maps the data key to its display name and z-score key
const STAT_CONFIG = {
    'points': { name: 'PTS', z: 'z_points' },
    'reboundsTotal': { name: 'REB', z: 'z_reboundsTotal' },
    'assists': { name: 'AST', z: 'z_assists' },
    'steals': { name: 'STL', z: 'z_steals' },
    'blocks': { name: 'BLK', z: 'z_blocks' },
    'threePointersMade': { name: '3PM', z: 'z_threePointersMade' },
    'turnovers': { name: 'TO', z: 'z_turnovers' }, // This z-score is expected to be negative for high TO
    'FG_impact': { name: 'FG% Imp', z: 'z_FG_impact' },
    'FT_impact': { name: 'FT% Imp', z: 'z_FT_impact' }
};

// Define which z-scores from the CSV make up the total
const Z_SCORE_COMPONENTS = Object.values(STAT_CONFIG).map(s => s.z);

let currentSort = { column: 'recalculated_z_score', direction: 'desc' };

// --- EVENT LISTENERS ---
window.addEventListener('DOMContentLoaded', fetchAndInitialize);

// --- INITIALIZATION ---
async function fetchAndInitialize() {
    try {
        const response = await fetch('predictions.json');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        originalData = await response.json();

        document.getElementById('last-updated').textContent = new Date(originalData.lastUpdated).toLocaleString();
        
        // Store original z-score to avoid mutation
        originalData.seasonLongProjections.forEach(p => p.original_z_score = p.combined_z_score);
        
        setupFilters();
        initializeSeasonTable();
        handleFilterChange(); // Initial calculation and render

    } catch (error) {
        console.error('Failed to load or initialize data:', error);
        document.getElementById('predictions-tbody').innerHTML = '<tr><td colspan="100%">Failed to load season data. Please check console for errors.</td></tr>';
    }
}

function setupFilters() {
    const container = document.getElementById('stat-filter-container');
    container.innerHTML = '';
    // Add a checkbox for turnovers, which has special handling
    STAT_CONFIG['turnovers'].name = 'TO (Neg)';
    
    Object.values(STAT_CONFIG).forEach(stat => {
        const id = `cb-${stat.z}`;
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.htmlFor = id;
        label.innerHTML = `<input type="checkbox" id="${id}" data-z-col="${stat.z}" checked> ${stat.name}`;
        container.appendChild(label);
    });
    container.addEventListener('change', handleFilterChange);
}


function initializeSeasonTable() {
    const thead = document.querySelector('#predictions-table thead');
    thead.innerHTML = ''; // Clear previous headers
    const headerRow = document.createElement('tr');

    // Manually create headers to control order and add non-stat columns
    const headers = [
        { key: 'rank', name: 'Rank' },
        { key: 'playerName', name: 'Player' },
        { key: 'recalculated_z_score', name: 'Z-Score' },
        { key: 'GP', name: 'GP' },
        { key: 'numMinutes', name: 'MIN' },
        { key: 'points', name: 'PTS' },
        { key: 'reboundsTotal', name: 'REB' },
        { key: 'assists', name: 'AST' },
        { key: 'steals', name: 'STL' },
        { key: 'blocks', name: 'BLK' },
        { key: 'threePointersMade', name: '3PM' },
        { key: 'turnovers', name: 'TO' },
        { key: 'FG_impact', name: 'FG% Imp' },
        { key: 'FT_impact', name: 'FT% Imp' }
    ];

    headerRow.innerHTML = headers.map(h => `<th data-sort-key="${h.key}">${h.name} <span class="sort-indicator"></span></th>`).join('');
    thead.appendChild(headerRow);
    
    thead.querySelectorAll('th').forEach(th => th.addEventListener('click', handleSort));
}

// --- DATA PROCESSING & RENDERING (SEASON) ---

function handleFilterChange() {
    const checkedZCols = new Set(
        [...document.querySelectorAll('#stat-filter-container input:checked')]
        .map(cb => cb.dataset.zCol)
    );

    displayedSeasonData = JSON.parse(JSON.stringify(originalData.seasonLongProjections));
    
    displayedSeasonData.forEach(player => {
        let new_z_score = 0;
        // Use the defined components to calculate the score
        for (const z_col of Z_SCORE_COMPONENTS) {
            if (checkedZCols.has(z_col)) {
                // The z-score for turnovers is already negative in the data, so simple addition works.
                new_z_score += (player[z_col] || 0);
            }
        }
        player.recalculated_z_score = new_z_score.toFixed(2);
    });
    
    sortTable();
    renderSeasonTable();
}

function renderSeasonTable() {
    const tbody = document.getElementById('predictions-tbody');
    tbody.innerHTML = '';

    displayedSeasonData.forEach((player, index) => {
        const row = document.createElement('tr');
        
        // This mirrors the order in initializeSeasonTable
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player.playerName}</td>
            <td><b>${player.recalculated_z_score}</b></td>
            <td>${player.GP}</td>
            <td>${player.numMinutes}</td>
            ${renderStatCell('points', player)}
            ${renderStatCell('reboundsTotal', player)}
            ${renderStatCell('assists', player)}
            ${renderStatCell('steals', player)}
            ${renderStatCell('blocks', player)}
            ${renderStatCell('threePointersMade', player)}
            ${renderStatCell('turnovers', player)}
            ${renderStatCell('FG_impact', player)}
            ${renderStatCell('FT_impact', player)}
        `;
        tbody.appendChild(row);
    });
    updateSortIndicators();
}

function renderStatCell(key, player) {
    const conf = Object.values(STAT_CONFIG).find(c => c.z === `z_${key}`) || STAT_CONFIG[key];
    if (!conf) return `<td>${player[key]}</td>`;
    
    const zKey = conf.z;
    const isTurnover = key === 'turnovers';

    return `<td class="stat-cell"><div>
                <span class="stat-value">${player[key] !== undefined ? player[key] : 'N/A'}</span>
                <span class="z-score" style="${getZScoreStyle(player[zKey], isTurnover)}">${player[zKey]}</span>
            </div></td>`;
}


// --- SORTING & UTILITIES ---

function handleSort(event) {
    const columnKey = event.currentTarget.dataset.sortKey;
    if (!columnKey) return;

    const isAsc = currentSort.column === columnKey && currentSort.direction === 'desc';
    currentSort = { column: columnKey, direction: isAsc ? 'asc' : 'desc' };
    
    sortTable();
    renderSeasonTable();
}

function sortTable() {
    const { column, direction } = currentSort;
    const modifier = direction === 'asc' ? 1 : -1;
    
    displayedSeasonData.sort((a, b) => {
        if (column === 'rank') return 0;
        
        let valA = a[column];
        let valB = b[column];

        // Convert to number if they are numeric strings
        if (!isNaN(valA) && !isNaN(valB)) {
            valA = Number(valA);
            valB = Number(valB);
        }
        
        if (typeof valA === 'string') return valA.localeCompare(valB) * modifier;
        if (valA < valB) return -1 * modifier;
        if (valA > valB) return 1 * modifier;
        return 0;
    });
}

function getZScoreStyle(z, invert = false) {
    if (z === null || z === undefined) return 'background-color: #888;';
    const intensity = Math.min(1, Math.abs(z) / 2.5); // Adjust divisor to control sensitivity
    const alpha = 0.6 + intensity * 0.4;
    
    let isGood;
    if (invert) {
        isGood = z < 0; // For turnovers, a negative z-score is good
    } else {
        isGood = z > 0; // For other stats, a positive z-score is good
    }

    const color = isGood ? `rgba(28, 148, 93, ${alpha})` : `rgba(217, 48, 37, ${alpha})`;
    return `background-color: ${color};`;
}

function updateSortIndicators() {
    document.querySelectorAll('#predictions-table th').forEach(th => {
        const span = th.querySelector('.sort-indicator');
        if (!span) return;
        if (th.dataset.sortKey === currentSort.column) {
            span.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
        } else {
            span.textContent = '';
        }
    });
}
