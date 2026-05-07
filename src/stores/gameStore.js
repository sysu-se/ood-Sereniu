/**
 * Store adapter：持有领域 Game，向 Svelte 暴露快照与命令。
 */
import { get, writable } from 'svelte/store';
import { createGame, createSudoku, createSudokuFromDIFF } from '../domain/index.js';
import { decodeSencode, encodeSudoku } from '@sudoku/sencode';
import { solveSudoku } from '@sudoku/sudoku';
import { hints } from '@sudoku/stores/hints';
import { cursor } from '@sudoku/stores/cursor';
import { timer } from '@sudoku/stores/timer';
import { difficulty } from '@sudoku/stores/difficulty';
import { candidates } from '@sudoku/stores/candidates';

/** @type {import('../domain/game.js').Game | null} */
let rootGame = null;

function emptyState() {
	const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
	const clueGrid = Array.from({ length: 9 }, () => Array(9).fill(false));
	return {
		grid,
		clueGrid,
		invalidCells: [],
		won: false,
		canUndo: false,
		canRedo: false,
		exploring: false,
		hasGame: false,
	};
}

function activeGame() {
	if (!rootGame) return null;
	if (rootGame.isExploring() && rootGame.getExplorationGame()) {
		return rootGame.getExplorationGame();
	}
	return rootGame;
}

function buildSnapshot() {
	if (!rootGame) return emptyState();

	const g = activeGame();
	const grid = g.getGrid();
	const clueGrid = Array.from({ length: 9 }, (_, y) =>
		Array.from({ length: 9 }, (_, x) => g.isFixed(y, x)),
	);
	const invalidCells = g.getInvalidCells();
	const won = g.isWon();
	const canUndo = g.canUndo();
	const canRedo = g.canRedo();
	const exploring = rootGame.isExploring();

	return {
		grid,
		clueGrid,
		invalidCells,
		won,
		canUndo,
		canRedo,
		exploring,
		hasGame: true,
	};
}

function clearCandidatesAtCell(x, y) {
	candidates.clear({ x, y });
}

function afterGuessOnExploration() {
	if (!rootGame || !rootGame.isExploring()) return;
	const sub = rootGame.getExplorationGame();
	if (!sub) return;
	const { hasConflict, replayOfKnownFailure } = sub.evaluateExplorationFailure();
	if (hasConflict && replayOfKnownFailure) {
		// 作业「记忆」：不新增 UI 组件，仅用系统提示（可后续换 modal）
		window.alert('该盘面与此前探索中已失败过的冲突局面相同。');
	}
}

function resetSessionStores(diffOrCustom) {
	if (typeof diffOrCustom === 'string' && diffOrCustom !== 'custom') {
		difficulty.set(diffOrCustom);
	}
	cursor.reset();
	timer.reset();
	hints.reset();
	candidates.reset();
}

const { subscribe, set } = writable(emptyState());

function notify() {
	set(buildSnapshot());
}

/**
 * @param {string} diff
 */
function startFromDifficulty(diff) {
	resetSessionStores(diff);
	const sudoku = createSudokuFromDIFF(diff);
	rootGame = createGame({ sudoku });
	location.hash = '';
	notify();
}

/**
 * @param {string} sencode
 */
function startFromSencode(sencode) {
	resetSessionStores('custom');
	difficulty.setCustom();
	const raw = decodeSencode(sencode);
	const sudoku = createSudoku(raw);
	rootGame = createGame({ sudoku });
	notify();
}

/**
 * @param {number} y
 * @param {number} x
 * @param {number} value
 */
function guess(y, x, value) {
	const g = activeGame();
	if (!g) return;
	clearCandidatesAtCell(x, y);
	g.guess({ row: y, col: x, value });
	afterGuessOnExploration();
	notify();
}

function undo() {
	const g = activeGame();
	if (!g || !g.canUndo()) return;
	g.undo();
	notify();
}

function redo() {
	const g = activeGame();
	if (!g || !g.canRedo()) return;
	g.redo();
	notify();
}

function getSencode() {
	const g = activeGame();
	if (!g) return '';
	return encodeSudoku(g.getGrid());
}

function hintsAvailable() {
	const h = get(hints);
	return h > 0;
}

/** 与旧 @sudoku/stores/hints.useHint 一致：扣次并累计 usedHints */
function tryUseHintCredit() {
	const h = get(hints);
	if (h <= 0) return false;
	hints.useHint();
	return true;
}

/**
 * 轻提示：移动光标到建议格（不填数）。
 * @returns {boolean}
 */
function applyHintLight() {
	const g = activeGame();
	if (!g || !hintsAvailable()) return false;
	const sudoku = g.getSudoku();
	const hint = sudoku.getNextStepHint({ level: 'light' });
	if (!hint) return false;
	if (!tryUseHintCredit()) return false;
	cursor.set(hint.col, hint.row);
	notify();
	return true;
}

/**
 * 中提示：优先逻辑唯一候选；否则与旧版一致——用全题求解填光标格。
 * @returns {boolean}
 */
function applyHintMedium() {
	const g = activeGame();
	if (!g || !hintsAvailable()) return false;
	const cur = get(cursor);
	if (cur.x === null || cur.y === null) return false;
	if (g.isFixed(cur.y, cur.x) || g.getGrid()[cur.y][cur.x] !== 0) return false;

	const logical = g.getNextStepHint({ level: 'medium' });
	if (logical && logical.value != null) {
		const { row, col, value } = logical;
		if (!tryUseHintCredit()) return false;
		clearCandidatesAtCell(col, row);
		g.guess({ row, col, value });
		afterGuessOnExploration();
		notify();
		return true;
	}

	const board = g.getGrid().map((row) => [...row]);
	const solved = solveSudoku(board);
	const v = solved[cur.y][cur.x];
	if (!v) return false;
	if (!tryUseHintCredit()) return false;
	clearCandidatesAtCell(cur.x, cur.y);
	g.guess({ row: cur.y, col: cur.x, value: v });
	afterGuessOnExploration();
	notify();
	return true;
}

/**
 * 深提示：优先 auto（含解释链）；否则退回与中提示相同的全题求解光标格。
 * @returns {boolean}
 */
function applyHintDeep() {
	const g = activeGame();
	if (!g || !hintsAvailable()) return false;
	const cur = get(cursor);
	if (cur.x === null || cur.y === null) return false;
	if (g.isFixed(cur.y, cur.x) || g.getGrid()[cur.y][cur.x] !== 0) return false;

	const logical = g.getNextStepHint({ level: 'auto' });
	if (logical && logical.value != null) {
		const { row, col, value } = logical;
		if (!tryUseHintCredit()) return false;
		clearCandidatesAtCell(col, row);
		g.guess({ row, col, value });
		afterGuessOnExploration();
		notify();
		return true;
	}

	return applyHintMedium();
}

function enterExploration() {
	if (!rootGame || rootGame.isExploring()) return;
	rootGame.enterExploration();
	notify();
}

function commitExploration() {
	if (!rootGame || !rootGame.isExploring()) return;
	rootGame.exitExploration(true);
	notify();
}

function abandonExploration() {
	if (!rootGame || !rootGame.isExploring()) return;
	rootGame.exitExploration(false);
	notify();
}

export const gameStore = {
	subscribe,
	notify,
	startFromDifficulty,
	startFromSencode,
	guess,
	undo,
	redo,
	getSencode,
	applyHintLight,
	applyHintMedium,
	applyHintDeep,
	enterExploration,
	commitExploration,
	abandonExploration,
};
