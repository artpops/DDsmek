function generateData(count, yrange) {
  var i = 0;
  var series = [];
  while (i < count) {
    var y =
      Math.floor(Math.random() * (yrange.max - yrange.min + 1)) + yrange.min;

    series.push(y);
    i++;
  }
  return series;
}

var data = [
  {
    name: "10:00",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "10:30",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "11:00",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "11:30",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "12:00",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "12:30",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "13:00",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  },
  {
    name: "13:30",
    data: generateData(15, {
      min: 0,
      max: 90
    })
  }
];
var options = {
  series: data,
  chart: {
    height: 350,
    width: 350,
    type: "heatmap",
    events: {
      mounted: function (ctx) {
        rotateChart(ctx.el);
      },
      updated: function (ctx) {
        rotateChart(ctx.el);
      }
    }
  },
  dataLabels: {
    enabled: false
  },
  plotOptions: {
    heatmap: {
      colorScale: {
        inverse: true
      }
    }
  },
  tooltip: {
    enabled: false
  },
  colors: [
    "#F3B415",
    "#F27036",
    "#663F59",
    "#6A6E94",
    "#4E88B4",
    "#00A7C6",
    "#18D8D8",
    "#A9D794",
    "#46AF78",
    "#A93F55",
    "#8C5E58",
    "#2176FF",
    "#33A1FD",
    "#7A918D",
    "#BAFF29"
  ],
  xaxis: {
    type: "category",
    tooltip: {
      enabled: false
    },
    labels: {
      rotate: -90
    },
    categories: [
      "W1",
      "W2",
      "W3",
      "W4",
      "W5",
      "W6",
      "W7",
      "W8",
      "W9",
      "W10",
      "W11",
      "W12",
      "W13",
      "W14",
      "W15"
    ]
  }
};

var chart = new ApexCharts(document.querySelector("#chart"), options);
chart.render();

function rotateChart(rootElement) {
  rootElement.querySelector(".apexcharts-svg").style.transform =
    "rotate(90deg)";
}
