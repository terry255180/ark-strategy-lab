window.CONFIG = Object.freeze({
  strategyVersion: "V1.1",
  deadBand: 1,
  buyWatchMaxGap: 5,
  defensiveAccumulationGap: 20,
  rapidDropPause: 6,
  prolongedDropPause: 12,
  distributionDrawdown: 2,
  confirmedDistributionDrawdown: 5,
  riskOffDrawdown: 8,
  sellFillDistribution: 0.15,
  sellFillConfirmed: 0.25,
  sellFillRiskOff: 0.50,
  maxBuyMultiplier: 3.0,
  minInitialBuildMultiplier: 1.8,
  historyLimit: 60,
  googleSheets: {
    enabled: true,
    webAppUrl: "https://script.google.com/macros/s/AKfycbx_hrLGj3Hhezed8EpAX_INeZxbvRl4xW6AcEbjVu6VeWGTJz-f1zgQLl88b9FgXkQk/exec",
    sheetName: "紀錄",
    spreadsheetId: "1YlZu_ztxjwjdBkld25l4H4WdaBb94E8u3r02-ew3NfA",
    gid: "671589303",
    syncHourTaipei: 8
  },
  storageKeys: {
    state: "arkStrategyLab.state.v1",
    history: "arkStrategyLab.history.v1",
    etfs: "arkStrategyLab.etfs.v1",
    cache: "arkStrategyLab.centralCache.v2"
  }
});
