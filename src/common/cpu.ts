import { currentLoad, processLoad } from "systeminformation";

export const getCpuLoad = async () => {
  const [load, pLoad] = await Promise.all([currentLoad(), processLoad("node")]);

  const percents: any = {};
  load.cpus.forEach((cpu, ind) => {
    percents[ind] = cpu.load;
  });

  return { percents, load: load.currentLoad, pLoad: pLoad[0].cpu };
};
