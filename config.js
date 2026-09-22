window.CONFIG = Object.freeze({
  strategyVersion: "V1.2",
  rebalance: {
    strategyVersion: "REBALANCE_V1.0", status: "HEURISTIC · NOT BACKTEST OPTIMIZED",
    usCnnBands: [{max:25,factor:.60,label:"極度恐懼"},{max:40,factor:.80,label:"恐懼"},{max:60,factor:1,label:"中性"},{max:75,factor:1.15,label:"偏熱"},{max:100,factor:1.30,label:"過熱"}],
    usSignals:{rsiCold:30,rsiHot:70,biasCold:-5,biasHot:5,percentileCold:20,percentileHot:85,returnCold:-4,returnHot:6,modifierStep:.05,minFactor:.5,maxFactor:1.4},
    taiwan: {rsiCold:30,rsiWarm:60,rsiHot:70,biasCold:-5,biasWarm:3,biasHot:6,percentileCold:.2,percentileWarm:.7,percentileHot:.85,returnCold:-4,returnWarm:3,returnHot:6,marginWarm:180,marginHot:200,scoreCold:-2,scoreWarm:2,scoreHot:4,scoreExtreme:6,minFactor:.6,maxFactor:1.4,step:.1},
    daysOutBands:[{max:0,points:0},{max:2,points:3},{max:5,points:9},{max:10,points:15},{max:Infinity,points:20}],
    concentration:{singleWarm:.12,singleHigh:.20,groupWarm:.25,groupHigh:.40,extremeSingle:.30,extremeGroup:.50},
    priority:{base:20,riskOff:12,strongExit:14,arkOut:4,arkRankWeak:3,arkRankWeakAfter:8,presenceWeak:5,singleWarm:7,singleHigh:14,groupWarm:8,groupHigh:16,leverage:5,leverageCluster:12,profitMax:5,profitPerPercent:.1,smallCleanup:3,smallPositionRatio:.01,inArkDiscount:5,levels:{watch:25,medium:45,high:65,veryHigh:80}},
    optimizer:{maxHoldings:40,maxSteps:200000,minimumPartialShares:1,defaultOddLot:true,defaultFullExit:false,globalFactor:.95},
    storageKeys:{state:"arkStrategyLab.rebalance.state.v1",history:"arkStrategyLab.rebalance.history.v1"}
  },
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
