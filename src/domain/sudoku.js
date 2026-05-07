import solve from '@mattflow/sudoku-solver';
import { getSudoku } from 'fake-sudoku-puzzle-generator';
import { SUDOKU_SIZE } from './constants';

function isValidSet(numbers) {
    const set = new Set(numbers);
    if (set.has(0)) return false;
    return set.size === 9;
}

/**
 * 数独盘面类
 * 职责：管理盘面数据、落子、复制、序列化展示
 */
class Sudoku {
    #grid;
    #fixed;

    /**
     * 构造函数
     * @param {number[][]} grid - 初始二维数组
     */
    constructor(grid, fixed = null) {
        this.#grid = this.deepCopy(grid);
        this.#fixed = fixed == null ? this.deepCopy(grid) : this.deepCopy(fixed);
    }

    /**
     * 落子操作
     * @param {Object} move - { row, col, value }
     * @returns {boolean} 是否真正执行了修改
     */
    guess(move) {
        const { row, col, value } = move;

        if (row < 0 || row >= 9 || col < 0 || col >= 9) {
            return false;
        }
        if (value < 0 || value > 9) {
            return false;
        }
        if (this.#fixed[row][col]) {
            return false;
        }
        if (this.#grid[row][col] === value) {
            return false;
        }

        this.#grid[row][col] = value;
        return true;
    }

    /**
     * 深度拷贝 9x9 数组
     * @param {number[][]} original
     * @returns {number[][]} 新数组
     */
    deepCopy(original) {
        const copy = Array(9)
            .fill()
            .map(() => Array(9).fill(0));
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                copy[i][j] = original[i][j];
            }
        }
        return copy;
    }

    /**
     * 创建当前盘面的全新副本
     * @returns {Sudoku}
     */
    clone() {
        const newSudoku = new Sudoku(this.#grid, this.#fixed);
        return newSudoku;
    }

    /**
     * 序列化为纯数组格式
     * @returns {number[][]}
     */
    toJSON() {
        return {
            grid: this.deepCopy(this.#grid),
            fixed: this.deepCopy(this.#fixed),
        };
    }

    /**
     * 转为可读字符串
     * @returns {string}
     */
    toString() {
        let s = '';
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                s += (this.#grid[i][j] === 0 ? '·' : this.#grid[i][j]) + ' ';
            }
            s += '\n';
        }
        return s;
    }

    /**
     * 获取当前网格副本
     * @returns {number[][]}
     */
    getGrid() {
        return this.deepCopy(this.#grid);
    }

    /**
     * 判断是否是固定数字
     */
    isFixed(row, col) {
        return this.#fixed[row][col];
    }

    isWon() {
        const grid = this.#grid;

        // 检查每一行
        for (let r = 0; r < 9; r++) {
            if (!isValidSet(grid[r])) return false;
        }

        // 检查每一列
        for (let c = 0; c < 9; c++) {
            const col = grid.map((row) => row[c]);
            if (!isValidSet(col)) return false;
        }

        // 检查每个 3×3 宫
        for (let boxRow = 0; boxRow < 3; boxRow++) {
            for (let boxCol = 0; boxCol < 3; boxCol++) {
                const box = [];
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        box.push(grid[boxRow * 3 + r][boxCol * 3 + c]);
                    }
                }
                if (!isValidSet(box)) return false;
            }
        }

        return true;
    }

    getInvalidCells() {
        const invalid = [];
        const addInvalid = (x, y) => {
            const key = x + ',' + y;
            if (!invalid.includes(key)) invalid.push(key);
        };

        for (let y = 0; y < 9; y++) {
            for (let x = 0; x < 9; x++) {
                const value = this.#grid[y][x];
                if (!value) continue;

                for (let i = 0; i < 9; i++) {
                    if (i !== x && this.#grid[y][i] === value) addInvalid(x, y);
                    if (i !== y && this.#grid[i][x] === value) addInvalid(x, y);
                }

                const startY = Math.floor(y / 3) * 3;
                const startX = Math.floor(x / 3) * 3;
                for (let r = startY; r < startY + 3; r++) {
                    for (let c = startX; c < startX + 3; c++) {
                        if ((r !== y || c !== x) && this.#grid[r][c] === value) {
                            addInvalid(x, y);
                        }
                    }
                }
            }
        }
        return invalid;
    }

    getCandidates(row, col) {
        if (this.#grid[row][col] !== 0) return [];

        const used = new Set();

        for (let c = 0; c < 9; c++) {
            const val = this.#grid[row][c];
            if (val !== 0) used.add(val);
        }

        for (let r = 0; r < 9; r++) {
            const val = this.#grid[r][col];
            if (val !== 0) used.add(val);
        }

        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let r = boxRow; r < boxRow + 3; r++) {
            for (let c = boxCol; c < boxCol + 3; c++) {
                const val = this.#grid[r][c];
                if (val !== 0) used.add(val);
            }
        }

        const candidates = [];
        for (let v = 1; v <= 9; v++) {
            if (!used.has(v)) candidates.push(v);
        }
        return candidates;
    }

    /**
     * 轻度提示，只给可填格子位置
     * @returns {{row: number, col: number}|null}
     */
    getLightHint() {
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.#grid[row][col] !== 0) continue;
                const candidates = this.getCandidates(row, col);
                if (candidates.length > 0) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    /**
     * 中度提示：返回某个位置及其唯一的候选数
     * @returns {null|{row: number, col: number, value: *, candidates: ([]|*[]), reason: string}}
     */
    getMediumHint() {
        // 先找唯一候选数
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.#grid[row][col] === 0) {
                    const candidates = this.getCandidates(row, col);
                    if (candidates.length === 1) {
                        return {
                            row,
                            col,
                            value: candidates[0],
                            candidates,
                            reason: '唯一候选数',
                        };
                    }
                }
            }
        }
        return null;
    }

    getDeepHint() {
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.#grid[row][col] !== 0) continue;

                const candidates = this.getCandidates(row, col);
                if (candidates.length !== 1) continue;
                const value = candidates[0];

                let isRowOnly = true;
                for (let c = 0; c < 9; c++) {
                    if (c === col) continue;
                    if (this.getCandidates(row, c).includes(value)) {
                        isRowOnly = false;
                        break;
                    }
                }
                if (isRowOnly) {
                    return {
                        row,
                        col,
                        value,
                        reason: `数字 ${value} 在第 ${row + 1} 行只能填在这里`,
                    };
                }

                let isColOnly = true;
                for (let r = 0; r < 9; r++) {
                    if (r === row) continue;
                    if (this.getCandidates(r, col).includes(value)) {
                        isColOnly = false;
                        break;
                    }
                }
                if (isColOnly) {
                    return {
                        row,
                        col,
                        value,
                        reason: `数字 ${value} 在第 ${col + 1} 列只能填在这里`,
                    };
                }

                const br = Math.floor(row / 3) * 3;
                const bc = Math.floor(col / 3) * 3;
                let isBoxOnly = true;

                for (let r = br; r < br + 3; r++) {
                    for (let c = bc; c < bc + 3; c++) {
                        if (r === row && c === col) continue;
                        if (this.getCandidates(r, c).includes(value)) {
                            isBoxOnly = false;
                            break;
                        }
                    }
                    if (!isBoxOnly) break;
                }

                if (isBoxOnly) {
                    return {
                        row,
                        col,
                        value,
                        reason: `数字 ${value} 在当前 3×3 宫中只能填在这里`,
                    };
                }

                return {
                    row,
                    col,
                    value,
                    reason: '通过行列宫排除，只有唯一可填数字',
                };
            }
        }

        return null;
    }

    hasConflict() {
        return this.getInvalidCells().length > 0;
    }

    isComplete() {
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.#grid[row][col] === 0) return false;
            }
        }
        return true;
    }

    /**
     * 下一步提示（可分层）。
     *
     * - `light`：只给空格位，不承诺唯一数字（适合「最弱」提示）。
     * - `medium` / `deep`：裸单（唯一候选）；`deep` 带行列宫层面的解释文案。
     * - `auto`（默认）：在存在裸单时，用 {@link getMediumHint} 确定格子与数字，并用 {@link getDeepHint} 合并更细的 `reason`。
     * @param {{ level?: 'light'|'medium'|'deep'|'auto' }} [options]
     * @returns {null|{ level: string, row: number, col: number, value?: number, candidates?: number[], reason: string }}
     */
    getNextStepHint(options = {}) {
        const level = options.level ?? 'auto';

        if (level === 'light') {
            const h = this.getLightHint();
            if (!h) return null;
            return {
                level: 'light',
                row: h.row,
                col: h.col,
                reason: '可从此空格入手（仅位置，未指定应填数字）',
            };
        }

        if (level === 'medium') {
            const h = this.getMediumHint();
            if (!h) return null;
            return {
                level: 'medium',
                row: h.row,
                col: h.col,
                value: h.value,
                candidates: h.candidates,
                reason: h.reason,
            };
        }

        if (level === 'deep') {
            const h = this.getDeepHint();
            if (!h) return null;
            return {
                level: 'deep',
                row: h.row,
                col: h.col,
                value: h.value,
                candidates: this.getCandidates(h.row, h.col),
                reason: h.reason,
            };
        }

        const medium = this.getMediumHint();
        if (!medium) return null;
        const deep = this.getDeepHint();
        return {
            level: 'deep',
            row: medium.row,
            col: medium.col,
            value: medium.value,
            candidates: medium.candidates,
            reason: deep ? deep.reason : medium.reason,
        };
    }

    /**
     * 生成新数独题目（静态方法）
     * @param {'veryeasy'|'easy'|'medium'|'hard'} difficulty
     * @returns {Sudoku}
     */
    static generate(difficulty = 'easy') {
        const sudokuData = getSudoku(difficulty);

        const grid = sudokuData.map((row) => row.map((val) => (val === null ? 0 : val)));

        return new Sudoku(grid);
    }

    /**
     * 求解当前数独，返回一个新的已解数独对象
     * @returns {Sudoku}
     */
    solve() {
        const gridStr = this.getGrid().flat().join('');
        const solutionArr = solve(gridStr, {
            outputArray: true,
            hintCheck: false,
        });

        // 转成 9x9
        const solvedGrid = Array(SUDOKU_SIZE)
            .fill()
            .map(() => Array(SUDOKU_SIZE).fill(0));
        for (let i = 0; i < SUDOKU_SIZE * SUDOKU_SIZE; i++) {
            const row = Math.floor(i / SUDOKU_SIZE);
            const col = i % SUDOKU_SIZE;
            solvedGrid[row][col] = solutionArr[i];
        }

        return new Sudoku(solvedGrid);
    }
}

export { Sudoku };
