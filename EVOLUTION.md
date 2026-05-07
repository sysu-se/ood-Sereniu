# Homework 2

## 1. 提示功能如何实现？

**规则与推导**集中在 `Sudoku`：

- **候选提示**：`getCandidates(row, col)` 根据当前 `grid` 统计行、列、宫中已出现数字，得到该格可填集合。
- **分档提示**：`getLightHint()`（仅位置）、`getMediumHint()`（裸单：唯一候选及简短理由）、`getDeepHint()`（在裸单前提下，用行/列/宫层面给出更细的 `reason`）。
- **统一入口**：`getNextStepHint(options)`，分层策略见下一节。

**会话层**由 `Game` 做薄封装：`getCandidates`、`getNextStepHint` 均委托给当前 `#current`（`Sudoku`），使 UI 通过 `gameStore` 调用领域接口，而不在组件内拼接推导逻辑。提示次数等会话策略保留在 Store / `hints` 等外层，与纯规则对象分离。

---

## 2. `getNextStepHint` 的分层策略

`getNextStepHint` 支持可选参数 `options.level`：

| `level` | 行为 |
|--------|------|
| `light` | 仅返回一个可着手的空格坐标与说明，不指定唯一应填数字。 |
| `medium` | 返回第一个裸单：`row`、`col`、`value`、`candidates`、`reason`。 |
| `deep` | 同样基于裸单，强调行列宫层面的解释，并附带该格 `candidates`。 |
| `auto`（默认） | 若存在裸单：用 `getMediumHint()` 锁定格与数，并用 `getDeepHint()` 的 `reason`（若可得）与 `medium` 的 `candidates` 合并返回，兼顾可执行性与解释性。 |

当 `auto` 在无裸单时返回 `null`。

---

## 3. 提示更属于 `Sudoku` 还是 `Game`？为什么？

**计算与语义上更属于 `Sudoku`。** 候选集、裸单、行列宫排除仅依赖当前盘面与固定格掩码，与「本局是否暂停」「是否扣提示次数」等会话策略无关。

**`Game` 的职责**是持有本会话的 `Sudoku` 实例，并把提示类调用转发给 `#current`。

---

## 4. 探索模式如何实现？

采用 **主会话 + 临时子会话**（分支会话）：

- **`Game.enterExploration()`**：开启 `explorationMode`，并执行 `this.#explorationGame = new Game(this.#current)`。子 `Game` 构造时对传入盘面 `clone()`，后续修改均在副本上进行。
- **`exitExploration(commit)`**：`commit === true` 时用子会话结束时的 `Sudoku` 合并进主 `#current`；否则丢弃子会话引用，主盘面不变。
- **冲突与「记忆」**：每个 `Game` 实例维护 `#explorationFailedFingerprints`（冲突盘面的网格 JSON 指纹）。在探索 子 `Game` 上、于每次落子后调用 `evaluateExplorationFailure()`：若当前存在冲突，则记录指纹；若该指纹 在本次子会话中已出现过，则 `replayOfKnownFailure === true`，表示再次到达已知失败局面，由 UI 提示用户（实现上使用 `window.alert`，可后续改为 Modal）。

**记忆的作用域**：指纹集合挂在 探索子 `Game` 实例上；放弃或提交探索后子实例被释放，再次进入探索会新建子 `Game`，记忆随之清空。

回溯依赖子 `Game` 自带的 **线性 history**：连续 `undo` 可回到进入探索时的分支点。

---

## 5. 主局面与探索局面的关系是什么？

- **复制**：通过 `Sudoku.clone()` 与历史栈中的快照避免引用共享，防止子会话污染主会话，主 `#current` 在探索期间保持不变；探索在子 `Game` 的 `#current` 上修改。
- **提交合并**：`commit` 时将子会话最终盘面 `clone()` 赋给主 `#current`。
- **放弃回滚**：不 `commit`，结束探索并清空子 `Game` 引用，主 `#current` 从未被替换。

---

## 6. history 在本次作业中是否发生变化？

- **主 `Game`**：仍为线性栈（`#history` / `#future`），`guess` 与 `redo` 语义与 Homework 1 一致。
- **探索提交**：`exitExploration(true)` 在替换主 `#current` 之前将「探索前的主局面」压入 `#history`，与 `guess` 一致，保证 Undo 能回到进入探索之前，并清空 `#future`。
- **探索过程**：由 子 `Game` 独立的 history 管理子会话内的 Undo/Redo；主 history 未改。

---

## 7. Homework 1 中哪些设计在 Homework 2 中暴露出局限？

- **`Sudoku` 最初只管落子、胜负与拷贝，没有基于当前盘的推导查询这一类能力**：Homework 2 的提示要求候选、裸单与分层说明落在领域层；若 Homework 1 未预留这条能力边界，就只能事后在 `Sudoku` 上扩展一整条接口链，否则提示要么泄到 UI，要么只靠 `Game` 空委托而在运行期才发现缺口。

- **`Game` 最初等价于单一 `#current` + 一条线性 history**：探索需要的是主盘保持不变、旁路试探再合并或丢弃；单一时间线模型无法直接表达分支，因而在 Homework 2 必须引入子会话（子 `Game`）或等价结构。
- **仅靠线性 history 无法承载探索「记忆」**：history 描述的是操作序列，无法回答当前冲突盘面是否在另一条已失败路径上出现过；作业要求的记忆必须依赖 与栈并列的结构（例如冲突盘面指纹集合），单靠加深 history 语义不足以建模。
- **`toJSON` / `fromJSON` 最初只面向主对局快照**：未预留会话模式（是否在探索）、子会话状态与失败指纹；若要做到完整存档与复原，Homework 2 只能扩展序列化形状——暴露 最初外表化模型没有为分支会话留扩展位。

---

## 8. 若重做 Homework 1，会如何调整原设计？

针对 7 中的局限，若在 Homework 1 **就把边界写进设计与文档**，可以减轻 Homework 2 的结构性返工。

- **`Sudoku`**：除落子、克隆、序列化外，预先写明将来会有 只读的规则与推导查询（候选、冲突、以及可扩展的下一步建议）。
- **`Game`**：预先区分 主对局与 可选的试探分支（例如主会话状态与子会话引用），并写明试探不得等同于直接篡改主 `#current`，避免读者把探索误解成在主盘上原地试错。
- **History 与提交语义**：在 Homework 1 就约定 凡替换 `#current` 的操作（当时仅有 `guess`，未来包括探索合并等）一律遵循 先压入变更前快照再写入，并可收敛到单一内部入口`pushHistoryThenApply`，避免第二类路径各自实现压栈顺序。
- **与 history 并列的状态**：在设计上承认某些需求 不能单靠栈表达（例如按局面判重）， Homework 1 即可在文档中留出挂载点，哪怕最初为空。
