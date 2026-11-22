// sokoban-solver-01 entry: each level is a hallway with one to four rooms hanging off it. A box can never be pushed
// back through a door, so every room is a small Sokoban problem of its own and the level's push optimum is the sum of
// the rooms' optima. Solve each room exactly with a breadth-first search over pushes, then walk between rooms.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
/** Most states one room search may keep: a work bound, never the clock, so two runs answer alike. */
const SEARCH_LIMIT = 300_000;

type Board = {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
};

type Room = {
  boxes: number[];
  goals: number[];
  done?: boolean;
};

type Step = { dx: number; dy: number; walk: string; push: string };

/** The four directions with both letters: a lower one walks, an upper one pushes. */
const STEPS: readonly Step[] = [
  { dx: 0, dy: -1, walk: 'u', push: 'U' },
  { dx: 0, dy: 1, walk: 'd', push: 'D' },
  { dx: -1, dy: 0, walk: 'l', push: 'L' },
  { dx: 1, dy: 0, walk: 'r', push: 'R' },
];

/** Read a level in XSB: every non-wall character is floor, short rows padded as wall, the frame always wall. */
function parseBoard(text: string): Board {
  const rows = text.split('\n').filter((row) => row.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((row) => row.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '#') continue;
      const i = y * w + x;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  }
  for (let x = 0; x < w; x++) {
    wall[x] = 1;
    wall[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    wall[y * w] = 1;
    wall[y * w + w - 1] = 1;
  }
  boxes.sort((a, b) => a - b);
  goals.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

/** Squares from which a lone box can still be pushed onto some goal: pulled back from the goals over open floor. */
function liveSquares(board: Board): Uint8Array {
  const { w, wall, goals } = board;
  const live = new Uint8Array(wall.length);
  const queue: number[] = [];
  for (const goal of goals) {
    live[goal] = 1;
    queue.push(goal);
  }
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head]!;
    for (const step of STEPS) {
      const d = step.dy * w + step.dx;
      const y = x - d;
      if (wall[y] === 0 && wall[y - d] === 0 && live[y] === 0) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/** Cut the player's hallway row out of the floor; what remains, split into parts that hold boxes, are the rooms. */
function splitRooms(board: Board): Room[] | null {
  const { w, wall, goals, boxes, player } = board;
  const live = liveSquares(board);
  const cut = new Uint8Array(wall.length);
  const hallRow = Math.floor(player / w);
  for (let x = 0; x < w; x++) {
    const i = hallRow * w + x;
    if (wall[i] === 0 && live[i] === 0) cut[i] = 1;
  }
  if (boxes.some((box) => cut[box] === 1)) return null;
  const label = new Int32Array(wall.length).fill(-1);
  const rooms: Room[] = [];
  for (let start = 0; start < wall.length; start++) {
    if (wall[start] !== 0 || cut[start] !== 0 || label[start] !== -1) continue;
    const squares: number[] = [start];
    label[start] = rooms.length;
    for (let head = 0; head < squares.length; head++) {
      const p = squares[head]!;
      for (const step of STEPS) {
        const q = p + step.dy * w + step.dx;
        if (wall[q] === 0 && cut[q] === 0 && label[q] === -1) {
          label[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ boxes: [], goals: [] });
  }
  for (const box of boxes) {
    const r = label[box];
    if (r < 0) return null;
    rooms[r]!.boxes.push(box);
  }
  for (const goal of goals) {
    const r = label[goal];
    if (r < 0) return null;
    rooms[r]!.goals.push(goal);
  }
  const used = rooms.filter((room) => room.boxes.length > 0);
  if (used.some((room) => room.boxes.length !== room.goals.length)) return null;
  return used;
}

/** Mark the area the player reaches from `from` around walls and boxes; return its lowest square. */
function regionLow(
  board: Board,
  occupied: Uint8Array,
  from: number,
  marks: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  const { w, wall } = board;
  let low = from;
  let top = 0;
  stack[top++] = from;
  marks[from] = stamp;
  while (top > 0) {
    const p = stack[--top]!;
    if (p < low) low = p;
    for (const step of STEPS) {
      const q = p + step.dy * w + step.dx;
      if (wall[q] === 0 && occupied[q] === 0 && marks[q] !== stamp) {
        marks[q] = stamp;
        stack[top++] = q;
      }
    }
  }
  return low;
}

/** A state's key: boxes sorted plus the player's reachable region (its lowest square), as one exact number. */
function stateKey(boxes: number[], regionLowSquare: number, size: number): number {
  let key = regionLowSquare;
  for (const box of boxes) key = key * size + box;
  return key;
}

/** Whether the box just pushed to `pushedTo` sits in a frozen 2 x 2 block of walls and boxes with one box off goal. */
function frozenBlock(board: Board, occupied: Uint8Array, goalMask: Uint8Array, pushedTo: number): boolean {
  const { w, wall } = board;
  for (const corner of [pushedTo, pushedTo - 1, pushedTo - w, pushedTo - w - 1]) {
    const a = corner;
    const b = corner + 1;
    const c = corner + w;
    const d = corner + w + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b])) continue;
    if (!(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if (occupied[a] && !goalMask[a]) return true;
    if (occupied[b] && !goalMask[b]) return true;
    if (occupied[c] && !goalMask[c]) return true;
    if (occupied[d] && !goalMask[d]) return true;
  }
  return false;
}

/** Shortest walk from `from` to `to` around walls and boxes, as lower-case LURD. */
function walkTo(board: Board, occupied: Uint8Array, from: number, to: number): string {
  const { w, wall } = board;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how: string[] = new Array(wall.length).fill('');
  const queue: number[] = [from];
  prev[from] = from;
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    if (p === to) break;
    for (const step of STEPS) {
      const q = p + step.dy * w + step.dx;
      if (wall[q] !== 0 || occupied[q] !== 0 || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = step.walk;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: push square unreachable');
  let out = '';
  for (let p = to; p !== from; p = prev[p]!) out = how[p]! + out;
  return out;
}

/**
 * The push-optimal solution of one level: a breadth-first search over push states. A state is the sorted boxes and
 * the player's whole reachable region (named by its lowest square), because only the region matters for future
 * pushes. States are expanded in push order, so the first solved one is optimal. Two safe deadlocks are pruned:
 * dead squares (no push from them can bring a box to a goal) and frozen 2 x 2 blocks.
 */
function solveBoard(board: Board, maxStates = SEARCH_LIMIT): { pushes: number; moves: string } | null {
  const { w, wall, goals, boxes, player } = board;
  const size = wall.length;
  const goalMask = new Uint8Array(size);
  for (const goal of goals) goalMask[goal] = 1;
  const live = liveSquares(board);
  if (boxes.some((box) => live[box] === 0)) return null;

  const occupied = new Uint8Array(size);
  for (const box of boxes) occupied[box] = 1;
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  const states: number[][] = [boxes.slice()];
  const players: number[] = [player];
  const parents: number[] = [-1];
  const index = new Map<number, number>();
  index.set(stateKey(boxes, regionLow(board, occupied, player, seen, ++stamp, stack), size), 0);

  const solved = (candidate: number[]): boolean => candidate.every((box) => goalMask[box] === 1);
  let found = solved(boxes) ? 0 : -1;

  for (let head = 0; found < 0 && head < states.length; head++) {
    const current = states[head]!;
    occupied.fill(0);
    for (const box of current) occupied[box] = 1;
    regionLow(board, occupied, players[head]!, seen, ++stamp, stack);
    const here = stamp;
    expand: for (let bi = 0; bi < current.length; bi++) {
      const box = current[bi]!;
      for (const step of STEPS) {
        const d = step.dy * w + step.dx;
        const target = box + d;
        if (seen[box - d] !== here) continue;
        if (wall[target] !== 0 || occupied[target] !== 0 || live[target] === 0) continue;
        occupied[box] = 0;
        occupied[target] = 1;
        const frozen = frozenBlock(board, occupied, goalMask, target);
        let key = -1;
        let next: number[] | null = null;
        if (!frozen) {
          next = current.slice();
          next[bi] = target;
          next.sort((a, b) => a - b);
          const low = regionLow(board, occupied, box, mark, ++stamp, stack);
          key = stateKey(next, low, size);
        }
        occupied[target] = 0;
        occupied[box] = 1;
        if (frozen || index.has(key)) continue;
        if (states.length >= maxStates) return null;
        const id = states.length;
        index.set(key, id);
        states.push(next!);
        players.push(box);
        parents.push(head);
        if (solved(next!)) {
          found = id;
          break expand;
        }
      }
    }
  }
  if (found < 0) return null;

  const chain: number[] = [];
  for (let state = found; state > 0; state = parents[state]!) chain.push(state);
  chain.reverse();
  let currentBoxes = boxes.slice();
  let currentPlayer = player;
  let moves = '';
  for (const state of chain) {
    const nextBoxes = states[state]!;
    let from = -1;
    let to = -1;
    for (const box of currentBoxes) if (nextBoxes.indexOf(box) === -1) { from = box; break; }
    for (const box of nextBoxes) if (currentBoxes.indexOf(box) === -1) { to = box; break; }
    const delta = to - from;
    const step = STEPS.find((candidate) => candidate.dy * w + candidate.dx === delta);
    if (step === undefined) throw new Error('solveBoard: no direction for the push');
    occupied.fill(0);
    for (const box of currentBoxes) occupied[box] = 1;
    moves += walkTo(board, occupied, currentPlayer, from - delta);
    moves += step.push;
    currentPlayer = from;
    currentBoxes = nextBoxes;
  }
  return { pushes: chain.length, moves };
}

/** Where the player ends after `moves` from `from` on a board `w` wide (the case of a letter is irrelevant here). */
function endSquare(w: number, from: number, moves: string): number {
  let square = from;
  for (const ch of moves.toLowerCase()) {
    if (ch === 'u') square -= w;
    else if (ch === 'd') square += w;
    else if (ch === 'l') square -= 1;
    else square += 1;
  }
  return square;
}

/**
 * The whole level solved room by room. The other rooms' boxes stand as walls while one room is solved (their goals
 * once they are done, where their boxes sit), and the player walks on from where the previous room left it.
 */
function solveLevel(board: Board): string {
  const rooms = splitRooms(board);
  if (rooms === null) {
    const whole = solveBoard(board);
    return whole === null ? '' : whole.moves;
  }
  let player = board.player;
  let moves = '';
  for (const room of rooms) {
    const wall = board.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      const blockers = other.done === true ? other.goals : other.boxes;
      for (const square of blockers) wall[square] = 1;
    }
    const sub: Board = {
      w: board.w,
      h: board.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const solved = solveBoard(sub);
    if (solved === null) return '';
    moves += solved.moves;
    player = endSquare(board.w, player, solved.moves);
    room.done = true;
  }
  return moves;
}

for (const id of readdirSync(INPUT_DIR).sort()) {
  const levelText = readFileSync(join(INPUT_DIR, id, 'level.txt'), 'utf8');
  const solution = solveLevel(parseBoard(levelText));
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, 'solution.txt'), `${solution}\n`);
}
