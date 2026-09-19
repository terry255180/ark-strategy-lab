window.CONFIG = Object.freeze({
  strategyVersion: "V1.0",
  deadBand: 1,
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
    webAppUrl: "https://script.google.com/macros/s/AKfycbyHHyiRN97QzK7b6oZ9zDxBdcyWnHVWAE00Cb9Yiih6Tal7qmnlh4cxM6ch3KGV-vmc/exec",
    sheetName: "紀錄",
    spreadsheetId: "1YlZu_ztxjwjdBkld25l4H4WdaBb94E8u3r02-ew3NfA",
    gid: "671589303",
    syncHourTaipei: 8
  },
  storageKeys: {
    state: "arkStrategyLab.state.v1",
    history: "arkStrategyLab.history.v1",
    etfs: "arkStrategyLab.etfs.v1",
    cache: "arkStrategyLab.centralCache.v1"
  }
});
