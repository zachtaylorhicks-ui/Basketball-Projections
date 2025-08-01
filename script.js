
// This function runs once the HTML document is fully loaded
window.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayPredictions();
});

async function fetchAndDisplayPredictions() {
    try {
        const response = await fetch('predictions.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Update the 'Last Updated' timestamp
        const lastUpdatedElem = document.getElementById('last-updated');
        lastUpdatedElem.textContent = new Date(data.lastUpdated).toLocaleString();

        // Get the table body to insert data into
        const tbody = document.getElementById('predictions-tbody');
        tbody.innerHTML = ''; // Clear the "Loading..." message

        // Loop through each player prediction and create a table row
        data.yearlyPredictions.forEach((player, index) => {
            const row = document.createElement('tr');

            // Use template literal for clean HTML creation
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.playerName}</td>
                <td>${player.GP}</td>
                <td>${player.numMinutes.toFixed(2)}</td>
                <td>${player.points.toFixed(2)}</td>
                <td>${player.reboundsTotal.toFixed(2)}</td>
                <td>${player.assists.toFixed(2)}</td>
                <td>${player.steals.toFixed(2)}</td>
                <td>${player.blocks.toFixed(2)}</td>
                <td>${player.threePointersMade.toFixed(2)}</td>
                <td><b>${player.combined_z_score.toFixed(2)}</b></td>
            `;

            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Failed to load or process prediction data:', error);
        const tbody = document.getElementById('predictions-tbody');
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Could not load prediction data. Please try again later.</td></tr>';
    }
}
