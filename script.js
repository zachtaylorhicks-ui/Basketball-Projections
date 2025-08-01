
    let fullData = {}; let processedSeasonData = [];
    let currentSort = { column: "custom_z_score", direction: "desc" };
    let accuracyChartInstance = null; let statErrorChartInstance = null;
    let defaultSeasonProjections = []; let customProjectionA = null; let customProjectionB = null;

    const STAT_CONFIG = {
        points: { name: "PTS", zKey: "z_points" },
        reboundsTotal: { name: "REB", zKey: "z_reboundsTotal" },
        assists: { name: "AST", zKey: "z_assists" },
        steals: { name: "STL", zKey: "z_steals" },
        blocks: { name: "BLK", zKey: "z_blocks" },
        threePointersMade: { name: "3PM", zKey: "z_threePointersMade" },
        turnovers: { name: "TO", zKey: "z_turnovers", invert: true },
        FG_impact: { name: "FG% Impact", dataKey: "FG%", zKey: "z_FG_impact" },
        FT_impact: { name: "FT% Impact", dataKey: "FT%", zKey: "z_FT_impact" },
    };

    document.addEventListener("DOMContentLoaded", async () => { /* ... Unchanged from v11 ... */ console.log("LOG: DOM fully loaded. Initializing script...");try{console.log("LOG: Fetching predictions.json...");const e=await fetch("predictions.json");if(!e.ok)throw new Error(`HTTP error! status: ${e.status}`);fullData=await e.json(),console.log("LOG: Successfully fetched and parsed predictions.json. Full data object:",fullData),document.getElementById("last-updated").textContent=new Date(fullData.lastUpdated).toLocaleString();const t=new URLSearchParams(window.location.search).get("admin")==="true";t&&(console.log("LOG: Admin mode detected. Initializing admin panel."),initializeAdminPanel()),initializeSeasonTab(),initializeDailyTab()}catch(e){console.error("FATAL: Failed to initialize application.",e),document.querySelector("main").innerHTML=`<div class="card" style="color: red;"><h2>Failed to Load Data</h2><p>Could not fetch or parse predictions.json. Please check the file and try again.</p><p>Error: ${e.message}</p></div>`}});
    function openTab(evt, tabName) { /* ... Unchanged from v11 ... */ document.querySelectorAll(".tab-content").forEach(e=>{e.style.display="none"}),document.querySelectorAll(".tab-link").forEach(e=>{e.classList.remove("active")}),document.getElementById(tabName).style.display="block",evt.currentTarget.classList.add("active"),"Daily"===tabName&&document.body.classList.remove("show-advanced")}
    function initializeAdminPanel() { /* ... Unchanged from v11 ... */ document.getElementById("admin-panel").style.display="block",document.getElementById("csv-file-a").addEventListener("change",e=>handleFileUpload(e,"A")),document.getElementById("csv-file-b").addEventListener("change",e=>handleFileUpload(e,"B")),document.getElementById("projection-source-selector").addEventListener("change",updateProjectionSource)}
    function handleFileUpload(event, source) { /* ... Unchanged from v11 ... */ const file=event.target.files[0];if(!file)return;const reader=new FileReader;reader.onload=e=>{const t=e.target.result;try{const e=parseCSV(t),n=document.getElementById(`file-${"a"===source.toLowerCase()?"a":"b"}-status`),o=document.querySelector(`#projection-source-selector option[value="source_${source.toLowerCase()}"]`);"A"===source?customProjectionA=e:customProjectionB=e,n.textContent=`${file.name} (${e.length} players)`,n.classList.add("loaded"),o.disabled=!1;const a=document.querySelector('#projection-source-selector option[value="average"]');customProjectionA&&customProjectionB&&(a.disabled=!1),document.getElementById("projection-source-selector").value=`source_${source.toLowerCase()}`,updateProjectionSource()}catch(e){alert(`Error parsing CSV file: ${e.message}`),console.error(e)}},reader.readAsText(file)}
    function parseCSV(text) { /* ... Unchanged from v11 ... */ const lines=text.split(/\r\n|\n/),headers=lines[0].split(",").map(e=>e.trim()),data=[];for(let i=1;i<lines.length;i++){if(!lines[i])continue;const t=lines[i].split(","),s={};headers.forEach((e,n)=>{const o=t[n]?t[n].trim():"";s[e]=isNaN(o)||""===o?o:parseFloat(o)}),data.push(s)}return data}
    function updateProjectionSource() { /* ... Unchanged from v11 ... */ const e=document.getElementById("projection-source-selector").value;switch(e){case"source_a":customProjectionA&&(fullData.seasonLongProjections=customProjectionA);break;case"source_b":customProjectionB&&(fullData.seasonLongProjections=customProjectionB);break;case"average":customProjectionA&&customProjectionB&&(fullData.seasonLongProjections=averageProjections(customProjectionA,customProjectionB));break;default:fullData.seasonLongProjections=[...defaultSeasonProjections]}recalculateAndRenderSeason()}
    function averageProjections(projA, projB) { /* ... Unchanged from v11 ... */ const e=new Map(projA.map(e=>[e.playerName,e])),t=[],n=Object.values(STAT_CONFIG).flatMap(e=>[e.dataKey,e.zKey,e.name.toLowerCase(),"GP","minutes","turnovers","points","reboundsTotal","assists","steals","blocks","threePointersMade"]).filter(Boolean);for(const o of projB){const s=e.get(o.playerName);if(s){const r={...s};for(const c of n)"number"==typeof s[c]&&"number"==typeof o[c]&&(r[c]=(s[c]+o[c])/2);t.push(r),e.delete(o.playerName)}else t.push(o)}return t.push(...Array.from(e.values())),t}
    function initializeSeasonTab(){ /* ... Unchanged from v11 ... */ console.log("LOG: Initializing Season Tab...");if(!fullData.seasonLongProjections||0===fullData.seasonLongProjections.length)return console.warn("WARN: No season-long projections found in data."),document.getElementById("loading-message").textContent="No season-long projections available.",void(document.getElementById("season-controls").style.display="none");defaultSeasonProjections=[...fullData.seasonLongProjections],document.getElementById("season-controls").style.display="block",setupSeasonControls(),addSeasonEventListeners(),recalculateAndRenderSeason(),document.getElementById("loading-message").style.display="none",document.getElementById("predictions-table").style.display="table",console.log("LOG: Season Tab initialized successfully.")}
    function setupSeasonControls(){const e=document.getElementById("category-weights-grid");e.innerHTML=Object.entries(STAT_CONFIG).map(([t,n])=>`<div class=category-item id=cat-item-${t}><label for=cb-${t}><input type=checkbox id=cb-${t} data-key=${t} checked> ${n.name}</label></div>`).join("")}
    function addSeasonEventListeners(){document.getElementById("season-controls").addEventListener("change",recalculateAndRenderSeason),document.getElementById("search-player").addEventListener("input",recalculateAndRenderSeason),document.getElementById("predictions-thead").addEventListener("click",handleSortSeason)}
    function recalculateAndRenderSeason(){const e=getSeasonControlSettings();processedSeasonData=fullData.seasonLongProjections.map(t=>{let n=0;return e.activeCategories.forEach(e=>{const o=STAT_CONFIG[e];let a=t[o.zKey]||0;o.invert&&(a*=-1),n+=a}),{...t,custom_z_score:n}}),e.searchTerm&&(processedSeasonData=processedSeasonData.filter(t=>t.playerName.toLowerCase().includes(e.searchTerm))),sortSeasonData(),renderSeasonTable()}
    function getSeasonControlSettings(){const e=new Set;document.querySelectorAll("#category-weights-grid input[type=checkbox]:checked").forEach(t=>{e.add(t.dataset.key)});return{activeCategories:e,showCount:parseInt(document.getElementById("show-count").value,10),searchTerm:document.getElementById("search-player").value.toLowerCase().trim()}}
    function renderSeasonTable(){renderSeasonTableHeader(),renderSeasonTableBody()}
    function renderSeasonTableHeader(){const e=[{key:"rank",name:"R#"},{key:"playerName",name:"PLAYER"},{key:"pos",name:"POS"},{key:"team",name:"TEAM"},{key:"GP",name:"GP"},{key:"minutes",name:"MPG"}],t=Object.entries(STAT_CONFIG).map(([e,t])=>({key:t.dataKey||e,name:t.name.replace(" Impact","")})),n={key:"custom_z_score",name:"TOTAL"},o=[...e,...t,n];document.getElementById("predictions-thead").innerHTML=`<tr>${o.map(e=>`<th data-sort-key=${e.key}>${e.name}</th>`).join("")}</tr>`}
    function renderSeasonTableBody(){const e=document.getElementById("predictions-tbody"),t=getSeasonControlSettings(),n=processedSeasonData.slice(0,t.showCount);e.innerHTML=0===n.length?'<tr><td colspan=20>No players match your criteria.</td></tr>':n.map((e,t)=>{let n=`<td>${t+1}</td><td><b>${e.playerName}</b></td><td>${e.pos||"N/A"}</td><td>${e.team||"N/A"}</td><td>${e.GP||0}</td><td>${e.minutes?e.minutes.toFixed(1):0}</td>`;for(const[t,o]of Object.entries(STAT_CONFIG)){let a=e[o.zKey]||0;const s=a.toFixed(2),r=a>0?"+"+s:s;let l=e[o.dataKey||t];o.dataKey&&o.dataKey.endsWith("%")&&(l=(100*(l||0)).toFixed(1)+"%"),o.invert&&(a*=-1),n+=`<td class="stat-cell"><div class="color-cell-bg ${getZScoreClass(a)}"><span class="stat-value">${l?l.toFixed?l.toFixed(1):l:0}</span><span class="z-score-value">${r}</span></div></td>`}return n+=`<td><span class="stat-value">${e.custom_z_score.toFixed(2)}</span></td>`,`<tr>${n}</tr>`}).join("")}
    function handleSortSeason(e){const t=e.target.closest("th")?.dataset.sortKey;t&&(currentSort.column===t?currentSort.direction="desc"===currentSort.direction?"asc":"desc":(currentSort.column=t,currentSort.direction=["playerName","pos","team"].includes(t)?"asc":"desc"),recalculateAndRenderSeason())}
    function sortSeasonData(){const{column:e,direction:t}=currentSort,n="asc"===t?1:-1;processedSeasonData.sort((t,o)=>{let a=t[e]||"",s=o[e]||"";return"string"==typeof a?a.localeCompare(s)*n:a<s?-1*n:a>s?1*n:0})}
    function getZScoreClass(e){return null==e?"average":e>=1.75?"elite":e>=1.25?"very-good":e>=.75?"good":e<=-1.25?"not-good":e<=-.75?"below-average":"average"}
    
    // --- DAILY TAB ---
    function initializeDailyTab(){ /* ... Unchanged from v11 ... */ console.log("LOG: Initializing Daily Tab...");renderAccuracyChart();const e=document.getElementById("daily-games-container");console.log("LOG: Checking for daily game data in fullData.dailyGamesByDate:",fullData.dailyGamesByDate);const t=Object.keys(fullData.dailyGamesByDate||{});console.log(`LOG: Found ${t.length} dates with game data. Dates: [${t.join(", ")}]`);const n=t.sort((e,t)=>new Date(t)-new Date(e)),o=document.getElementById("daily-date-tabs");if(0===n.length)return console.warn("WARN: No daily predictions available. Displaying message."),void(e.innerHTML='<div class="card"><p>No daily predictions available.</p></div>');o.innerHTML=n.map((e,t)=>`<button class="date-tab ${0===t?"active":""}" data-date="${e}">${new Date(e+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</button>`).join(""),o.addEventListener("click",(e=>{const t=e.target.closest(".date-tab");t&&(document.querySelectorAll(".date-tab").forEach((e=>e.classList.remove("active"))),t.classList.add("active"),renderDailyGamesForDate(t.dataset.date))})),e.addEventListener("click",(e=>{if(e.target.classList.contains("grade-button")){const t=e.target.dataset.gameId,n=e.target.dataset.date,o=fullData.dailyGamesByDate[n].find((e=>e.gameId==t));o&&showGradeOverlay(o)}})),document.getElementById("toggle-advanced-stats").addEventListener("click",(()=>{e.classList.toggle("show-advanced")})),console.log(`LOG: Initial render for date: ${n[0]}`),renderDailyGamesForDate(n[0]),console.log("LOG: Daily Tab initialized successfully.")}
    function renderAccuracyChart(){const e=document.getElementById("accuracy-chart-container");if(!fullData.historicalGrades||fullData.historicalGrades.length<2)return void(e.style.display="none");e.style.display="block";const t=document.getElementById("accuracy-chart").getContext("2d"),n=fullData.historicalGrades.map((e=>new Date(e.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}))),o=fullData.historicalGrades.map((e=>e.overallMAEPts));accuracyChartInstance&&accuracyChartInstance.destroy(),accuracyChartInstance=new Chart(t,{type:"line",data:{labels:n,datasets:[{label:"Average Points MAE",data:o,borderColor:"rgb(0, 123, 255)",tension:.1,backgroundColor:"rgba(0, 123, 255, 0.1)",fill:!0}]},options:{scales:{y:{reverse:!0,title:{display:!0,text:"Prediction Error (Lower is Better)"}}}}})}
    function renderDailyGamesForDate(e){console.log(`LOG: Rendering daily games for date: ${e}`);const t=document.getElementById("daily-games-container");t.innerHTML="";const n=fullData.dailyGamesByDate[e]||[];console.log(`LOG: Found ${n.length} games for this date.`);n.forEach((e,o)=>{const a=document.createElement("div");a.className="matchup-card";const[s,r]=e.projections,c=e.grade&&e.grade.isGraded?`<button class="grade-button" data-game-id="${e.gameId}" data-date="${e}">View Prediction Grade</button>`:"";a.innerHTML=`<div class="matchup-header"><span>${s.teamName} (${s.winProb}%)</span><span>vs</span><span>(${r.winProb}%) ${r.teamName}</span>${c}</div><div class="matchup-body">${createTeamTableHTML(s)}${createTeamTableHTML(r)}</div>`,t.appendChild(a)})}
    function createTeamTableHTML(teamData) {
        let tableHTML = `<div class="team-box-score">
            <div class="team-header">
                <h3>${teamData.teamName}</h3>
                <div class="team-total">Proj. Total: <strong>${teamData.totalPoints}</strong></div>
            </div>
            <table class="daily-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>MIN</th>
                        <th>PTS</th>
                        <th>REB</th>
                        <th>AST</th>
                        <th>STL</th>
                        <th>BLK</th>
                        <th>FGM-A</th>
                        <th class="advanced-stat">FGM</th>
                        <th class="advanced-stat">FGA</th>
                        <th class="advanced-stat">3PM</th>
                        <th class="advanced-stat">FTM</th>
                        <th class="advanced-stat">FTA</th>
                        <th class="advanced-stat">TOV</th>
                        <th class="advanced-stat">FP</th>
                    </tr>
                </thead>
                <tbody>`;
    
        teamData.players.sort((a, b) => (b.Predicted_Minutes || 0) - (a.Predicted_Minutes || 0)).forEach(p => {
            const fgm_a = `${(p.fgm || 0).toFixed(1)}-${(p.fga || 0).toFixed(1)}`;
            tableHTML += `
                <tr>
                    <td>${p.Player_Name}</td>
                    <td>${(p.Predicted_Minutes || 0).toFixed(1)}</td>
                    <td>${(p.points || 0).toFixed(1)}</td>
                    <td>${(p.reb || 0).toFixed(1)}</td>
                    <td>${(p.ast || 0).toFixed(1)}</td>
                    <td>${(p.stl || 0).toFixed(1)}</td>
                    <td>${(p.blk || 0).toFixed(1)}</td>
                    <td>${fgm_a}</td>
                    <td class="advanced-stat">${(p.fgm || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.fga || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.three_pm || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.ftm || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.fta || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.tov || 0).toFixed(1)}</td>
                    <td class="advanced-stat">${(p.fp || 0).toFixed(1)}</td>
                </tr>`;
        });
    
        tableHTML += `</tbody></table></div>`;
        return tableHTML;
    }
    function showGradeOverlay(e){const t=e.grade,n=document.getElementById("grade-overlay"),o=document.getElementById("grade-modal-content"),[a,s]=Object.keys(t.gameSummary.predicted),r=e=>`<li class="player-grade-item"><div class="player-name">${e.playerName}</div><div class="stats-comparison"><table><thead><tr><th></th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody><tr><td>Predicted</td><td class="predicted">${e.predicted.PTS.toFixed(1)}</td><td class="predicted">${e.predicted.REB.toFixed(1)}</td><td class="predicted">${e.predicted.AST.toFixed(1)}</td></tr><tr><td>Actual</td><td>${e.actual.PTS.toFixed(1)}</td><td>${e.actual.REB.toFixed(1)}</td><td>${e.actual.AST.toFixed(1)}</td></tr></tbody></table></div></li>`;o.innerHTML=`<div class="grade-modal"><div class="modal-header"><h2>Prediction Grade</h2><span class="grade-badge grade-${t.overallGrade.replace("+","-plus")}">${t.overallGrade}</span><button class="modal-close">×</button></div><div class="modal-section scoreboard"><div class="team-name">${a}</div><div>vs</div><div class="team-name">${s}</div><div>Predicted: <span class="score">${t.gameSummary.predicted[a]}</span></div><div></div><div>Predicted: <span class="score">${t.gameSummary.predicted[s]}</span></div><div>Actual: <span class="score">${t.gameSummary.actual[a]}</span></div><div></div><div>Actual: <span class="score">${t.gameSummary.actual[s]}</span></div></div><div class="modal-section shining-stars"><h3>⭐ Shining Stars (Most Accurate)</h3><ul class="player-grade-list">${t.shiningStars.map(r).join("")}</ul></div><div class="modal-section tough-calls"><h3>🔬 Tough Calls (Largest Misses)</h3><ul class="player-grade-list">${t.toughCalls.map(r).join("")}</ul></div><div class="modal-section"><h3>Stat Accuracy Deep Dive (Avg. Error)</h3><canvas id="stat-error-chart"></canvas></div></div>`,n.classList.remove("overlay-hidden"),n.classList.add("visible"),n.querySelector(".modal-close").addEventListener("click",(()=>{n.classList.remove("visible"),o.innerHTML=""})),n.addEventListener("click",(e=>{e.target===n&&(n.classList.remove("visible"),o.innerHTML="")})),renderStatErrorChart(t.statErrors)}
    function renderStatErrorChart(e){const t=document.getElementById("stat-error-chart").getContext("2d");statErrorChartInstance&&statErrorChartInstance.destroy(),statErrorChartInstance=new Chart(t,{type:"bar",data:{labels:Object.keys(e),datasets:[{label:"Average Error",data:Object.values(e),backgroundColor:"rgba(255, 99, 132, 0.2)",borderColor:"rgba(255, 99, 132, 1)",borderWidth:1}]},options:{indexAxis:"y",plugins:{legend:{display:!1}},scales:{x:{title:{display:!0,text:"Average Error"}}}}})}
    