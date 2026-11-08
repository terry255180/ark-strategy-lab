"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MODES,
  evaluateStrategy,
  allocationAfterMarketMove,
  executePendingSignal,
} = require("../strategy-engine");

const rows = (arks, indexes = arks.map((_, index) => 100 + index)) =>
  arks.map((arkAllocation, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    arkAllocation,
    taiwanIndex: indexes[index],
  }));

test("A=80 可啟動一般補倉且上限為 3 個百分點", () => {
  const result = evaluateStrategy({ A: 80, W: 40, history: rows([80]) });
  assert.equal(result.mode, MODES.GENERAL_BUY);
  assert.equal(result.adjustmentPoints, 3);
});

test("極端補倉優先於一般補倉且上限為 3 個百分點", () => {
  const result = evaluateStrategy({ A: 86, W: 80, CNN: 25, history: rows([86]) });
  assert.equal(result.mode, MODES.EXTREME_BUY);
  assert.equal(result.adjustmentPoints, 3);
  assert.equal(result.targetAllocation, 86);
});

test("極端補倉可由融資維持率單獨觸發", () => {
  const result = evaluateStrategy({ A: 82, W: 80, CNN: null, M: 166, history: rows([82]) });
  assert.equal(result.mode, MODES.EXTREME_BUY);
  assert.equal(result.adjustmentPoints, 1.5);
});

test("缺值 CNN 與融資維持率不會誤觸極端補倉", () => {
  const result = evaluateStrategy({ A: 86, W: 79, CNN: "", M: null, history: rows([86]) });
  assert.equal(result.mode, MODES.GENERAL_BUY);
  assert.equal(result.adjustmentPoints, 0.1);
});

test("A=70 不調節且 A=65 不啟動加速調節", () => {
  const at70 = evaluateStrategy({ A: 70, W: 90, history: rows([76, 74, 72, 70]) });
  const at65 = evaluateStrategy({ A: 65, W: 90, history: rows([75, 73, 71, 68, 65]) });
  assert.equal(at70.mode, MODES.HOLD);
  assert.notEqual(at65.mode, MODES.ACCELERATED_SELL);
});

test("一般調節比例 50% 且上限為 2 個百分點", () => {
  const result = evaluateStrategy({ A: 69, W: 85, history: rows([75, 73, 71, 69]) });
  assert.equal(result.mode, MODES.GENERAL_SELL);
  assert.equal(result.adjustmentPoints, 2);
});

test("未碰上限時一般調節使用 50% 公式", () => {
  const result = evaluateStrategy({ A: 69, W: 77.5, history: rows([75, 73, 71, 69]) });
  assert.equal(result.mode, MODES.GENERAL_SELL);
  assert.equal(result.adjustmentPoints, 1.75);
});

test("加速調節優先、比例 35% 且上限為 4 個百分點", () => {
  const result = evaluateStrategy({ A: 60, W: 80, history: rows([72, 70, 68, 66, 64, 60]) });
  assert.equal(result.mode, MODES.ACCELERATED_SELL);
  assert.equal(result.adjustmentPoints, 4);
});

test("未碰上限時加速調節使用 35% 而非 50%", () => {
  const result = evaluateStrategy({ A: 64, W: 76, history: rows([74, 72, 70, 68, 67, 64]) });
  assert.equal(result.mode, MODES.ACCELERATED_SELL);
  assert.equal(result.adjustmentPoints, 3.15);
});

test("調節冷卻由成交日計算且水位再降 3 點可提前解除", () => {
  const history = rows([75, 73, 71, 68, 66]);
  const blocked = evaluateStrategy(
    { A: 66, W: 80, history, currentIndex: 11 },
    { lastSellExecution: { executionIndex: 10, signalA: 68, mode: MODES.GENERAL_SELL } },
  );
  const released = evaluateStrategy(
    { A: 65, W: 80, history: rows([75, 73, 71, 68, 65]), currentIndex: 11 },
    { lastSellExecution: { executionIndex: 10, signalA: 68, mode: MODES.GENERAL_SELL } },
  );
  assert.equal(blocked.mode, MODES.HOLD);
  assert.equal(released.mode, MODES.GENERAL_SELL);
});

test("成交前持股會先隨市場漂移，隔日買單不超過訊號日目標", () => {
  const drifted = allocationAfterMarketMove(80, 0.1);
  assert.ok(drifted > 80);
  const execution = executePendingSignal(
    { action: "BUY", adjustmentPoints: 3, signalTarget: 81 },
    drifted,
  );
  assert.ok(Math.abs(execution.allocation - drifted) < 0.0001);
  assert.equal(execution.delta, 0);
});

test("11/05 核對：83.70 對 81.18 的極端補倉為 1.89 個百分點", () => {
  const result = evaluateStrategy({
    A: 83.7,
    W: 81.18,
    CNN: 21,
    M: 155.9,
    history: rows([83.7]),
  });
  assert.equal(result.mode, MODES.EXTREME_BUY);
  assert.equal(result.adjustmentPoints, 1.89);
});
