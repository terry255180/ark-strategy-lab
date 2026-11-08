"use strict";

(function strategyEngineFactory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ARKStrategyEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function createEngine() {
  const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, value));
  const finite = (value) =>
    value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const round = (value, digits = 4) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  };

  const MODES = Object.freeze({
    EXTREME_BUY: "EXTREME_BUY",
    GENERAL_BUY: "GENERAL_BUY",
    ACCELERATED_SELL: "ACCELERATED_SELL",
    GENERAL_SELL: "GENERAL_SELL",
    HOLD: "HOLD",
  });

  function normalizeRows(history) {
    return (history || [])
      .map((row, index) => ({
        ...row,
        _index: index,
        arkAllocation: finite(row?.arkAllocation ?? row?.A),
        taiwanIndex: finite(row?.taiwanIndex ?? row?.indexClose),
      }))
      .filter((row) => row.arkAllocation !== null);
  }

  function marketBreaksPriorLow(history, lookback) {
    const rows = (history || [])
        .map((row) => ({ taiwanIndex: finite(row?.taiwanIndex ?? row?.indexClose) }))
        .filter((row) => row.taiwanIndex > 0),
      current = rows.at(-1),
      prior = rows.slice(-(lookback + 1), -1);
    return Boolean(
      current?.taiwanIndex > 0 &&
        prior.length === lookback &&
        current.taiwanIndex < Math.min(...prior.map((row) => row.taiwanIndex)),
    );
  }

  function arkChange(history, sessions) {
    const rows = normalizeRows(history),
      current = rows.at(-1),
      prior = rows.at(-(sessions + 1));
    return current && prior ? current.arkAllocation - prior.arkAllocation : null;
  }

  function hasThreeConsecutiveArkDeclines(history) {
    const rows = normalizeRows(history);
    if (rows.length < 4) return false;
    const tail = rows.slice(-4);
    return tail.slice(1).every((row, index) => row.arkAllocation < tail[index].arkAllocation);
  }

  function sellCooldownStatus(state, currentIndex, currentA) {
    const last = state?.lastSellExecution;
    if (!last || !Number.isFinite(Number(last.executionIndex)))
      return { blocked: false, remaining: 0, earlyRelease: false };
    const cooldownDays = last.mode === MODES.ACCELERATED_SELL ? 2 : 3,
      elapsed = Math.max(0, Number(currentIndex) - Number(last.executionIndex)),
      earlyRelease = Number(currentA) <= Number(last.signalA) - 3,
      blocked = elapsed <= cooldownDays && !earlyRelease;
    return {
      blocked,
      remaining: blocked ? cooldownDays - elapsed + 1 : 0,
      earlyRelease,
      cooldownDays,
      elapsed,
    };
  }

  function evaluateStrategy(input = {}, state = {}) {
    const A = finite(input.A ?? input.arkTarget ?? input.todayArk),
      W = finite(input.W ?? input.actualAllocation),
      CNN = finite(input.CNN ?? input.cnn),
      M = finite(input.M ?? input.margin ?? input.marginMaintenance),
      rawHistory = input.history || [],
      history = normalizeRows(rawHistory),
      currentIndex = Number.isFinite(Number(input.currentIndex))
        ? Number(input.currentIndex)
        : Math.max(0, history.length - 1);
    if (A === null || W === null)
      return {
        action: "HOLD",
        mode: MODES.HOLD,
        adjustmentPoints: 0,
        targetAllocation: W ?? 0,
        reasons: ["缺少方舟水位或實際持股"],
      };

    const delta1 = arkChange(history, 1),
      delta3 = arkChange(history, 3),
      delta5 = arkChange(history, 5),
      threeDeclines = hasThreeConsecutiveArkDeclines(history),
      breaks5DayLow = marketBreaksPriorLow(rawHistory, 5),
      breaks10DayLow = marketBreaksPriorLow(rawHistory, 10),
      generalWeakness = [
        threeDeclines && "方舟水位連續 3 個交易日下降",
        delta3 !== null && delta3 <= -3 && `方舟水位 3 日下降 ${Math.abs(delta3).toFixed(2)} 個百分點`,
        breaks5DayLow && "大盤跌破前 5 個交易日低點",
      ].filter(Boolean),
      acceleratedWeakness = [
        delta1 !== null && delta1 <= -3 && `方舟水位單日下降 ${Math.abs(delta1).toFixed(2)} 個百分點`,
        delta5 !== null && delta5 <= -6 && `方舟水位 5 日下降 ${Math.abs(delta5).toFixed(2)} 個百分點`,
        breaks10DayLow && "大盤跌破前 10 個交易日低點",
      ].filter(Boolean),
      cooldown = sellCooldownStatus(state, currentIndex, A),
      excess = W - A;

    if (A < 65 && excess >= 12 && acceleratedWeakness.length && !cooldown.blocked) {
      const adjustmentPoints = Math.min(Math.max(excess - 3, 0) * 0.35, 4);
      return {
        action: "SELL",
        mode: MODES.ACCELERATED_SELL,
        adjustmentPoints: round(adjustmentPoints),
        targetAllocation: round(W - adjustmentPoints),
        signalTarget: round(W - adjustmentPoints),
        reasons: acceleratedWeakness,
        cooldown,
        metrics: { A, W, excess, delta1, delta3, delta5, breaks5DayLow, breaks10DayLow },
      };
    }

    if (A < 70 && excess >= 8 && generalWeakness.length && !cooldown.blocked) {
      const adjustmentPoints = Math.min(Math.max(excess - 5, 0) * 0.5, 2);
      return {
        action: "SELL",
        mode: MODES.GENERAL_SELL,
        adjustmentPoints: round(adjustmentPoints),
        targetAllocation: round(W - adjustmentPoints),
        signalTarget: round(W - adjustmentPoints),
        reasons: generalWeakness,
        cooldown,
        metrics: { A, W, excess, delta1, delta3, delta5, breaks5DayLow, breaks10DayLow },
      };
    }

    const extremeSignal = A >= 80 && W < A && (CNN !== null && CNN <= 25 || M !== null && M <= 166);
    if (extremeSignal) {
      const adjustmentPoints = Math.min((A - W) * 0.75, 3);
      return {
        action: "BUY",
        mode: MODES.EXTREME_BUY,
        adjustmentPoints: round(adjustmentPoints),
        targetAllocation: round(A),
        signalTarget: round(A),
        reasons: [
          CNN !== null && CNN <= 25 ? `CNN ${CNN} ≤ 25` : null,
          M !== null && M <= 166 ? `融資維持率 ${M}% ≤ 166%` : null,
        ].filter(Boolean),
        cooldown,
        metrics: { A, W, excess, extremeSignal },
      };
    }

    if (A >= 80 && W < 80) {
      const adjustmentPoints = Math.min((80 - W) * 0.1, 3);
      return {
        action: "BUY",
        mode: MODES.GENERAL_BUY,
        adjustmentPoints: round(adjustmentPoints),
        targetAllocation: 80,
        signalTarget: 80,
        reasons: ["方舟水位達 80%，逐步補向 80%"],
        cooldown,
        metrics: { A, W, excess, extremeSignal: false },
      };
    }

    const reasons = [];
    if (cooldown.blocked) reasons.push(`調節冷卻尚餘 ${cooldown.remaining} 個交易日`);
    else if (A >= 70 && A < 80) reasons.push("方舟水位介於 70%～80%，維持部位");
    else if (A >= 80 && W >= 80) reasons.push("持股已達一般補倉目標");
    else reasons.push("未同時符合策略必要條件");
    return {
      action: "HOLD",
      mode: MODES.HOLD,
      adjustmentPoints: 0,
      targetAllocation: round(W),
      signalTarget: round(W),
      reasons,
      cooldown,
      metrics: { A, W, excess, delta1, delta3, delta5, breaks5DayLow, breaks10DayLow },
    };
  }

  function allocationAfterMarketMove(allocation, marketReturn) {
    const weight = clamp(Number(allocation) / 100, 0, 1),
      growth = 1 + Number(marketReturn || 0),
      portfolioGrowth = weight * growth + (1 - weight);
    return portfolioGrowth > 0 ? clamp((weight * growth) / portfolioGrowth * 100, 0, 100) : 0;
  }

  function executePendingSignal(pending, driftedAllocation, availableCashPoints = Infinity) {
    if (!pending || !(pending.adjustmentPoints > 0))
      return { allocation: driftedAllocation, delta: 0, executed: false };
    if (pending.action === "BUY") {
      const remainingToSignalTarget = Math.max(0, pending.signalTarget - driftedAllocation),
        delta = Math.min(pending.adjustmentPoints, remainingToSignalTarget, availableCashPoints);
      return { allocation: round(driftedAllocation + delta), delta: round(delta), executed: delta > 0 };
    }
    if (pending.action === "SELL") {
      const delta = Math.min(pending.adjustmentPoints, Math.max(0, driftedAllocation));
      return { allocation: round(driftedAllocation - delta), delta: round(-delta), executed: delta > 0 };
    }
    return { allocation: driftedAllocation, delta: 0, executed: false };
  }

  return {
    MODES,
    evaluateStrategy,
    allocationAfterMarketMove,
    executePendingSignal,
    hasThreeConsecutiveArkDeclines,
    marketBreaksPriorLow,
    arkChange,
    sellCooldownStatus,
  };
});
