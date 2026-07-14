(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart 1: Radar comparison of 4 i18n libraries ---
  var chartRadar = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  chartRadar.setOption({
    animation: false,
    tooltip: { appendToBody: true },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontFamily: 'InstrumentSans', fontSize: 12 },
      itemWidth: 12, itemHeight: 12
    },
    radar: {
      center: ['50%', '48%'],
      radius: '65%',
      indicator: [
        { name: '社区规模', max: 10 },
        { name: 'TypeScript', max: 10 },
        { name: '体积优势', max: 10 },
        { name: '学习曲线', max: 10 },
        { name: 'Electron 兼容', max: 10 },
        { name: '维护活跃度', max: 10 },
        { name: '生态系统', max: 10 },
        { name: '文档完善度', max: 10 }
      ],
      axisName: { color: muted, fontSize: 11, fontFamily: 'InstrumentSans' },
      splitArea: { areaStyle: { color: [bg2, 'transparent'] } },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: [
        {
          name: 'react-i18next',
          value: [10, 8, 6, 9, 10, 10, 10, 10],
          lineStyle: { color: accent, width: 2 },
          areaStyle: { color: accent + '20' },
          itemStyle: { color: accent },
          symbol: 'circle', symbolSize: 6
        },
        {
          name: 'react-intl',
          value: [7, 7, 4, 5, 5, 8, 8, 7],
          lineStyle: { color: accent2, width: 2 },
          areaStyle: { color: accent2 + '18' },
          itemStyle: { color: accent2 },
          symbol: 'circle', symbolSize: 6
        },
        {
          name: '@lingui/react',
          value: [4, 9, 9, 4, 3, 7, 4, 5],
          lineStyle: { color: muted, width: 2 },
          areaStyle: { color: muted + '18' },
          itemStyle: { color: muted },
          symbol: 'circle', symbolSize: 6
        },
        {
          name: 'typesafe-i18n',
          value: [2, 10, 10, 5, 2, 3, 2, 3],
          lineStyle: { color: '#eab308', width: 2, type: 'dashed' },
          areaStyle: { color: '#eab30818' },
          itemStyle: { color: '#eab308' },
          symbol: 'circle', symbolSize: 6
        }
      ]
    }]
  });
  window.addEventListener('resize', function() { chartRadar.resize(); });

  // --- Chart 2: Language coverage bar chart ---
  var chartLang = echarts.init(document.getElementById('chart-lang'), null, { renderer: 'svg' });
  chartLang.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      formatter: function(p) {
        return p.name + '<br/>' + '母语者: ' + (p.value / 1000000).toFixed(0) + 'M';
      }
    },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: muted, fontFamily: 'InstrumentSans', fontSize: 11,
        formatter: function(v) { return (v / 1000000).toFixed(0) + 'M'; }
      },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: ['English', '中文', 'Español', 'العربية', 'Português', 'Français', 'Deutsch', 'Русский', '日本語', '한국어', 'Tiếng Việt', 'ไทย'],
      axisLabel: { color: ink, fontFamily: 'InstrumentSans', fontSize: 12 },
      axisLine: { lineStyle: { color: rule } },
      inverse: true
    },
    series: [{
      type: 'bar',
      data: [
        { value: 1500000000, itemStyle: { color: accent } },
        { value: 1400000000, itemStyle: { color: accent } },
        { value: 560000000, itemStyle: { color: accent2 } },
        { value: 420000000, itemStyle: { color: muted } },
        { value: 260000000, itemStyle: { color: accent2 } },
        { value: 230000000, itemStyle: { color: accent2 } },
        { value: 130000000, itemStyle: { color: accent2 } },
        { value: 260000000, itemStyle: { color: accent2 } },
        { value: 125000000, itemStyle: { color: accent } },
        { value: 81000000, itemStyle: { color: accent } },
        { value: 86000000, itemStyle: { color: muted } },
        { value: 61000000, itemStyle: { color: muted } }
      ],
      barWidth: 18,
      label: {
        show: true,
        position: 'right',
        color: ink,
        fontFamily: 'InstrumentSans',
        fontSize: 11
      }
    }]
  });
  window.addEventListener('resize', function() { chartLang.resize(); });

  // --- Chart 3: Gantt timeline ---
  var chartGantt = echarts.init(document.getElementById('chart-gantt'), null, { renderer: 'svg' });
  var phases = [
    { name: 'P1 基础设施', start: '2026-07-01', end: '2026-07-03', color: accent },
    { name: 'P2 T1 翻译', start: '2026-07-04', end: '2026-07-07', color: accent },
    { name: 'P3 T2 翻译', start: '2026-07-08', end: '2026-07-10', color: accent2 },
    { name: 'P4 RTL+T3', start: '2026-07-11', end: '2026-07-13', color: accent2 },
    { name: 'P5 集成测试', start: '2026-07-14', end: '2026-07-15', color: muted }
  ];

  function dateToNumeric(d) {
    return new Date(d).getTime();
  }
  var baseDate = dateToNumeric('2026-07-01');

  chartGantt.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      formatter: function(p) {
        return p.name + '<br/>' + phases[p.dataIndex].start + ' ~ ' + phases[p.dataIndex].end;
      }
    },
    grid: { left: '25%', right: '5%', top: '5%', bottom: '5%' },
    xAxis: {
      type: 'value',
      min: 0,
      max: dateToNumeric('2026-07-15') - baseDate + 86400000,
      axisLabel: {
        color: muted, fontFamily: 'InstrumentSans', fontSize: 11,
        formatter: function(v) {
          var d = new Date(baseDate + v);
          return (d.getMonth() + 1) + '/' + d.getDate();
        }
      },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: phases.map(function(p) { return p.name; }),
      axisLabel: { color: ink, fontFamily: 'BricolageGrotesque', fontSize: 12, fontWeight: 'bold' },
      axisLine: { lineStyle: { color: rule } },
      inverse: true
    },
    series: [{
      type: 'bar',
      data: phases.map(function(p) {
        return {
          name: p.name,
          value: [
            dateToNumeric(p.start) - baseDate,
            dateToNumeric(p.end) - baseDate + 86400000
          ],
          itemStyle: { color: p.color, borderRadius: [4, 4, 4, 4] }
        };
      }),
      barWidth: 24,
      label: {
        show: true,
        position: 'insideLeft',
        color: '#fff',
        fontFamily: 'InstrumentSans',
        fontSize: 11,
        fontWeight: 700,
        formatter: function(p) {
          var days = Math.round((dateToNumeric(phases[p.dataIndex].end) - dateToNumeric(phases[p.dataIndex].start)) / 86400000) + 1;
          return days + '天';
        }
      }
    }]
  });
  window.addEventListener('resize', function() { chartGantt.resize(); });
})();