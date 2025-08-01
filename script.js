
// --- CONFIGURATION ---
const STAT_CONFIG={points:{name:"POINTS",dataKey:"points",zKey:"z_points"},reboundsTotal:{name:"REB",dataKey:"reboundsTotal",zKey:"z_reboundsTotal"},assists:{name:"AST",dataKey:"assists",zKey:"z_assists"},steals:{name:"STL",dataKey:"steals",zKey:"z_steals"},blocks:{name:"BLK",dataKey:"blocks",zKey:"z_blocks"},threePointersMade:{name:"3PM",dataKey:"threePointersMade",zKey:"z_threePointersMade"},turnovers:{name:"TO (Neg)",dataKey:"turnovers",zKey:"z_turnovers"},FG_impact:{name:"FG% Impact",dataKey:"FG%",zKey:"z_FG_impact"},FT_impact:{name:"FT% Impact",dataKey:"FT%",zKey:"z_FT_impact"}};
const WEIGHT_OPTIONS=[{text:"Punt (x0)",value:0},{text:"x 0.25",value:.25},{text:"x 0.5",value:.5},{text:"x 0.75",value:.75},{text:"Standard (x1)",value:1},{text:"x 1.25",value:1.25},{text:"x 1.5",value:1.5},{text:"x 2.0",value:2}];

// --- GLOBAL STATE ---
let fullData={};let filteredAndSortedData=[];let currentSort={column:"weighted_z_score",direction:"desc"};

// --- DOM ELEMENTS ---
const elements={lastUpdated:document.getElementById("last-updated"),showCount:document.getElementById("show-count"),searchPlayer:document.getElementById("search-player"),categoryGrid:document.getElementById("category-weights-grid"),tableHead:document.getElementById("predictions-thead"),tableBody:document.getElementById("predictions-tbody"),dailyGamesContainer:document.getElementById("daily-games-container")};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded",async()=>{try{const response=await fetch("predictions.json");if(!response.ok)throw new Error(`HTTP error! status: ${response.status}`);fullData=await response.json();elements.lastUpdated.textContent=new Date(fullData.lastUpdated).toLocaleString();initializeSeasonTab();renderDailyGamesTab()}catch(error){console.error("Failed to initialize:",error);elements.tableBody.innerHTML='<tr><td colspan="20">Error loading data. Please try again later.</td></tr>';elements.dailyGamesContainer.innerHTML='<p>Error loading daily games data.</p>'}});

// --- TAB LOGIC ---
function openTab(evt,tabName){document.querySelectorAll(".tab-content").forEach(tab=>tab.classList.remove("active"));document.querySelectorAll(".tab-link").forEach(link=>link.classList.remove("active"));document.getElementById(tabName).classList.add("active");evt.currentTarget.classList.add("active")}

// --- SEASON TAB LOGIC ---
function initializeSeasonTab(){setupSeasonControls();addSeasonEventListeners();recalculateAndRender()}
function setupSeasonControls(){elements.categoryGrid.innerHTML=Object.entries(STAT_CONFIG).map(([key,config])=>`
        <div class="category-item" id="cat-item-${key}">
            <label for="cb-${key}"><input type="checkbox" id="cb-${key}" data-key="${key}" checked> ${config.name}</label>
            <select id="sel-${key}" data-key="${key}">
                ${WEIGHT_OPTIONS.map(opt=>`<option value="${opt.value}" ${opt.value===1?"selected":""}>${opt.text}</option>`).join("")}
            </select>
        </div>`).join("")}
function addSeasonEventListeners(){elements.categoryGrid.addEventListener("change",recalculateAndRender);elements.showCount.addEventListener("change",recalculateAndRender);elements.searchPlayer.addEventListener("input",recalculateAndRender);elements.tableHead.addEventListener("click",handleSort)}
function recalculateAndRender(){const settings=getControlSettings();let processedData=fullData.seasonLongProjections.map(player=>{let weighted_z_score=0;for(const key in STAT_CONFIG){if(settings.weights[key]>0){const zKey=STAT_CONFIG[key].zKey;weighted_z_score+=(player[zKey]||0)*settings.weights[key]}}
return{...player,weighted_z_score}});if(settings.searchTerm){processedData=processedData.filter(p=>p.playerName.toLowerCase().includes(settings.searchTerm))}
sortData(processedData);filteredAndSortedData=processedData.slice(0,settings.showCount);renderTable(settings.activeColumns)}
function getControlSettings(){const weights={};const activeColumns=new Set(["pos","team","GP","numMinutes"]);document.querySelectorAll(".category-item").forEach(item=>{const key=item.querySelector("input").dataset.key;const checkbox=item.querySelector("input");const select=item.querySelector("select");weights[key]=checkbox.checked?parseFloat(select.value):0;if(checkbox.checked){activeColumns.add(STAT_CONFIG[key].dataKey)}});return{weights,activeColumns,showCount:parseInt(elements.showCount.value,10)||9999,searchTerm:elements.searchPlayer.value.toLowerCase().trim()}}
function renderTable(activeColumns){renderTableHeader(activeColumns);renderTableBody(activeColumns)}
function renderTableHeader(activeColumns){const baseHeaders=[{key:"rank",name:"R#"},{key:"playerName",name:"PLAYER"},{key:"pos",name:"POS"},{key:"team",name:"TEAM"},{key:"GP",name:"GP"},{key:"numMinutes",name:"MPG"}];const statHeaders=Object.values(STAT_CONFIG).filter(config=>activeColumns.has(config.dataKey)).map(config=>({key:config.dataKey,name:config.name.replace(" (Neg)","").replace(" Impact","")}));const finalHeader={key:"weighted_z_score",name:"TOTAL"};const allHeaders=[...baseHeaders,...statHeaders,finalHeader];elements.tableHead.innerHTML=`<tr>${allHeaders.map(h=>`
        <th data-sort-key="${h.key}">${h.name}<span class="sort-indicator"></span></th>`).join("")}</tr>`;updateSortIndicators()}
function renderTableBody(activeColumns){let html="";filteredAndSortedData.forEach((player,index)=>{html+="<tr>";html+=`<td>${index+1}</td>`;html+=`<td>${player.playerName}</td>`;html+=`<td>${player.pos}</td>`;html+=`<td>${player.team}</td>`;html+=`<td>${player.GP}</td>`;html+=`<td>${player.numMinutes}</td>`;for(const config of Object.values(STAT_CONFIG)){if(activeColumns.has(config.dataKey)){const isTurnover=config.dataKey==="turnovers";html+=`<td class="cell-value color-cell ${getZScoreClass(player[config.zKey],isTurnover)}">${player[config.dataKey]}</td>`}}
html+=`<td><b>${player.weighted_z_score.toFixed(2)}</b></td>`;html+="</tr>"});elements.tableBody.innerHTML=html||'<tr><td colspan="20">No players match your criteria.</td></tr>'}
function handleSort(e){const key=e.target.closest("th")?.dataset.sortKey;if(!key)return;const isAsc=currentSort.column===key&¤tSort.direction==="desc";currentSort={column:key,direction:isAsc?"asc":"desc"};sortData(filteredAndSortedData);renderTable(getControlSettings().activeColumns)}
function sortData(data){const{column,direction}=currentSort;const mod=direction==="asc"?1:-1;data.sort((a,b)=>{let valA=a[column],valB=b[column];if(!isNaN(valA)&&!isNaN(valB)){valA=+valA;valB=+valB}
if(typeof valA==="string")return valA.localeCompare(valB)*mod;if(valA<valB)return-1*mod;if(valA>valB)return 1*mod;return 0})}
function getZScoreClass(z,invert=false){if(z===undefined||z===null)return"average";const val=invert?-z:z;if(val>=2)return"elite";if(val>=1.5)return"very-good";if(val>=.75)return"good";if(val<=-.75)return"not-good";if(val<=-.25)return"below-average";return"average"}
function updateSortIndicators(){elements.tableHead.querySelectorAll("th").forEach(th=>{const indicator=th.querySelector(".sort-indicator");if(indicator){indicator.textContent=th.dataset.sortKey===currentSort.column?currentSort.direction==="asc"?"▲":"▼":""}})}

// --- DAILY GAMES TAB LOGIC ---
function renderDailyGamesTab(){const container=elements.dailyGamesContainer;container.innerHTML="";if(!fullData.dailyGames||fullData.dailyGames.length===0){container.innerHTML="<div class='card'><p>No daily game predictions available at this time.</p></div>";return}
fullData.dailyGames.forEach(game=>{const gameCard=document.createElement("div");gameCard.className="game-card";let teamsHTML=game.predictions.map(team=>`
            <div class="team-prediction-container">
                <h3>${team.teamName}</h3>
                <div class="table-container">
                    <table class="daily-table">
                        <thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr></thead>
                        <tbody>
                            ${team.players.map(p=>`
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
            </div>`).join("");gameCard.innerHTML=`<div class="game-card-header">${game.teams}</div>${teamsHTML}`;container.appendChild(gameCard)})}
