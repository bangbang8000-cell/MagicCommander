// MagicCommander V3.X PRD v2.0 - Charts
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var success = style.getPropertyValue('--success').trim();
  var warning = style.getPropertyValue('--warning').trim();
  var danger = style.getPropertyValue('--danger').trim();

  // --- Chart 1: Radar (7-dimension quality) ---
  var radarChart = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  radarChart.setOption({
    animation: false,
    tooltip: { appendToBody: true },
    radar: {
      center: ['50%', '52%'],
      radius: '65%',
      indicator: [
        { name: '美观度', max: 100 },
        { name: '易用性', max: 100 },
        { name: '实用性', max: 100 },
        { name: '可用性', max: 100 },
        { name: '自动化', max: 100 },
        { name: '准确率', max: 100 },
        { name: '可维护性', max: 100 }
      ],
      axisName: { color: muted, fontSize: 11 },
      splitArea: { areaStyle: { color: ['transparent', bg2] } },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: [82, 78, 80, 65, 55, 58, 62],
        name: '当前评分',
        areaStyle: { color: accent + '33' },
        lineStyle: { color: accent, width: 2 },
        itemStyle: { color: accent },
        symbol: 'circle',
        symbolSize: 6
      }, {
        value: [88, 85, 86, 85, 65, 80, 80],
        name: 'Phase 1 目标',
        areaStyle: { color: accent2 + '22' },
        lineStyle: { color: accent2, width: 2, type: 'dashed' },
        itemStyle: { color: accent2 },
        symbol: 'diamond',
        symbolSize: 6
      }, {
        value: [90, 90, 92, 90, 85, 90, 85],
        name: 'Phase 2+ 目标',
        areaStyle: { color: success + '18' },
        lineStyle: { color: success, width: 2, type: 'dotted' },
        itemStyle: { color: success },
        symbol: 'triangle',
        symbolSize: 6
      }]
    }]
  });
  window.addEventListener('resize', function() { radarChart.resize(); });

  // --- Chart 2: Gantt (Roadmap) ---
  var ganttChart = echarts.init(document.getElementById('chart-gantt'), null, { renderer: 'svg' });
  var phases = [
    { name: 'Phase 0\n品质筑基', start: '2026-07', end: '2026-07', color: danger },
    { name: 'Phase 1\n体验升级', start: '2026-08', end: '2026-09', color: accent },
    { name: 'Phase 2\nAI 智能中心', start: '2026-10', end: '2026-12', color: accent2 },
    { name: 'Phase 3\n模板资产中心', start: '2027-01', end: '2027-03', color: success },
    { name: 'Phase 4\n社区分享中心', start: '2027-04', end: '2027-06', color: warning },
    { name: 'Phase 5\n企业级能力', start: '2027-07', end: '2027-09', color: muted }
  ];

  var months = [];
  for (var y = 2026; y <= 2027; y++) {
    for (var m = 1; m <= 12; m++) {
      if (y === 2026 && m < 7) continue;
      if (y === 2027 && m > 9) continue;
      months.push(y + '-' + (m < 10 ? '0' + m : m));
    }
  }

  function monthIndex(d) {
    var parts = d.split('-');
    return (parseInt(parts[0]) - 2026) * 12 + parseInt(parts[1]) - 7;
  }

  var ganttData = [];
  phases.forEach(function(p) {
    var startIdx = monthIndex(p.start);
    var endIdx = monthIndex(p.end);
    ganttData.push({
      name: p.name,
      value: [startIdx, endIdx + 1, startIdx],
      itemStyle: { color: p.color }
    });
  });

  ganttChart.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      formatter: function(params) {
        var p = phases[params.dataIndex];
        return p.name.replace('\n', ' ') + '<br/>' + p.start + ' ~ ' + p.end;
      }
    },
    grid: { left: 120, right: 30, top: 20, bottom: 30 },
    xAxis: {
      type: 'value',
      min: 0,
      max: months.length,
      interval: 1,
      axisLabel: {
        formatter: function(v) { return months[v] || ''; },
        color: muted,
        fontSize: 10,
        rotate: 45
      },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: phases.map(function(p) { return p.name; }),
      inverse: true,
      axisLabel: { color: ink, fontSize: 11, lineHeight: 16 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { show: false }
    },
    series: [{
      type: 'bar',
      data: ganttData,
      barWidth: 20,
      barCategoryGap: '40%',
      label: {
        show: true,
        position: 'insideRight',
        formatter: function(params) {
          var p = phases[params.dataIndex];
          return p.start + ' ~ ' + p.end;
        },
        color: ink,
        fontSize: 10
      }
    }]
  });
  window.addEventListener('resize', function() { ganttChart.resize(); });
})();