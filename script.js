
    let fullData = {}; let processedSeasonData = [];
    let currentSort = { column: "custom_z_score", direction: "desc" };
    let accuracyChartInstance = null;
    let defaultSeasonProjections = []; let lastSeasonActuals = [];
    let customProjectionA = null; let customProjectionB = null;

    const STAT_CONFIG = {
        points: { name: "PTS", zKey: "z_points", actualKey: "PTS" },
        reboundsTotal: { name: "REB", zKey: "z_reboundsTotal", actualKey: "REB" },
        assists: { name: "AST", zKey: "z_assists", actualKey: "AST" },
        steals: { name: "STL", zKey: "z_steals", actualKey: "STL" },
        blocks: { name: "BLK", zKey: "z_blocks", actualKey: "BLK" },
        threePointersMade: { name: "3PM", zKey: "z_threePointersMade", actualKey: "3PM" },
        turnovers: { name: "TO", zKey: "z_turnovers", actualKey: "TOV", invert: true },
        FG_impact: { name: "FG% Impact", dataKey: "FG%", zKey: "z_FG_impact", actualKey: "FG%" },
        FT_impact: { name: "FT% Impact", dataKey: "FT%", zKey: "z_FT_impact", actualKey: "FT%" },
    };

    document.addEventListener("DOMContentLoaded", async () => { /* Unchanged */
        try {
            const response = await fetch("predictions.json");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            fullData = await response.json();
            document.getElementById("last-updated").textContent = new Date(fullData.lastUpdated).toLocaleString();
            
            const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
            if (isAdmin) initializeAdminPanel();

            initializeSeasonTab();
            initializeDailyTab();
        } catch (e) { console.error("FATAL: Failed to initialize application.", e); }
    });
    
    // --- SEASON TAB & ADMIN PANEL ---
    function initializeSeasonTab(){if(!fullData.seasonLongProjections||!fullData.seasonLongProjections.length)return document.getElementById("loading-message").textContent="No season-long projections available.",void(document.getElementById("season-controls").style.display="none");defaultSeasonProjections=[...fullData.seasonLongProjections];if(fullData.lastSeasonActuals&&fullData.lastSeasonActuals.length){lastSeasonActuals=[...fullData.lastSeasonActuals];const e=document.querySelector('#projection-source-selector option[value="last_season"]');e&&(e.disabled=!1)}document.getElementById("season-controls").style.display="block",setupSeasonControls(),addSeasonEventListeners(),recalculateAndRenderSeason(),document.getElementById("loading-message").style.display="none",document.getElementById("predictions-table").style.display="table"}
    function initializeAdminPanel(){document.getElementById("admin-panel").style.display="block",document.getElementById("csv-file-a").addEventListener("change",e=>handleFileUpload(e,"A")),document.getElementById("csv-file-b").addEventListener("change",e=>handleFileUpload(e,"B")),document.getElementById("projection-source-selector").addEventListener("change",updateProjectionSource)}
    function handleFileUpload(e,t){const n=e.target.files[0];if(!n)return;const o=new FileReader;o.onload=e=>{const a=e.target.result;try{const e=parseCSV(a),s=document.getElementById(`file-${t.toLowerCase()}-status`),r=document.querySelector(`#projection-source-selector option[value="source_${t.toLowerCase()}"]`);"A"===t?customProjectionA=e:customProjectionB=e,s.textContent=`${n.name} (${e.length} players)`,s.classList.add("loaded"),r.disabled=!1;const l=document.querySelector('#projection-source-selector option[value="average"]');customProjectionA&&customProjectionB&&(l.disabled=!1),document.getElementById("projection-source-selector").value=`source_${t.toLowerCase()}`,updateProjectionSource()}catch(e){alert(`Error parsing CSV file: ${e.message}`),console.error(e)}},o.readAsText(n)}
    function parseCSV(e){const t=e.split(/\r\n|\n/),n=t[0].split(",").map(e=>e.trim()),o=[];for(let a=1;a<t.length;a++){if(!t[a])continue;const e=t[a].split(","),s={};n.forEach((t,n)=>{const a=e[n]?e[n].trim():"";s[t]=isNaN(a)||""===a?a:parseFloat(a)}),o.push(s)}return o}
    function updateProjectionSource(){const e=document.getElementById("projection-source-selector").value;switch(e){case"source_a":customProjectionA&&(fullData.seasonLongProjections=customProjectionA);break;case"source_b":customProjectionB&&(fullData.seasonLongProjections=customProjectionB);break;case"average":customProjectionA&&customProjectionB&&(fullData.seasonLongProjections=averageProjections(customProjectionA,customProjectionB));break;case"last_season":lastSeasonActuals&&(fullData.seasonLongProjections=calculateZScoresForActuals(lastSeasonActuals));break;default:fullData.seasonLongProjections=[...defaultSeasonProjections]}recalculateAndRenderSeason()}
    function averageProjections(e,t){const n=new Map(e.map(e=>[e.playerName,e])),o=[];for(const a of t){const t=n.get(a.playerName);if(t){const e={...t};for(const n of Object.keys(t))"number"==typeof t[n]&&"number"==typeof a[n]&&(e[n]=(t[n]+a[n])/2);o.push(e),n.delete(a.playerName)}else o.push(a)}return o.push(...Array.from(n.values())),o}
    function calculateZScoresForActuals(e){const t={},n={};Object.values(STAT_CONFIG).forEach(e=>{const n=e.actualKey||e.name.toLowerCase();t[n]={sum:0,count:0,values:[]}});for(const o of e)for(const[n,a]of Object.entries(STAT_CONFIG)){const s=a.actualKey||n;"number"==typeof o[s]&&(t[s].sum+=o[s],t[s].count++,t[s].values.push(o[s]))}for(const[o,a]of Object.entries(t))a.mean=a.sum/a.count,n[o]=Math.sqrt(a.values.reduce((e,t)=>(e+(t-a.mean)**2),0)/a.count);const o=t.FGM_total.sum/t.FGA_total.sum,a=t.FTM_total.sum/t.FTA_total.sum;return e.map(e=>{const s={...e};for(const[r,c]of Object.entries(STAT_CONFIG)){const d=c.actualKey||r;let i=0;if(c.dataKey&&c.dataKey.endsWith("%"))if("FG%"===d){const n=(e.FGM_total/e.FGA_total-o)*e.FGA_total;i=n/n.FGM}else if("FT%"===d){const n=(e.FTM_total/e.FTA_total-a)*e.FTA_total;i=n/n.FTM}else i=(e[d]-t[d].mean)/n[d];else i=(e[d]-t[d].mean)/n[d];isNaN(i)&&(i=0),s[c.zKey]=i}return s})}
    function setupSeasonControls(){const e=document.getElementById("category-weights-grid");e.innerHTML=Object.entries(STAT_CONFIG).map(([t,n])=>`<div class=category-item id=cat-item-${t}><label><input type=checkbox id=cb-${t} data-key=${t} checked> ${n.name}</label></div>`).join("")}
    function addSeasonEventListeners(){document.getElementById("season-controls").addEventListener("change",recalculateAndRenderSeason),document.getElementById("search-player").addEventListener("input",recalculateAndRenderSeason),document.getElementById("predictions-thead").addEventListener("click",handleSortSeason)}
    function recalculateAndRenderSeason(){const e=getSeasonControlSettings();processedSeasonData=fullData.seasonLongProjections.map(t=>{let n=0;return e.activeCategories.forEach(e=>{const o=STAT_CONFIG[e];let a=t[o.zKey]||0;o.invert&&(a*=-1),n+=a}),{...t,custom_z_score:n}}),e.searchTerm&&(processedSeasonData=processedSeasonData.filter(t=>(t.playerName||"").toLowerCase().includes(e.searchTerm))),sortSeasonData(),renderSeasonTable()}
    function getSeasonControlSettings(){const e=new Set;document.querySelectorAll("#category-weights-grid input[type=checkbox]:checked").forEach(t=>e.add(t.dataset.key));return{activeCategories:e,showCount:parseInt(document.getElementById("show-count").value,10),searchTerm:document.getElementById("search-player").value.toLowerCase().trim()}}
    function renderSeasonTable(){renderSeasonTableHeader(),renderSeasonTableBody()}
    function renderSeasonTableHeader(){const e=[{key:"rank",name:"R#"},{key:"playerName",name:"PLAYER"},{key:"pos",name:"POS"},{key:"team",name:"TEAM"},{key:"GP",name:"GP"},{key:"minutes",name:"MPG"}],t=Object.entries(STAT_CONFIG).map(([e,t])=>({key:t.dataKey||e,name:t.name.replace(" Impact","")})),n={key:"custom_z_score",name:"TOTAL"},o=[...e,...t,n];document.getElementById("predictions-thead").innerHTML=`<tr>${o.map(e=>`<th data-sort-key=${e.key}>${e.name}</th>`).join("")}</tr>`}
    function renderSeasonTableBody(){const e=document.getElementById("predictions-tbody"),t=getSeasonControlSettings(),n=processedSeasonData.slice(0,t.showCount);e.innerHTML=n.length?n.map((e,t)=>{let n=`<td>${t+1}</td><td><b>${e.playerName}</b></td><td>${e.pos||"N/A"}</td><td>${e.team||"N/A"}</td><td>${e.GP||0}</td><td>${(e.minutes||e.MIN||0).toFixed(1)}</td>`;for(const[t,o]of Object.entries(STAT_CONFIG)){let a=e[o.zKey]||0;const s=a.toFixed(2),r=a>0?"+"+s:s;let l=e[o.dataKey||o.actualKey||t];o.dataKey&&o.dataKey.endsWith("%")&&(l=(100*(l||0)).toFixed(1)+"%"),o.invert&&(a*=-1),n+=`<td class="stat-cell"><div class="color-cell-bg ${getZScoreClass(a)}"><span class="stat-value">${l?l.toFixed?l.toFixed(1):l:0}</span><span class="z-score-value">${r}</span></div></td>`}return n+=`<td><span class="stat-value">${e.custom_z_score.toFixed(2)}</span></td>`,`<tr>${n}</tr>`}).join(""):`<tr><td colspan=${Object.keys(STAT_CONFIG).length+7}>No players match your criteria.</td></tr>`}
    function handleSortSeason(e){const t=e.target.closest("th")?.dataset.sortKey;t&&(currentSort.column===t?currentSort.direction="desc"===currentSort.direction?"asc":"desc":(currentSort.column=t,currentSort.direction=["playerName","pos","team"].includes(t)?"asc":"desc"),recalculateAndRenderSeason())}
    function sortSeasonData(){const{column:e,direction:t}=currentSort,n="asc"===t?1:-1;processedSeasonData.sort((t,o)=>{let a=t[e]||"",s=o[e]||"";return"string"==typeof(a=a.playerName||a)?a.localeCompare(s.playerName||s)*n:a<s?-1*n:a>s?1*n:0})}
    function getZScoreClass(e){return null==e?"average":e>=1.75?"elite":e>=1.25?"very-good":e>=.75?"good":e<=-1.25?"not-good":e<=-.75?"below-average":"average"}
    
    // --- DAILY TAB ---
    function openTab(e,t){document.querySelectorAll(".tab-content").forEach(e=>e.style.display="none"),document.querySelectorAll(".tab-link").forEach(e=>e.classList.remove("active")),document.getElementById(t).style.display="block",e.currentTarget.classList.add("active"),"Daily"===t&&document.body.classList.remove("show-advanced")}
    function initializeDailyTab(){renderAccuracyChart();const e=document.getElementById("daily-games-container"),t=Object.keys(fullData.dailyGamesByDate||{}).sort((e,t)=>new Date(t)-new Date(e)),n=document.getElementById("daily-date-tabs");if(!t.length)return void(e.innerHTML='<div class="card"><p>No daily predictions available.</p></div>');n.innerHTML=t.map((e,t)=>`<button class="date-tab ${0===t?"active":""}" data-date="${e}">${new Date(e+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</button>`).join(""),n.addEventListener("click",e=>{const t=e.target.closest(".date-tab");t&&(document.querySelectorAll(".date-tab").forEach(e=>e.classList.remove("active")),t.classList.add("active"),renderDailyGamesForDate(t.dataset.date))}),e.addEventListener("click",e=>{if(e.target.classList.contains("grade-button")){const t=e.target.dataset.gameId,n=e.target.dataset.date,o=fullData.dailyGamesByDate[n].find(e=>e.gameId==t);o&&showGradeOverlay(o)}}),document.getElementById("toggle-advanced-stats").addEventListener("click",()=>e.classList.toggle("show-advanced")),renderDailyGamesForDate(t[0])}
    function renderAccuracyChart(){const e=document.getElementById("accuracy-chart-container");if(!fullData.historicalGrades||fullData.historicalGrades.length<2)return void(e.style.display="none");e.style.display="block";const t=document.getElementById("accuracy-chart").getContext("2d"),n=fullData.historicalGrades.map(e=>new Date(e.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),o=fullData.historicalGrades.map(e=>e.overallMAE);accuracyChartInstance&&accuracyChartInstance.destroy(),accuracyChartInstance=new Chart(t,{type:"line",data:{labels:n,datasets:[{label:"Overall MAE",data:o,borderColor:"rgb(0, 123, 255)",tension:.1,backgroundColor:"rgba(0, 123, 255, 0.1)",fill:!0}]},options:{scales:{y:{title:{display:!0,text:"Prediction Error (Lower is Better)"}}}}})}
    function renderDailyGamesForDate(e){const t=document.getElementById("daily-games-container");t.innerHTML="";(fullData.dailyGamesByDate[e]||[]).forEach(n=>{const o=document.createElement("div");o.className="matchup-card";const[a,s]=n.projections,r=n.grade&&n.grade.isGraded?`<button class="grade-button" data-game-id="${n.gameId}" data-date="${e}">View Prediction Grade</button>`:"";o.innerHTML=`<div class="matchup-header"><span class="matchup-header-teams">${a.teamName} (${a.winProb}%) vs (${s.winProb}%) ${s.teamName}</span>${r}</div><div class="matchup-body">${createTeamTableHTML(a)}${createTeamTableHTML(s)}</div>`,t.appendChild(o)})}
    function createTeamTableHTML(e){let t=`<div class="team-box-score"><div class="team-header"><h3>${e.teamName}</h3><div class="team-total">Proj. Total: <strong>${e.totalPoints.toFixed(1)}</strong></div></div><table class="daily-table"><thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FGM-A</th><th class="advanced-stat">3PM</th><th class="advanced-stat">FTM-A</th><th class="advanced-stat">TOV</th><th class="advanced-stat">FP</th></tr></thead><tbody>`;return e.players.sort((e,t)=>(t.Predicted_Minutes||0)-(e.Predicted_Minutes||0)).forEach(e=>{const n=`${(e.fgm||0).toFixed(1)}-${(e.fga||0).toFixed(1)}`,o=`${(e.ftm||0).toFixed(1)}-${(e.fta||0).toFixed(1)}`;t+=`<tr><td>${e.Player_Name}</td><td>${(e.Predicted_Minutes||0).toFixed(1)}</td><td>${(e.points||0).toFixed(1)}</td><td>${(e.reb||0).toFixed(1)}</td><td>${(e.ast||0).toFixed(1)}</td><td>${(e.stl||0).toFixed(1)}</td><td>${(e.blk||0).toFixed(1)}</td><td>${n}</td><td class="advanced-stat">${(e.three_pm||0).toFixed(1)}</td><td class="advanced-stat">${o}</td><td class="advanced-stat">${(e.tov||0).toFixed(1)}</td><td class="advanced-stat">${(e.fp||0).toFixed(1)}</td></tr>`}),t+="</tbody></table></div>",t}
    function showGradeOverlay(e){const t=e.grade,n=document.getElementById("grade-overlay"),o=document.getElementById("grade-modal-content");o.innerHTML=buildGradeModalHTML(t),n.classList.remove("overlay-hidden"),n.classList.add("visible");const a=()=>n.classList.remove("visible");n.querySelector(".modal-close").addEventListener("click",a),n.addEventListener("click",e=>e.target===n&&a())}
    function createStatComparisonHTML(e){let t="";return["PTS","REB","AST","STL","BLK"].forEach(n=>{const o=e.actual[n]-e.predicted[n],a=o.toFixed(1),s=o>=0?"+"+a:a,r=o<-1.5?"negative":"positive";t+=`
        <div class="stat-comparison-group">
            <div class="stat-label">${n}</div>
            <div class="stat-row">
                <span class="stat-value">${e.predicted[n].toFixed(1)}</span>
                <span class="stat-value">${e.actual[n].toFixed(1)}</span>
            </div>
            <div class="stat-diff ${r}">${s}</div>
        </div>`}),t}
    function buildGradeModalHTML(e){const[t,n]=Object.keys(e.gameSummary.predicted);return`
    <div class="grade-modal">
        <div class="modal-header">
            <h2>Prediction Grade</h2>
            <span class="grade-badge grade-${e.overallGrade.replace("+","-plus")}">${e.overallGrade}</span>
            <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
            <div class="modal-sidebar">
                <div class="modal-section scoreboard">
                    <h3>📊 Game Score</h3>
                    <div class="scoreboard-grid">
                        <div class="team-name">${t}</div><div>vs</div><div class="team-name">${n}</div>
                        <div class="score-type">Predicted</div><div></div><div class="score-type">Predicted</div>
                        <div class="score">${e.gameSummary.predicted[t]}</div><div></div><div class="score">${e.gameSummary.predicted[n]}</div>
                        <div class="score-type">Actual</div><div></div><div class="score-type">Actual</div>
                        <div class="score">${e.gameSummary.actual[t]}</div><div></div><div class="score">${e.gameSummary.actual[n]}</div>
                    </div>
                </div>
                <div class="modal-section accuracy-breakdown">
                    <h3>🎯 Stat Accuracy (Avg. Error)</h3>
                    <table class="accuracy-table">
                        <tbody>
                            ${Object.entries(e.statErrors).map(([e,t])=>`<tr><td>${e}</td><td>${t.toFixed(2)}</td></tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-main">
                <div class="modal-section">
                    <h3>⭐ Shining Stars (Most Accurate)</h3>
                    <ul class="player-grade-list">${e.shiningStars.map(e=>`<li class="player-grade-item"><div class="player-name">${e.playerName}</div><div class="stats-comparison">${createStatComparisonHTML(e)}</div></li>`).join("")}</ul>
                </div>
                <div class="modal-section">
                     <h3>🔬 Tough Calls (Largest Misses)</h3>
                     <ul class="player-grade-list">${e.toughCalls.map(e=>`<li class="player-grade-item"><div class="player-name">${e.playerName}</div><div class="stats-comparison">${createStatComparisonHTML(e)}</div></li>`).join("")}</ul>
                </div>
            </div>
        </div>
    </div>`}
    