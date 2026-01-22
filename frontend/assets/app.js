const API = "http://localhost:3000";

let currentDriverId = null;
let currentDriverName = null;

/* THEME TOGGLE */
function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcons(saved);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const newTheme = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", newTheme === "dark" ? "" : newTheme);
  localStorage.setItem("theme", newTheme === "dark" ? "" : newTheme);
  updateThemeIcons(newTheme === "dark" ? "" : newTheme);
}

function updateThemeIcons(theme) {
  const icon = theme === "light" ? "☀️" : "🌙";
  const btnApp = document.getElementById("btnThemeToggle");
  const btnAuth = document.getElementById("btnThemeToggleAuth");
  if (btnApp) btnApp.textContent = icon;
  if (btnAuth) btnAuth.textContent = icon;
}

// Initialize theme on page load
initTheme();

// Theme toggle event listeners
document.getElementById("btnThemeToggle")?.addEventListener("click", toggleTheme);
document.getElementById("btnThemeToggleAuth")?.addEventListener("click", toggleTheme);

let selectedLot = null;
let selectedSpot = null;

let lotsMap = null;
let lotMarkersLayer = null;
let findMap = null;
let findMarkerLayer = null;

const DEMO_LOTS = [
  { lot_id: 1, camera_id: 1, name:"Verdun Lot", address:"Verdun", lat:33.8908, lng:35.4804, opening_hours:"08:00 am - 23:59 pm", entry_fee:5, hourly_rate:3.5, total_spots:70 },
  { lot_id: 2, camera_id: 2, name:"Hamra Main Lot", address:"Hamra", lat:33.8959, lng:35.4828, opening_hours:"07:00 am - 20:59 pm", entry_fee:4, hourly_rate:3.5, total_spots:60 },
  { lot_id: 3, camera_id: 3, name:"Downtown Beirut Lot", address:"Downtown", lat:33.8966, lng:35.5018, opening_hours:"08:00 am - 17:00 pm", entry_fee:4, hourly_rate:3, total_spots:80 },
  { lot_id: 4, camera_id: 4, name:"Achrafieh Lot", address:"Achrafieh", lat:33.8896, lng:35.5244, opening_hours:"09:00 am - 1:00 am", entry_fee:3, hourly_rate:2, total_spots:55 }
];

// Unique grid shapes for each lot
const LOT_LAYOUTS = {
  // Lot 1: Verdun - L-shaped parking
  1: { 
    rows: 8, cols: 12, 
    shape: "L",
    blocked: (r,c) => (r >= 5 && c >= 6) || c === 5  // L-shape with aisle
  },
  // Lot 2: Hamra - U-shaped parking  
  2: { 
    rows: 7, cols: 14, 
    shape: "U",
    blocked: (r,c) => (r >= 2 && r <= 4 && c >= 4 && c <= 9) || c === 3 || c === 10 // U-shape with aisles
  },
  // Lot 3: Downtown - Wide rectangular with center island
  3: { 
    rows: 10, cols: 16, 
    shape: "rectangle",
    blocked: (r,c) => (r >= 3 && r <= 6 && c >= 6 && c <= 9) || c === 5 || c === 10 // Center island with aisles
  },
  // Lot 4: Achrafieh - T-shaped parking
  4: { 
    rows: 9, cols: 12, 
    shape: "T",
    blocked: (r,c) => (r >= 4 && (c <= 2 || c >= 9)) || c === 5 || c === 6 // T-shape with center aisle
  }
};

let lastLogsCache = [];
let lastLotsCache = [];
let spotData = [];
let savedCards = [];
let selectedCard = null;

const $ = (id)=>document.getElementById(id);

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2200);
}

function setMsg(id, text, ok=true){
  const el = $(id);
  el.className = "msg " + (ok ? "ok":"err");
  el.textContent = text;
}

function markInvalid(el, bad){
  if (!el) return;
  el.style.outline = bad ? "2px solid #ff4d4d" : "";
}

// Live input cleanup for Register fields
$("reg_name")?.addEventListener("input", () => {
  $("reg_name").value = $("reg_name").value.replace(/[^A-Za-z\s.'-]/g, "");
});

$("reg_phone")?.addEventListener("input", () => {
  $("reg_phone").value = $("reg_phone").value.replace(/\D/g, "");
});

// Live input cleanup for Card fields (no letters except nickname)
$("new_card_number")?.addEventListener("input", () => {
  $("new_card_number").value = $("new_card_number").value.replace(/[^0-9\s]/g, "");
});

$("new_card_exp")?.addEventListener("input", () => {
  $("new_card_exp").value = $("new_card_exp").value.replace(/[^0-9/]/g, "");
});

$("new_card_cvv")?.addEventListener("input", () => {
  $("new_card_cvv").value = $("new_card_cvv").value.replace(/\D/g, "");
});

$("pay_cc")?.addEventListener("input", () => {
  $("pay_cc").value = $("pay_cc").value.replace(/[^0-9\s]/g, "");
});

$("pay_exp")?.addEventListener("input", () => {
  $("pay_exp").value = $("pay_exp").value.replace(/[^0-9/]/g, "");
});

$("pay_cvv")?.addEventListener("input", () => {
  $("pay_cvv").value = $("pay_cvv").value.replace(/\D/g, "");
});


function isLettersName(str){
  // letters + spaces + common name punctuation
  return /^[A-Za-z\s.'-]+$/.test(str);
}

function isValidEmail(str){
  // practical email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}


function showAuth(mode){
  $("tabLogin").classList.toggle("active", mode==="login");
  $("tabReg").classList.toggle("active", mode==="register");
  $("loginBox").classList.toggle("hidden", mode!=="login");
  $("regBox").classList.toggle("hidden", mode!=="register");
}

function showApp(){
  $("authView").style.display = "none";
  $("appView").style.display = "block";
}
function showLogin(){
  $("appView").style.display = "none";
  $("authView").style.display = "grid";
  showAuth("login");
}

function setActiveNav(panel){
  document.querySelectorAll(".navbtn").forEach(b=>{
    b.classList.toggle("active", b.getAttribute("data-panel") === panel);
  });

  ["vehicles","lots","spots","logs","pay","find","about"].forEach(k=>{
    $("panel_"+k).classList.toggle("hidden", k!==panel);
  });

  setTimeout(()=>{
    try{ if (lotsMap && panel==="lots") lotsMap.invalidateSize(); }catch(e){}
    try{ if (findMap && panel==="find") findMap.invalidateSize(); }catch(e){}
  }, 150);
}

/* Leaflet */
function makeMap(containerId, center=[33.8938,35.5018], zoom=13){
  const m = L.map(containerId, { zoomControl:true }).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(m);
  return m;
}
function iconDot(color){
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};
      border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 18px rgba(0,0,0,0.35);"></div>`,
    iconSize:[16,16],
    iconAnchor:[8,8]
  });
}

/* API helpers */
async function apiGet(path){
  const r = await fetch(API + path);
  return await r.json();
}
async function apiPost(path, body){
  const r = await fetch(API + path, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  return await r.json();
}

/* AUTH */
$("tabLogin").onclick = ()=>showAuth("login");
$("tabReg").onclick = ()=>showAuth("register");

$("btnDemo").onclick = ()=>{
  $("login_email").value = "reina.nizam@test.com";
  $("login_pass").value = "1234";
};

$("btnRegister").onclick = async ()=>{
  const nameEl = $("reg_name");
  const phoneEl = $("reg_phone");
  const emailEl = $("reg_email");
  const passEl = $("reg_pass");

  const full_name = (nameEl.value || "").trim();
  const phone_number = (phoneEl.value || "").trim();
  const email = (emailEl.value || "").trim();
  const password = (passEl.value || "").trim();

  // reset outlines
  markInvalid(nameEl, false);
  markInvalid(phoneEl, false);
  markInvalid(emailEl, false);
  markInvalid(passEl, false);

  // Full name validation
  if (!full_name || !isLettersName(full_name)) {
    markInvalid(nameEl, true);
    return setMsg("reg_msg", "Full name must contain letters only (spaces allowed).", false);
  }

  // Phone validation (digits only, length check)
  if (!/^\d{6,15}$/.test(phone_number)) {
    markInvalid(phoneEl, true);
    return setMsg("reg_msg", "Phone must be digits only (6–15 numbers).", false);
  }

  // Email validation
  if (!isValidEmail(email)) {
    markInvalid(emailEl, true);
    return setMsg("reg_msg", "Please enter a valid email (example: name@email.com).", false);
  }

  // Password basic check
  if (password.length < 4) {
    markInvalid(passEl, true);
    return setMsg("reg_msg", "Password must be at least 4 characters.", false);
  }

  const body = { full_name, email, phone_number, password };

  setMsg("reg_msg", "Creating account...", true);
  const data = await apiPost("/auth/register", body);
  if (data.error) return setMsg("reg_msg", data.error, false);

  setMsg("reg_msg", data.message || "Account created", true);
  toast("Account created");
  setTimeout(()=>showAuth("login"), 700);
};


$("btnLogin").onclick = async ()=>{
  const body = { email: $("login_email").value.trim(), password: $("login_pass").value };
  setMsg("login_msg", "Logging in...", true);

  const data = await apiPost("/auth/login", body);
  if (data.error) return setMsg("login_msg", data.error, false);

  currentDriverId = data.driver_id;
  currentDriverName = data.full_name || "Driver";

  $("driverPill").textContent = "👤 " + currentDriverName;
  $("lotPill").textContent = "🅿️ No lot";
  $("spotPill").textContent = "📍 No spot";

  showApp();

  initMaps();
  await loadVehicles();
  await loadLots();
  await loadLogs();
  await loadSavedCards();

  setActiveNav("vehicles");
};

$("btnLogout").onclick = ()=>{
  currentDriverId = null;
  currentDriverName = null;
  selectedLot = null;
  selectedSpot = null;
  spotData = [];
  lastLogsCache = [];
  lastLotsCache = [];
  savedCards = [];
  selectedCard = null;
  showLogin();
  toast("Logged out");
};

/* Sidebar nav */
document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.onclick = async ()=>{
    const panel = btn.getAttribute("data-panel");
    if (panel==="logs") await loadLogs();
    if (panel==="pay") { await refreshDue(); await loadSavedCards(); }
    if (panel==="lots") await loadLots();
    setActiveNav(panel);
  };
});

/* VEHICLES */
$("btnRefreshVehicles").onclick = loadVehicles;

$("btnAddVehicle").onclick = async ()=>{
  const plate = $("veh_plate").value.trim();
  if (!plate) return setMsg("veh_msg", "Plate is required", false);

  let vehicleType = $("veh_type").value.trim();
vehicleType = vehicleType ? vehicleType.replace(/\s+/g, " ") : null;

const body = {
  driver_id: currentDriverId,
  plate_no: plate,
  model: $("veh_model").value.trim() || null,
  vehicle_type: vehicleType,
  year: parseInt($("veh_year").value, 10) || null
};

  const data = await apiPost("/vehicle/add", body);
  if (data.error) return setMsg("veh_msg", data.error, false);

  setMsg("veh_msg", data.message || "Vehicle added", true);
  $("veh_plate").value=""; $("veh_model").value=""; $("veh_type").value=""; $("veh_year").value="";
  await loadVehicles();
};


$("btnGoLots").onclick = ()=> setActiveNav("lots");

async function loadVehicles(){
  const rows = await apiGet("/vehicle/" + currentDriverId);
  const tb = $("veh_tbody");
  tb.innerHTML = "";

  if (!Array.isArray(rows) || rows.length===0){
    tb.innerHTML = `<tr><td colspan="5" style="color:var(--muted)">No vehicles yet</td></tr>`;
  } 
  else {
  rows.forEach(v => {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${escapeHtml(v.plate_no)}</td>
    <td>${escapeHtml(v.model || "")}</td>
    <td>${escapeHtml(v.vehicle_type || "")}</td>
    <td>${escapeHtml(v.year || "")}</td>
    <td style="text-align:right;">
      <button class="btn" style="background:#ff3b30;" onclick="deleteVehicle('${String(v.plate_no).replace(/'/g,"\\'")}')">Remove</button>
    </td>
  `;
  tb.appendChild(tr);
});

}

window.deleteVehicle = async function (plateNo) {
  if (!confirm(`Remove vehicle ${plateNo}?`)) return;

  try {
    const url = `${API}/vehicles/${encodeURIComponent(plateNo)}?driver_id=${encodeURIComponent(currentDriverId)}`;

    const res = await fetch(url, { method: "DELETE" });

    // If backend returns HTML by mistake, this prevents JSON crash
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("Backend did not return JSON. You probably hit the wrong server/port."); }

    if (data.error) toast(data.error, true);
    else {
      toast("Vehicle removed");
      loadVehicles(); // refresh table
    }
  } catch (e) {
    toast("Remove failed: " + (e.message || e), true);
  }
};



  const sel = $("vehicleSelect");
  sel.innerHTML = "";
  if (Array.isArray(rows) && rows.length){
    rows.forEach(v=>{
      const o=document.createElement("option");
      o.value=v.plate_no;
      o.textContent=v.plate_no + (v.model ? " • " + v.model : "");
      sel.appendChild(o);
    });
  } else {
    sel.innerHTML = `<option value="">Add vehicle first</option>`;
  }
}

/* LOTS + MAP */
function initMaps(){
  if (!lotsMap) lotsMap = makeMap("lotsMap");
  if (!findMap) findMap = makeMap("findMap");
}

async function loadLots(){
  let lots = [];
  try{
    const data = await apiGet("/lots/nearby?city=beirut");
    if (Array.isArray(data) && data.length) lots = data;
  }catch(e){}
  if (!lots.length) lots = DEMO_LOTS;

  lots = lots.map((l,i)=>{
    const seed = (l.lot_id*73 + i*19) % 100;
    const full = (i===1) || seed < 18;
    const available = full ? 0 : Math.max(3, Math.floor((seed/100) * (l.total_spots||60)));
    return { ...l, available_count: available };
  });

  lastLotsCache = lots;
  renderLots(lots);
  drawLotDots(lots);
}

function badgeForLot(lot){
  const avail = lot.available_count ?? 0;
  const total = lot.total_spots ?? lot.spot_count ?? 0;
  if (avail <= 0) return { cls:"bad", text:"FULL" };
  const ratio = total ? (avail/total) : 1;
  if (ratio < 0.15) return { cls:"warn", text:"LOW" };
  return { cls:"ok", text:"AVAILABLE" };
}

function renderLots(lots){
  const list = $("lotsList");
  list.innerHTML = "";
  lots.forEach(lot=>{
    const b = badgeForLot(lot);
    const div=document.createElement("div");
    div.className="lot" + (selectedLot?.lot_id===lot.lot_id ? " selected":"");
    div.onclick=()=>selectLot(lot);
    div.innerHTML=`
      <div class="lotTop">
        <div>
          <div class="lotName">${escapeHtml(lot.name || lot.lot_name)}</div>
          <div class="sub">${escapeHtml(lot.address || lot.location || "")}</div>
        </div>
        <span class="badge ${b.cls}">${b.text}</span>
      </div>
      <div class="meta">
        <div>Entry <span>$${Number(lot.entry_fee||3).toFixed(2)}</span></div>
        <div>Hourly <span>$${Number(lot.hourly_rate||2).toFixed(2)}</span></div>
        <div>Hours <span>${escapeHtml(lot.opening_hours||"")}</span></div>
        <div>Spots <span>${lot.available_count} of ${lot.total_spots||lot.spot_count||"?"}</span></div>
      </div>
    `;
    list.appendChild(div);
  });
}

function drawLotDots(lots){
  lotMarkersLayer?.clearLayers();
  lotMarkersLayer = L.layerGroup().addTo(lotsMap);

  lots.forEach(lot=>{
    const available = (lot.available_count ?? 0) > 0;
    const color = available ? "rgba(16,185,129,1)" : "rgba(239,68,68,1)";
    const marker = L.marker([Number(lot.lat), Number(lot.lng)], { icon: iconDot(color) })
      .addTo(lotMarkersLayer)
      .bindPopup(`<b>${escapeHtml(lot.name||lot.lot_name)}</b>`);
    marker.on("click", ()=>selectLot(lot));
  });
}

async function selectLot(lot){
  selectedLot = lot;
  selectedSpot = null;

  $("lotPill").textContent = "🅿️ " + (lot.name||lot.lot_name);
  $("spotPill").textContent = "📍 Select spot";

  renderLots(lastLotsCache);

  // 1) Generate dummy spots (keep your current behavior)
  spotData = makeSpotsForLot(lot.lot_id);

  // 2) OVERRIDE: paint DB ACTIVE spots as reserved (yellow) so they persist after reboot
  try {
    const activeSpots = await apiGet(`/session/active_spots?lot_id=${lot.lot_id}`);
    if (Array.isArray(activeSpots) && activeSpots.length) {
      const set = new Set(activeSpots);
      spotData.forEach(s => {
        if (set.has(s.label)) s.status = "reserved"; // yellow + unclickable
      });
    }
  } catch (e) {
    console.warn("Could not load active spots:", e);
  }

  // Check for unpaid fees and show warning banner
  const hasUnpaid = await checkHasUnpaid();
  
  // Update spot info display (must be AFTER overriding statuses)
  const counts = countSpotsByStatus(spotData);
  const layout = LOT_LAYOUTS[lot.lot_id] || LOT_LAYOUTS[1];
  
  let unpaidWarning = "";
  if (hasUnpaid) {
    unpaidWarning = `
      <div style="background: linear-gradient(135deg, #ff4d4d, #ff6b6b); color: white; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; font-weight: 500; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">⚠️</span>
        <span>You have unpaid parking fees! Please <a href="#" onclick="setActiveNav('pay'); return false;" style="color: #fff; text-decoration: underline; font-weight: bold;">pay now</a> before reserving a new spot.</span>
      </div>
    `;
  }
  
  $("spotLotInfo").innerHTML = `
    ${unpaidWarning}
    <b>${escapeHtml(lot.name || lot.lot_name)}</b> — ${layout.shape || 'standard'} layout
    <br/>
    <span style="color:var(--ok);">${counts.available} spots available</span> • 
    <span style="color:var(--warn);">${counts.reserved} reserved</span> • 
    <span style="color:var(--bad);">${counts.occupied} occupied</span> • 
    ${counts.total} total
  `;

  renderSpotGrid();

  setActiveNav("spots");
  toast("Lot selected");
}


$("btnBackToLots").onclick = ()=>setActiveNav("lots");

// Check if driver has unpaid fees
async function checkHasUnpaid() {
  try {
    const data = await apiGet(`/session/has_unpaid?driver_id=${currentDriverId}`);
    return data.has_unpaid === true;
  } catch (e) {
    return false;
  }
}

$("btnStartSession").onclick = async ()=>{
  if (!selectedLot) return toast("Select a lot first.");
  if (!selectedSpot) return toast("Select an available spot.");
  const plate = $("vehicleSelect").value;
  if (!plate) return toast("Pick a vehicle.");

  // Check for unpaid fees before allowing reservation
  const hasUnpaid = await checkHasUnpaid();
  if (hasUnpaid) {
    setMsg("spots_msg", "⚠️ Cannot reserve: you have unpaid parking fees. Please pay first!", false);
    toast("Pay unpaid fees first!");
    return;
  }

  const payload = {
    driver_id: currentDriverId,
    plate_no: plate,
    lot_id: selectedLot.lot_id,
    spot_id: selectedSpot.spot_id,
    spot_label: selectedSpot.label
  };

  const data = await apiPost("/session/start", payload);
  if (data.error) return setMsg("spots_msg", data.error, false);

  setMsg("spots_msg", data.message || "Session started", true);
  toast("Session started");
};

/* SPOTS GRID */
function makeSpotsForLot(lotId){
  const layout = LOT_LAYOUTS[lotId] || LOT_LAYOUTS[1];
  const {rows, cols, blocked: isBlocked} = layout;

  const spots=[];
  let num=1;

  // If the selected lot is FULL (available_count <= 0), force all spots to be occupied
  const lotObj = (selectedLot && selectedLot.lot_id == lotId) ? selectedLot : null;
  const forceFull = lotObj && (Number(lotObj.available_count ?? 0) <= 0);


  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      // Check if this cell is blocked (aisle or shape cutout)
      if (isBlocked && isBlocked(r, c)){
        spots.push({ spot_id:`B${r}${c}`, label:"", status:"blocked", r, c });
        continue;
      }

      // Simulate spot status with deterministic seed
      const seed=(lotId*97 + r*31 + c*17) % 100;

      let status = "available";

  if (forceFull) {
     // FULL lot → no available spots
     status = (seed % 2 === 0) ? "occupied" : "reserved";
    }   
  else {
    if (seed < 15) status = "occupied";
    else if (seed < 22) status = "reserved";
     }


      const label=`P${String(num).padStart(3,"0")}`;
      spots.push({ spot_id:String(num), label, status, r, c });
      num++;
    }
  }
  return spots;
}

function countSpotsByStatus(spots){
  const counts = { available: 0, occupied: 0, reserved: 0, total: 0 };
  spots.forEach(s => {
    if (s.status === "available") counts.available++;
    else if (s.status === "occupied") counts.occupied++;
    else if (s.status === "reserved") counts.reserved++;
    if (s.status !== "blocked") counts.total++;
  });
  return counts;
}

function renderSpotGrid(){
  const lotId = selectedLot?.lot_id;
  if (!lotId){
    $("spotGrid").innerHTML = `<div class="sub">Select a lot first</div>`;
    return;
  }

  const layout = LOT_LAYOUTS[lotId] || LOT_LAYOUTS[1];
  const grid = $("spotGrid");
  grid.style.gridTemplateColumns = `repeat(${layout.cols}, minmax(38px, 1fr))`;
  grid.innerHTML="";

  spotData.forEach(s=>{
    const d=document.createElement("div");
    d.className = `spot ${s.status}` + ((selectedSpot && selectedSpot.spot_id===s.spot_id) ? " selected":"");
    d.textContent = s.label;

    if (s.status === "available"){
      d.onclick=()=>{
        selectedSpot=s;
        $("spotPill").textContent = "📍 " + s.label;
        renderSpotGrid();
      };
    }
    grid.appendChild(d);
  });
}

const btnExit = $("btnExit");
if (btnExit) {
  btnExit.onclick = async () => {
    const plateEl = $("exitPlate");
    const plate = (plateEl ? plateEl.value : "").trim();
    if (!plate) return toast("Plate required");

    const data = await apiPost("/session/end", { plate_no: plate });
    if (data.error) return toast(data.error);

    toast(`Exit done. Fee = $${Number(data.fee||0).toFixed(2)} (UNPAID)`);

    const msgEl = $("exit_msg");
    if (msgEl) msgEl.textContent = "";
    if (plateEl) plateEl.value = "";

    await loadLogs();
    try { await refreshDue(); } catch(e){}
  };
}


/* LOGS */
$("btnLoadLogs").onclick = loadLogs;

async function loadLogs(){
  const data = await apiGet("/logs/driver/" + currentDriverId);
  const logs = Array.isArray(data) ? data : [];
  lastLogsCache = logs;

  const tb = $("logs_tbody");
  tb.innerHTML="";

  if (!logs.length){
    tb.innerHTML = `<tr><td colspan="9" style="color:var(--muted)">No logs</td></tr>`;
    return setMsg("logs_msg", "No logs", true);
  }

  logs.forEach(l=>{
    const status = l.status || "ACTIVE";
    const fee = l.fee != null ? `$${Number(l.fee).toFixed(2)}` : "—";

    let badge = `<span class="badge warn">ACTIVE</span>`;
    let action = `<button class="btn" style="padding:8px 10px; background:#ff3b3b;" onclick="exitLogPrompt('${escapeHtml(l.plate_no||"")}')">Exit</button>`;

    if (status === "PAID"){
    badge = `<span class="badge ok">PAID</span>`;
    action = `<span style="color:var(--muted)">Done</span>`;
    }
    else if (status === "UNPAID"){
    badge = `<span class="badge bad">UNPAID</span>`;
    action = `<button class="btn" style="padding:8px 10px" onclick="prefillPay(${l.log_id})">Pay</button>`;
    }

    if (status === "PAID"){
      badge = `<span class="badge ok">PAID</span>`;
      action = `<span style="color:var(--muted)">Done</span>`;
    } else if (status === "UNPAID"){
      badge = `<span class="badge bad">UNPAID</span>`;
      action = `<button class="btn" style="padding:8px 10px" onclick="prefillPay(${l.log_id})">Pay</button>`;
    }

    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(l.log_id)}</b></td>
      <td>${escapeHtml(l.plate_no||"")}</td>
      <td>${escapeHtml(l.lot_name||"")}</td>
      <td>${escapeHtml(l.spot_label||"")}</td>
      <td style="font-size:12px">${escapeHtml(l.entry_time||"")}</td>
      <td style="font-size:12px">${escapeHtml(l.exit_time||"—")}</td>
      <td><b>${fee}</b></td>
      <td>${badge}</td>
      <td>${action}</td>
    `;
    tb.appendChild(tr);
  });

  setMsg("logs_msg", "Loaded", true);
}

window.prefillPay = (logId)=>{
  $("pay_log_id").value = logId;
  setActiveNav("pay");
};

window.exitLogPrompt = async (plateFromRow)=>{
  // Ask user to confirm plate number (security feature)
  const typed = prompt(`To exit, type the plate number to confirm:\n\nex: 123ABC`);
  if (typed == null) return; // user cancelled

  const cleanTyped = typed.trim().toUpperCase();
  const cleanRow = String(plateFromRow || "").trim().toUpperCase();

  if (!cleanTyped) return toast("Plate required");
  if (cleanTyped !== cleanRow) return toast("Plate does not match. Exit cancelled.");

  const data = await apiPost("/session/end", { plate_no: cleanTyped });
  if (data.error) return toast(data.error);

  toast(`Exit done. Fee = $${Number(data.fee||0).toFixed(2)} (UNPAID)`);

  // Refresh history + due list so UI updates immediately
  await loadLogs();
  try { await refreshDue(); } catch(e){}
  setActiveNav("logs");
};


/* PAYMENT */
$("btnRefreshDue").onclick = refreshDue;

async function refreshDue(){
  const due = await apiGet("/payments/due/" + currentDriverId);
  const list = Array.isArray(due) ? due : [];
  if (!list.length){
    $("due_list").textContent = "No unpaid logs ✅";
    return;
  }
  $("due_list").innerHTML = "Unpaid logs: " + list.map(x=>`#${x.log_id} ($${Number(x.fee).toFixed(2)})`).join(" • ");
}

/* CREDIT CARD MANAGEMENT */
const CARD_COLORS = {
  VISA: "linear-gradient(135deg, #1a4b8c 0%, #2d6bc4 50%, #1e5aab 100%)",
  MASTERCARD: "linear-gradient(135deg, #cc0000 0%, #ff6600 100%)",
  AMEX: "linear-gradient(135deg, #006fcf 0%, #00adef 100%)"
};

async function loadSavedCards(){
  try {
    const cards = await apiGet("/cards/" + currentDriverId);
    savedCards = Array.isArray(cards) ? cards : [];
    renderSavedCards();
    // Auto-select default card
    const defaultCard = savedCards.find(c => c.is_default);
    if (defaultCard) selectCard(defaultCard);
  } catch(e) {
    savedCards = [];
    renderSavedCards();
  }
}

function renderSavedCards(){
  const container = $("savedCardsList");
  container.innerHTML = "";
  
  if (!savedCards.length){
    container.innerHTML = `<div class="sub">No saved cards. Add one below!</div>`;
    return;
  }
  
  savedCards.forEach(card => {
    const isSelected = selectedCard && selectedCard.card_id === card.card_id;
    const cardEl = document.createElement("div");
    cardEl.className = "mini-card" + (isSelected ? " selected" : "");
    cardEl.style.cssText = `
      width: 140px;
      height: 85px;
      background: ${CARD_COLORS[card.card_type] || CARD_COLORS.VISA};
      border-radius: 10px;
      padding: 10px;
      cursor: pointer;
      color: white;
      font-size: 11px;
      position: relative;
      transition: transform 0.2s, box-shadow 0.2s;
      ${isSelected ? 'box-shadow: 0 0 0 3px var(--accent); transform: scale(1.05);' : ''}
    `;
    
    const last4 = card.card_number.replace(/\s/g, "").slice(-4);
    cardEl.innerHTML = `
      <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(card.card_nickname || card.card_type)}</div>
      <div style="font-family:monospace; letter-spacing:1px;">•••• ${last4}</div>
      <div style="margin-top:8px; font-size:10px; opacity:0.8;">${card.card_expiry}</div>
      <div style="position:absolute; bottom:8px; right:10px; font-weight:bold; font-style:italic;">${card.card_type}</div>
      ${card.is_default ? '<div style="position:absolute; top:6px; right:8px; font-size:9px; background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px;">DEFAULT</div>' : ''}
      <button onclick="event.stopPropagation(); deleteCard(${card.card_id})" style="position:absolute; top:6px; left:8px; background:rgba(255,0,0,0.6); border:none; color:white; width:18px; height:18px; border-radius:50%; cursor:pointer; font-size:10px; display:none;" class="delete-btn">✕</button>
    `;
    
    cardEl.onmouseenter = () => cardEl.querySelector('.delete-btn').style.display = 'block';
    cardEl.onmouseleave = () => cardEl.querySelector('.delete-btn').style.display = 'none';
    cardEl.onclick = () => selectCard(card);
    
    container.appendChild(cardEl);
  });
}

function selectCard(card){
  selectedCard = card;
  $("pay_cc").value = card.card_number;
  $("pay_exp").value = card.card_expiry;
  $("pay_cvv").value = card.card_cvv;
  updateCardVisual(card);
  renderSavedCards(); // Re-render to show selection
  toast(`Selected: ${card.card_nickname || card.card_type}`);
}

function updateCardVisual(card = null){
  const ccRaw = $("pay_cc").value || "";
  const exp = $("pay_exp").value || "••/••";
  const cvv = $("pay_cvv").value || "•••";
  const type = card?.card_type || selectedCard?.card_type || "VISA";
  const name = card?.card_nickname || (selectedCard?.card_nickname) || "Demo Visa";
  
  // Show masked card number like mini-card (•••• •••• •••• 9010)
  let displayNumber = "•••• •••• •••• ••••";
  if (ccRaw) {
    const last4 = ccRaw.replace(/\s/g, "").slice(-4);
    displayNumber = `•••• •••• •••• ${last4}`;
  }
  
  $("cardDisplayNumber").textContent = displayNumber;
  $("cardDisplayExp").textContent = exp;
  $("cardDisplayCvv").textContent = cvv;
  $("cardDisplayType").textContent = type;
  $("cardDisplayName").textContent = name;
  
  // Update card background color
  $("cardVisual").style.background = CARD_COLORS[type] || CARD_COLORS.VISA;
}

window.deleteCard = async (cardId) => {
  if (!confirm("Delete this card?")) return;
  
  const data = await fetch(`${API}/cards/${cardId}?driver_id=${currentDriverId}`, { method: "DELETE" }).then(r => r.json());
  if (data.error) return toast(data.error);
  
  toast("Card deleted");
  if (selectedCard && selectedCard.card_id === cardId) {
    selectedCard = null;
    $("pay_cc").value = "";
    $("pay_exp").value = "";
    $("pay_cvv").value = "";
    updateCardVisual();
  }
  await loadSavedCards();
};

// Toggle add card form
$("btnToggleAddCard").onclick = () => {
  $("addCardForm").classList.toggle("hidden");
};

$("btnCancelAddCard").onclick = () => {
  $("addCardForm").classList.add("hidden");
  // Clear form
  $("new_card_name").value = "";
  $("new_card_number").value = "";
  $("new_card_exp").value = "";
  $("new_card_cvv").value = "";
};

$("btnSaveCard").onclick = async () => {
  const card_number = $("new_card_number").value.trim();
  const card_expiry = $("new_card_exp").value.trim();
  const card_cvv = $("new_card_cvv").value.trim();
  
  if (!card_number || !card_expiry || !card_cvv) {
    return toast("Card number, expiry, and CVV are required");
  }
  
  const body = {
    driver_id: currentDriverId,
    card_nickname: $("new_card_name").value.trim() || null,
    card_number,
    card_expiry,
    card_cvv,
    card_type: $("new_card_type").value,
    is_default: savedCards.length === 0 // First card is default
  };
  
  const data = await apiPost("/cards/add", body);
  if (data.error) return toast(data.error);
  
  toast("Card saved!");
  $("addCardForm").classList.add("hidden");
  $("new_card_name").value = "";
  $("new_card_number").value = "";
  $("new_card_exp").value = "";
  $("new_card_cvv").value = "";
  
  await loadSavedCards();
};

// Update card visual when typing in form
$("pay_cc").oninput = () => updateCardVisual();
$("pay_exp").oninput = () => updateCardVisual();
$("pay_cvv").oninput = () => updateCardVisual();

// Make the big visual card clickable - fills form with its info
$("cardVisual").onclick = () => {
  if (selectedCard) {
    selectCard(selectedCard);
  } else {
    toast("Select a saved card first");
  }
};

$("btnPayOne").onclick = async ()=>{
  const logId = parseInt($("pay_log_id").value,10);
  if (!Number.isFinite(logId)) return setMsg("pay_msg", "Enter a valid log id", false);
  
  const cc = $("pay_cc").value.trim();
  const exp = $("pay_exp").value.trim();
  const cvv = $("pay_cvv").value.trim();
  
  if (!cc || !exp || !cvv) return setMsg("pay_msg", "Please select or enter card details", false);

  const body = {
    driver_id: currentDriverId,
    log_id: logId,
    credit_card_no: cc.replace(/\s/g,""),
    ccv_cvc: cvv,
    cc_expiry: exp
  };
  const data = await apiPost("/payment/pay", body);
  if (data.error) return setMsg("pay_msg", data.error, false);

  setMsg("pay_msg", data.message || "Payment processed", true);
  toast("Payment processed");

  await loadLogs();
  await refreshDue();
  setActiveNav("logs");
};

$("btnPayAll").onclick = async ()=>{
  const cc = $("pay_cc").value.trim();
  const exp = $("pay_exp").value.trim();
  const cvv = $("pay_cvv").value.trim();
  
  if (!cc || !exp || !cvv) return setMsg("pay_msg", "Please select or enter card details", false);

  const body = {
    driver_id: currentDriverId,
    credit_card_no: cc.replace(/\s/g,""),
    ccv_cvc: cvv,
    cc_expiry: exp
  };
  const data = await apiPost("/payment/pay_all", body);
  if (data.error) return setMsg("pay_msg", data.error, false);

  setMsg("pay_msg", data.message || "All due paid", true);
  toast("All due paid");

  await loadLogs();
  await refreshDue();
  setActiveNav("logs");
};

/* FIND MY CAR */
$("btnFind").onclick = async ()=>{
  const plate = $("findPlate").value.trim();
  if (!plate) return setMsg("find_msg", "Plate required", false);

  const data = await apiGet(`/session/active?driver_id=${currentDriverId}&plate_no=${encodeURIComponent(plate)}`);
  if (data.error) return setMsg("find_msg", data.error, false);

  const lot = lastLotsCache.find(l=>l.lot_id===data.lot_id) || DEMO_LOTS.find(l=>l.lot_id===data.lot_id);
  if (!lot) return setMsg("find_msg", "Active session found, but lot missing", false);

  setMsg("find_msg", `Found in ${lot.name||lot.lot_name}`, true);

  findMarkerLayer?.clearLayers();
  findMarkerLayer = L.layerGroup().addTo(findMap);

  const pos = [Number(lot.lat), Number(lot.lng)];
  L.marker(pos, { icon: iconDot("rgba(255,59,48,1)") })
    .addTo(findMarkerLayer)
    .bindPopup(`<b>${escapeHtml(lot.name||lot.lot_name)}</b>`)
    .openPopup();

  findMap.setView(pos, 16);
};
