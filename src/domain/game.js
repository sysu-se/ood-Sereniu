import {Sudoku} from "./sudoku";

/**
 * 游戏会话类
 * 职责：管理当前数独盘面、历史记录栈、撤销与重做功能
 */
class Game {
    // 当前正在进行的数独实例
    #current;
    // 历史快照栈，用于撤销操作
    #history;
    // 重做快照栈，用于重做操作
    #future;

    #explorationMode;
    #explorationGame;
    #explorationFailedFingerprints;

    /**
     * 构造函数
     * @param {Sudoku} sudoku - 初始数独盘面
     */
    constructor(sudoku) {
        this.#current = sudoku.clone();
        this.#history = [];
        this.#future = [];
        this.#explorationMode = false;
        this.#explorationGame = null;
        this.#explorationFailedFingerprints = new Set();
    }

    /**
     * 获取当前数独实例
     * @returns {Sudoku} 当前数独对象
     */
    getSudoku() {
        return this.#current;
    }

    /**
     * 落子并记录历史状态
     * @param {Object} move - 落子信息 { row, col, value }
     */
    guess(move) {
        // 保存当前状态到历史栈
        this.#history.push(this.#current.clone());
        // 清空重做栈
        this.#future = [];
        // 执行落子操作
        const changed = this.#current.guess(move);
        if (!changed) {
            this.#history.pop();
        }
    }

    /**
     * 撤销上一步操作
     */
    undo() {
        if (!this.canUndo()) return;
        // 将当前状态存入重做栈
        this.#future.push(this.#current.clone());
        // 从历史栈恢复上一步状态
        this.#current = this.#history.pop();
    }

    /**
     * 重做上一步撤销的操作
     */
    redo() {
        if (!this.canRedo()) return;
        // 将当前状态存入历史栈
        this.#history.push(this.#current.clone());
        // 从重做栈恢复状态
        this.#current = this.#future.pop();
    }

    /**
     * 判断是否可以撤销
     * @returns {boolean}
     */
    canUndo() {
        return this.#history.length > 0;
    }

    /**
     * 判断是否可以重做
     * @returns {boolean}
     */
    canRedo() {
        return this.#future.length > 0;
    }

    /**
     * 序列化游戏数据
     * @returns {Object} 包含当前盘面、历史、重做数据
     */
    toJSON() {
        return {
            sudoku: this.#current.toJSON(),
            history: this.#history.map(i => i.toJSON()),
            future: this.#future.map(i => i.toJSON()),
        };
    }

    static fromJSON(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const currentSudoku = new Sudoku(data.sudoku.grid, data.sudoku.fixed);
        const game = new Game(currentSudoku);
        game.#history = data.history.map(h => new Sudoku(h.grid, h.fixed));
        game.#future = data.future.map(f => new Sudoku(f.grid, f.fixed));
        return game;
    }

    isFixed(row, col) {
        return this.#current.isFixed(row, col);
    }


    isWon(){
        return this.#current.isWon();
    }

    getInvalidCells() {
        return this.#current.getInvalidCells();
    }

    getGrid() {
        return this.#current.getGrid();
    }

    getCandidates(row, col) {
        return this.#current.getCandidates(row, col);
    }

    /**
     * @param {{ level?: 'light'|'medium'|'deep'|'auto' }} [options] 透传给 {@link Sudoku#getNextStepHint}
     */
    getNextStepHint(options) {
        return this.#current.getNextStepHint(options);
    }

    hasConflict() {
        return this.#current.hasConflict();
    }

    /**
     * 在探索子 Game 上调用：根据当前盘面更新「已知冲突局面」集合并返回状态。
     * 当再次到达与某次冲突完全相同的盘面时，replayOfKnownFailure 为 true（作业「记忆」要求）。
     * @returns {{ hasConflict: boolean, replayOfKnownFailure: boolean }}
     */
    evaluateExplorationFailure() {
        if (!this.#current.hasConflict()) {
            return { hasConflict: false, replayOfKnownFailure: false };
        }
        const fp = JSON.stringify(this.#current.getGrid());
        const replayOfKnownFailure = this.#explorationFailedFingerprints.has(fp);
        this.#explorationFailedFingerprints.add(fp);
        return { hasConflict: true, replayOfKnownFailure };
    }

    isExploring() {
        return this.#explorationMode;
    }

    enterExploration() {
        if (this.#explorationMode) return null;
        this.#explorationMode = true;
        this.#explorationGame = new Game(this.#current);
        return this.#explorationGame;
    }

    exitExploration(commit = false) {
        if (!this.#explorationMode) return;

        if (commit && this.#explorationGame) {
            // 与 guess 一致：先把提交前的主局面压栈，再换成探索结果，Undo 才能回到探索前
            const finalSudoku = this.#explorationGame.getSudoku().clone();
            this.#history.push(this.#current.clone());
            this.#current = finalSudoku;
            this.#future = [];
        }

        this.#explorationMode = false;
        this.#explorationGame = null;
    }

    getExplorationGame() {
        return this.#explorationGame;
    }

}

export { Game };