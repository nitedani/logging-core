import * as getMetricEmitter from "@newrelic/native-metrics";
import { getCpuLoad } from "./cpu";
import { getLogger, getMetricsTransport } from "./storage";
import { mem } from "systeminformation";
import { MESSAGE } from "triple-beam";

const SAMPLE_INTERVAL = 10000;

export const runSamplers = () => {
  const _logger = getLogger()!;

  //Set up native sampler
  const emitter = getMetricEmitter({ timeout: SAMPLE_INTERVAL });

  emitter.usageEnabled = false;
  emitter.unbind();
  emitter.bind(SAMPLE_INTERVAL);

  const collect = async () => {
    const metrics: any = {};
    // Collect memory info
    const memInfo = await mem();
    const pmemInfo = process.memoryUsage();
    metrics.memory = {
      used: memInfo.used,
      available: memInfo.available,
      pUsed: pmemInfo.rss,
    };

    // Collect event loop info
    const { min, max } = emitter.getLoopMetrics().usage;
    metrics.loopMetrics = { min, max, avg: (min + max) / 2 };

    // Collect CPU info
    metrics.cpu = await getCpuLoad();

    return metrics;
  };

  // Every SAMPLE_INTERVAL
  setInterval(() => {
    collect().then((metrics) => {
      const transport = getMetricsTransport();
      transport?.log!(
        {
          level: "metrics",
          [MESSAGE]: JSON.stringify(metrics),
        },
        () => {}
      );
    });

    /*
    const gcMetrics = emitter.getGCMetrics();
    for (const type in gcMetrics) {
      console.log("GC type name:", type);
      console.log("GC type id:", gcMetrics[type].typeId);
      console.log("GC metrics:", gcMetrics[type].metrics);
    }
*/
  }, SAMPLE_INTERVAL);
};
