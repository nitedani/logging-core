import { currentLoad } from "systeminformation";

export const getCpuLoad = (cb) => {
  currentLoad((load) => {
    const percents: any = {};
    load.cpus.forEach((cpu, ind) => {
      percents[ind] = cpu.load;
    });

    cb({ percents, load: load.currentLoad, avgLoad: load.avgLoad });
  });
};
