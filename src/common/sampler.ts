import * as getMetricEmitter from "@newrelic/native-metrics";
import { getCpuLoad } from "./cpu";
import { getLogger } from "./storage";

const SAMPLE_INTERVAL = 10000;

export const runSamplers = () => {
  const _logger = getLogger()!;
  //Set up native sampler
  const emitter = getMetricEmitter({ timeout: SAMPLE_INTERVAL });

  emitter.usageEnabled = false;
  emitter.unbind();
  emitter.bind(SAMPLE_INTERVAL);

  // Every SAMPLE_INTERVAL
  setInterval(() => {
    // Send memory info
    _logger.debug!({ memory: process.memoryUsage() });

    const { min, max } = emitter.getLoopMetrics().usage;
    // Send event loop info
    _logger.debug!({ loopMetrics: { min, max, avg: (min + max) / 2 } });

    // Send CPU info
    getCpuLoad((load) => {
      _logger.debug!({
        cpu: load,
      });
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
