import { COLS, ROWS, key, parseKey, neighbors } from "./data/grid.js";
import { uniformCostSearch } from "./algorithms/ucs.js";
import { aStar } from "./algorithms/astar.js";
import { chooseEnemyAction } from "./algorithms/alphaBeta.js";
import { PayloadTruck } from "./entities/truck.js";
import { IceDrone } from "./entities/drone.js";
import { Firewall } from "./entities/firewall.js";
import { createInitialState } from "./data/gameState.js";
import { getDifficulty } from "./data/gameState.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  start: document.getElementById("startBtn"),
  pause: document.getElementById("pauseBtn"),
  step: document.getElementById("stepBtn"),
  reset: document.getElementById("resetBtn"),
  level: document.getElementById("levelValue"),
  origin: document.getElementById("originValue"),
  destination: document.getElementById("destinationValue"),
  health: document.getElementById("healthValue"),
  healthBar: document.getElementById("healthBar"),
  healthRing: document.querySelector("#healthRing span"),
  cycle: document.getElementById("cycleValue"),
  cost: document.getElementById("costValue"),
  nodes: document.getElementById("nodesValue"),
  algorithm: document.getElementById("algorithmValue"),
  enemyAction: document.getElementById("enemyAction"),
  score: document.getElementById("scoreValue"),
  depth: document.getElementById("depthValue"),
  log: document.getElementById("eventLog"),
  connection: document.getElementById("connectionStatus"),
  objectiveRoute: document.getElementById("objectiveRoute"),
  objectiveThreat: document.getElementById("objectiveThreat"),
  objectiveUpload: document.getElementById("objectiveUpload")
};

let state = createInitialState();
let truck = new PayloadTruck(state.start);
let drones = [];
let firewalls = [];
let animation = 0;

const padding = 48;
const gridWidth = canvas.width - padding * 2;
const gridHeight = canvas.height - padding * 2;
const cellW = gridWidth / (COLS - 1);
const cellH = gridHeight / (ROWS - 1);

function calculateInitialRoute() {
  const result = uniformCostSearch(state.start, state.goal, state.blocked);
  state.algorithm = "UCS";
  state.route = result.path;
  state.routeCost = Number.isFinite(result.cost) ? result.cost : 0;
  state.explored = result.explored;
}

function calculateDynamicRoute() {
  const result = aStar(truck.position, state.goal, state.blocked);
  state.algorithm = "A*";
  state.route = result.path;
  state.routeCost = Number.isFinite(result.cost) ? result.cost : 0;
  state.explored = result.explored;
}

function nodePixel(id) {
  const { x, y } = parseKey(id);
  return { x: padding + x * cellW, y: padding + y * cellH };
}

function log(message, type = "normal") {
  const prefix = type === "danger" ? "⚠" : type === "success" ? "✓" : ">";
  state.eventLog.unshift(`${prefix} ${message}`);
  state.eventLog = state.eventLog.slice(0, 18);
  ui.log.innerHTML = state.eventLog.map(item => `<p>${escapeHtml(item)}</p>`).join("");
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function resetGame(level = 1) {
  state = createInitialState(level);
  truck = new PayloadTruck(state.start);
  drones = [];
  firewalls = [];
  calculateInitialRoute();
  state.difficulty = getDifficulty(state.level);
  state.running = false;
  ui.start.disabled = false;
  ui.pause.disabled = true;
  ui.step.disabled = true;
  ui.start.textContent = `▶ START LEVEL ${state.level}`;
  ui.connection.textContent = "● PLAYER READY";
  ui.connection.style.color = "#39ff88";
  log(`Level ${state.level}: Origin ${state.start} → Upload ${state.goal}.`, "success");
  log(`Difficulty: ${state.difficulty.label} | Enemy response every ${state.difficulty.enemyInterval} move${state.difficulty.enemyInterval === 1 ? "" : "s"}.`, "success");
  log(`UCS selected the initial route with total cost ${state.routeCost}.`, "success");
  log("Your turn: click an adjacent node or use WASD / arrow keys to move.");
  updateUI();
}

function startGame() {
  if (state.won) {
    resetGame(state.level + 1);
  } else if (state.lost) {
    resetGame(state.level);
  }

  state.running = true;
  ui.start.disabled = true;
  ui.pause.disabled = false;
  ui.step.disabled = false;
  ui.start.textContent = "▶ MISSION RUNNING";
  ui.connection.textContent = "● YOUR TURN";
  ui.connection.style.color = "#39ff88";
  log(`Level ${state.level} started. Choose your next node.`, "success");
  updateUI();
}

function pauseGame() {
  state.running = false;
  ui.start.disabled = false;
  ui.pause.disabled = true;
  ui.step.disabled = false;
  ui.start.textContent = `▶ RESUME LEVEL ${state.level}`;
  ui.connection.textContent = "● PAUSED";
  ui.connection.style.color = "#ffe45c";
  log("Mission paused. Press START to continue.");
  updateUI();
}

function stepGame() {
  if (state.won || state.lost || !state.running) return;
  // STEP is intentionally a single enemy/player cycle trigger through normal movement;
  // it remains available as a visual control without changing the game's rules.
  log("STEP mode: choose an adjacent node to advance one cycle.");
}

function isAdjacent(a, b) {
  return neighbors(a).some(n => n.id === b);
}

function playerMove(target) {
  if (!state.running || state.won || state.lost) return;
  if (!isAdjacent(truck.position, target)) {
    log("Invalid move. You can only move to an adjacent node.", "danger");
    return;
  }
  if (state.blocked.has(target)) {
    log(`Node ${target} is blocked by a firewall. Choose another node.`, "danger");
    return;
  }

  const moveInfo = neighbors(truck.position).find(n => n.id === target);
  truck.moveTo(target);
  state.cycle++;
  state.algorithm = "PLAYER";
  log(`Payload moved to ${target}. Network cost for this link: ${moveInfo.cost}.`, "success");

  if (truck.position === state.goal) {
    winGame();
    return;
  }

  // A* becomes the dynamic route advisor after every player move.
  calculateDynamicRoute();
  log(`A* recalculated a route from ${truck.position} to the Upload Server.`);

  enemyTurn();
  moveDrones();
  resolveDroneDamage();
  checkWinLose();

  if (!state.won && !state.lost) {
    ui.connection.textContent = "● YOUR TURN";
    ui.connection.style.color = "#39ff88";
  }

  updateUI();
}

function enemyTurn() {
  // Give the player one free planning move between Grid Master actions.
  if (state.cycle % state.difficulty.enemyInterval !== 0) {
    state.lastEnemyAction = "WAIT / REPOSITION";
    state.enemyScore = 0;
    state.alphaBetaVisited = 0;
    log("GRID MASTER is repositioning. No hostile action this cycle.");
    return;
  }

  const aiState = {
    health: truck.health,
    truck: truck.position,
    goal: state.goal,
    blocked: new Set(state.blocked),
    drones: drones.length,
    maxDrones: state.difficulty.maxDrones,
    droneDamage: state.difficulty.droneDamage,
    hackDamage: state.difficulty.hackDamage,
    route: [...state.route],
    distance: Math.max(0, state.route.length - 1),
    atGoal: truck.position === state.goal
  };

  const result = chooseEnemyAction(aiState, state.difficulty.alphaBetaDepth);
  state.lastEnemyAction = result.action.toUpperCase();
  state.enemyScore = Math.round(result.score * 10) / 10;
  state.alphaBetaVisited = result.visited;

  applyEnemyAction(result.action);
}

function applyEnemyAction(action) {
  if (action === "firewall") {
    const candidates = state.route.slice(2, -1).filter(id => !state.blocked.has(id));
    for (const target of shuffled(candidates)) {
      const testBlocked = new Set(state.blocked);
      testBlocked.add(target);
      const route = aStar(truck.position, state.goal, testBlocked);
      if (route.path.length) {
        state.blocked.add(target);
        firewalls.push(new Firewall(target));
        log(`GRID MASTER deployed a firewall at ${target}.`, "danger");
        calculateDynamicRoute();
        return;
      }
    }
  } else if (action === "drone") {
    if (drones.length < state.difficulty.maxDrones) {
      const spawn = nearestSpawnNode();
      if (spawn) {
        const drone = new IceDrone(`ICE-${drones.length + 1}`, spawn);
        drones.push(drone);
        log(`GRID MASTER deployed ${drone.id} at ${spawn}.`, "danger");
        return;
      }
    }
  } else {
    const candidates = state.route.slice(2, -1).filter(id => !state.blocked.has(id));
    for (const target of shuffled(candidates)) {
      const testBlocked = new Set(state.blocked);
      testBlocked.add(target);
      const route = aStar(truck.position, state.goal, testBlocked);
      if (route.path.length) {
        state.blocked.add(target);
        truck.damage(state.difficulty.hackDamage);
        log(`NETWORK HACK corrupted ${target}. Payload integrity -${state.difficulty.hackDamage}%.`, "danger");
        calculateDynamicRoute();
        return;
      }
    }
    truck.damage(state.difficulty.hackDamage);
    log(`NETWORK HACK caused a signal shock. Payload integrity -${state.difficulty.hackDamage}%.`, "danger");
    return;
  }

  log("GRID MASTER attempted an action but no valid target was available.");
}

function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function nearestSpawnNode() {
  const candidates = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = key(x, y);
      const distance = Math.abs(parseKey(id).x - parseKey(truck.position).x) + Math.abs(parseKey(id).y - parseKey(truck.position).y);
      if (distance < state.difficulty.spawnDistance) continue;
      if (id === state.goal || id === state.start || state.blocked.has(id)) continue;
      if (drones.some(drone => drone.position === id)) continue;
      candidates.push({ id, distance });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.length ? candidates[0].id : null;
}

function moveDrones() {
  for (const drone of drones) {
    drone.moveToward(truck.position, neighbors, state.blocked);
  }
}

function resolveDroneDamage() {
  for (const drone of drones) {
    if (drone.position === truck.position) {
      truck.damage(state.difficulty.droneDamage);
      log(`${drone.id} intercepted the payload. -${state.difficulty.droneDamage}% integrity.`, "danger");
    }
  }
}

function checkWinLose() {
  if (truck.health <= 0) {
    state.lost = true;
    state.running = false;
    ui.connection.textContent = "● CONNECTION LOST";
    ui.connection.style.color = "#ff476f";
    log("PAYLOAD DESTROYED. Grid Master wins.", "danger");
  }
}

function winGame() {
  state.won = true;
  state.running = false;
  ui.start.disabled = false;
  ui.pause.disabled = true;
  ui.step.disabled = true;
  ui.start.textContent = `▶ START LEVEL ${state.level + 1}`;
  ui.connection.textContent = "● UPLOAD COMPLETE";
  ui.connection.style.color = "#39ff88";
  log(`LEVEL ${state.level} COMPLETE. New origin and destination are ready.`, "success");
  updateUI();
}

function handleKeydown(event) {
  if (!state.running || state.won || state.lost) return;

  const current = parseKey(truck.position);
  const moves = {
    ArrowUp: { x: current.x, y: current.y - 1 },
    w: { x: current.x, y: current.y - 1 },
    W: { x: current.x, y: current.y - 1 },
    ArrowDown: { x: current.x, y: current.y + 1 },
    s: { x: current.x, y: current.y + 1 },
    S: { x: current.x, y: current.y + 1 },
    ArrowLeft: { x: current.x - 1, y: current.y },
    a: { x: current.x - 1, y: current.y },
    A: { x: current.x - 1, y: current.y },
    ArrowRight: { x: current.x + 1, y: current.y },
    d: { x: current.x + 1, y: current.y },
    D: { x: current.x + 1, y: current.y }
  };

  const next = moves[event.key];
  if (!next) return;
  event.preventDefault();
  if (next.x >= 0 && next.x < COLS && next.y >= 0 && next.y < ROWS) {
    playerMove(key(next.x, next.y));
  }
}

function updateUI() {
  const health = truck.health;
  if (ui.level) ui.level.textContent = state.level;
  if (ui.origin) ui.origin.textContent = state.start;
  if (ui.destination) ui.destination.textContent = state.goal;
  ui.health.textContent = `${health}%`;
  ui.healthBar.style.width = `${health}%`;
  ui.healthRing.textContent = health;
  ui.cycle.textContent = state.cycle;
  ui.cost.textContent = state.routeCost;
  ui.nodes.textContent = state.explored;
  ui.algorithm.textContent = state.algorithm;
  ui.enemyAction.textContent = state.lastEnemyAction;
  ui.score.textContent = state.enemyScore;
  ui.depth.textContent = state.difficulty.alphaBetaDepth;

  ui.objectiveRoute.classList.toggle("done", truck.position !== state.start);
  ui.objectiveThreat.classList.toggle("done", drones.length === 0 && firewalls.length === 0);
  ui.objectiveThreat.textContent = `Difficulty: ${state.difficulty.label} — survive up to ${state.difficulty.maxDrones} ICE drones.`;
  ui.objectiveUpload.classList.toggle("done", state.won);

  if (state.won) {
    ui.connection.textContent = "● UPLOAD COMPLETE";
    ui.connection.style.color = "#39ff88";
  } else if (state.lost) {
    ui.connection.textContent = "● CONNECTION LOST";
    ui.connection.style.color = "#ff476f";
  }

  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawEdges();
  drawRoute();
  drawBlocked();
  drawLegalMoves();
  drawNodes();
  drawDrones();
  drawTruck();
  drawOverlay();
}

function drawBackground() {
  ctx.fillStyle = "#03070d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(0,229,255,.045)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= canvas.width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= canvas.height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,229,255,.7)";
  ctx.font = '11px "Share Tech Mono"';
  ctx.fillText("ORIGIN SECTOR // BANDWIDTH PIPELINE // UPLOAD SECTOR", 18, 20);
}

function drawEdges() {
  const drawn = new Set();

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = key(x, y);
      for (const n of neighbors(id)) {
        const edgeKey = [id, n.id].sort().join("|");
        if (drawn.has(edgeKey)) continue;
        drawn.add(edgeKey);

        const a = nodePixel(id);
        const b = nodePixel(n.id);
        const isBlocked = state.blocked.has(id) || state.blocked.has(n.id);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = isBlocked ? 4 : 2;
        ctx.strokeStyle = isBlocked ? "rgba(255,71,111,.25)" : costColor(n.cost);
        ctx.globalAlpha = isBlocked ? .4 : .65;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (!isBlocked) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.fillStyle = costColor(n.cost);
          ctx.font = '9px "Share Tech Mono"';
          ctx.fillText(String(n.cost), mx + 4, my - 3);
        }
      }
    }
  }
}

function costColor(cost) {
  if (cost === 1) return "#39ff88";
  if (cost === 3) return "#00e5ff";
  return "#ffe45c";
}

function drawRoute() {
  if (state.route.length < 2) return;

  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = "#ff2bd6";
  ctx.strokeStyle = "#ff2bd6";
  ctx.lineWidth = 5;
  ctx.globalAlpha = .9;
  ctx.beginPath();

  state.route.forEach((id, index) => {
    const p = nodePixel(id);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });

  ctx.stroke();
  ctx.restore();
}

function drawLegalMoves() {
  if (!state.running || state.won || state.lost) return;

  for (const n of neighbors(truck.position)) {
    if (state.blocked.has(n.id)) continue;
    const p = nodePixel(n.id);
    ctx.save();
    ctx.strokeStyle = "rgba(57,255,136,.9)";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#39ff88";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13 + Math.sin(animation * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBlocked() {
  for (const id of state.blocked) {
    const p = nodePixel(id);
    ctx.save();
    ctx.strokeStyle = "#ff476f";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#ff476f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - 9, p.y - 9);
    ctx.lineTo(p.x + 9, p.y + 9);
    ctx.moveTo(p.x + 9, p.y - 9);
    ctx.lineTo(p.x - 9, p.y + 9);
    ctx.stroke();
    ctx.restore();
  }
}

function drawNodes() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = key(x, y);
      const p = nodePixel(id);
      const isStart = id === state.start;
      const isGoal = id === state.goal;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, isStart || isGoal ? 11 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isStart ? "#39ff88" : isGoal ? "#00e5ff" : "#0c1a25";
      ctx.strokeStyle = isStart ? "#39ff88" : isGoal ? "#00e5ff" : "#5d7890";
      ctx.lineWidth = 2;
      ctx.shadowBlur = isStart || isGoal ? 18 : 8;
      ctx.shadowColor = isStart ? "#39ff88" : isGoal ? "#00e5ff" : "#00e5ff";
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (isStart || isGoal) {
        ctx.fillStyle = isStart ? "#39ff88" : "#00e5ff";
        ctx.font = '10px "Share Tech Mono"';
        ctx.fillText(isStart ? "ORIGIN" : "UPLOAD", p.x - 24, p.y - 18);
      }
    }
  }
}

function drawTruck() {
  const p = nodePixel(truck.position);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.shadowBlur = 22;
  ctx.shadowColor = truck.damageFlash > 0 ? "#ff476f" : "#ff2bd6";

  ctx.fillStyle = truck.damageFlash > 0 ? "#ff476f" : "#ff2bd6";
  ctx.fillRect(-15, -10, 24, 17);

  ctx.fillStyle = "#ccefff";
  ctx.fillRect(9, -6, 9, 13);

  ctx.fillStyle = "#07101a";
  ctx.fillRect(11, -4, 5, 5);

  ctx.fillStyle = "#0a0d14";
  ctx.beginPath();
  ctx.arc(-9, 9, 4, 0, Math.PI * 2);
  ctx.arc(11, 9, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = '9px "Share Tech Mono"';
  ctx.fillText("DATA", -14, -16);
  ctx.restore();
}

function drawDrones() {
  for (const drone of drones) {
    const p = nodePixel(drone.position);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#ff476f";
    ctx.strokeStyle = "#ff476f";
    ctx.fillStyle = "rgba(255,71,111,.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 11);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff476f";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '8px "Share Tech Mono"';
    ctx.fillText("ICE", -10, -15);
    ctx.restore();
  }
}

function drawOverlay() {
  if (!state.won && !state.lost) return;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.shadowBlur = 25;

  ctx.fillStyle = state.won ? "#39ff88" : "#ff476f";
  ctx.shadowColor = ctx.fillStyle;
  ctx.font = '700 42px Orbitron';
  ctx.fillText(state.won ? "UPLOAD COMPLETE" : "PAYLOAD DESTROYED", canvas.width / 2, canvas.height / 2 - 10);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#dce9f5";
  ctx.font = '14px "Share Tech Mono"';
  ctx.fillText(
    state.won ? "You successfully escorted the payload." : "The Grid Master breached payload integrity.",
    canvas.width / 2,
    canvas.height / 2 + 25
  );
  ctx.restore();
}

ui.start.addEventListener("click", startGame);
ui.pause.addEventListener("click", pauseGame);
ui.step.addEventListener("click", stepGame);
ui.reset.addEventListener("click", () => resetGame(1));
window.addEventListener("keydown", handleKeydown);

canvas.addEventListener("click", event => {
  if (!state.running || state.won || state.lost) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mouseX = (event.clientX - rect.left) * scaleX;
  const mouseY = (event.clientY - rect.top) * scaleY;

  let nearest = null;
  let best = Infinity;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = key(x, y);
      const p = nodePixel(id);
      const d = Math.hypot(mouseX - p.x, mouseY - p.y);
      if (d < best) {
        best = d;
        nearest = id;
      }
    }
  }

  if (best < 22) playerMove(nearest);
});

function animate() {
  animation += 0.016;
  for (const firewall of firewalls) firewall.tick();
  truck.tick();
  draw();
  requestAnimationFrame(animate);
}

resetGame();
animate();
