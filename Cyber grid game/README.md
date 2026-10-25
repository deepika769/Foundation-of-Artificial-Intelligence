# Neon Cyber-Grid: Payload Escort

A browser-based AI strategy game demonstrating three classical AI search techniques:

1. Uniform Cost Search (UCS)
2. A* Search
3. Minimax with Alpha-Beta Pruning

## Gameplay

The player escorts a data payload truck from the Origin Node to the Upload Server.

The Grid Master AI can deploy:
- ICE drones
- Firewall barriers
- Network hacks

The payload loses integrity when hostile actions reach it.

## AI Algorithms

### Uniform Cost Search

UCS calculates the initial least-cost path.

Network costs:
- Optic line = 1
- Standard cable = 3
- Encrypted/jammed sector = 8

UCS prioritizes the accumulated path cost.

### A* Search

A* is used for dynamic rerouting after the network changes.

Formula:

f(n) = g(n) + h(n)

where:
- g(n) = cost already travelled
- h(n) = Manhattan-distance heuristic to the server

### Alpha-Beta Pruning

The Grid Master uses a small minimax game tree to compare:
- Firewall deployment
- ICE drone deployment
- Network hack

Alpha-beta pruning removes branches that cannot improve the final decision.

The evaluation function considers:

Score = Damage Dealt - Distance To Server + Chokepoint Control

## How to Run

1. Open the project folder in VS Code.
2. Install the Live Server extension.
3. Right-click `index.html`.
4. Select `Open with Live Server`.

No Node.js, database, framework, or API key is required.

## Controls

- START: starts automatic cycles.
- PAUSE: pauses the game.
- STEP: advances one cycle.
- RESET: returns to the initial state.
- When paused, click a grid node to manually place/remove a firewall and demonstrate A* rerouting.

## Project Structure

```text
cyberpunk/
├── index.html
├── style.css
├── game.js
├── algorithms/
│   ├── ucs.js
│   ├── astar.js
│   └── alphaBeta.js
├── entities/
│   ├── truck.js
│   ├── drone.js
│   └── firewall.js
└── data/
    ├── grid.js
    └── gameState.js
```

## Progressive Difficulty

Each completed level still receives a new origin/destination pair. In addition, difficulty now increases gradually:

- Level 1 — Rookie: Grid Master responds every 2 moves; 2 drones max.
- Level 2 — Alert: stronger drone/hack damage.
- Level 3 — Hostile: Grid Master responds every move.
- Level 4 — Critical: up to 3 drones and deeper Alpha-Beta search.
- Level 5 — Blackout: drones can spawn closer and deal more damage.
- Level 6 — Red Alert: deeper Alpha-Beta search.
- Level 7 — Lockdown: higher drone damage.
- Level 8+ — Nightmare: highest configured challenge.

The difficulty is progressive, but the game remains completable because the Grid Master still cannot intentionally block the only available route.
