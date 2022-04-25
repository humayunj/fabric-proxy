import axios from "axios";
import { hostname } from "os";
const ROOT_SERVER = "http://";
interface IPair {
  hostname: string;
  template: string;
}

const PAIRS: IPair[] = [];

function boot() {
  const domains = axios.get("/domains"); // get all domains
  // [domain, template]
}

async function sleep(ms: number) {
  return new Promise<void>((res, rej) => {
    setTimeout(() => res(), ms);
  });
}

export function validatePair(pair: IPair) {
  if (pair.hostname.length === 0 || pair.template.length == 0) return false;
  return true;
}

async function Worker(
  queue: IPair[],
  registerFunc: (pair: IPair) => Promise<boolean>,
  addedNew: (pair: IPair) => void
) {
  const gap = 5000; //1000 * 60 * 20; // 20 minutes gap
  while (true) {
    if (queue.length > 0) {
      const pair = queue.shift();
      if (!pair) continue;
      if (validatePair(pair) === false) {
        console.warn("[Worker] Invalid Pair ", pair);
        continue;
      }
      try {
        console.log("[Worker] Registering ", pair);
        await registerFunc(pair);
        console.log("[Worker] Registered! Calling addedNew handler");
        addedNew(pair);
      } catch (er) {
        console.warn("[Worker] Failed to register pair", pair);
        console.warn(er);
      } finally {
        console.log("[Worker] Sleeping for ", gap);
        await sleep(gap);
      }
    }
    await sleep(1000);
  }
}

export class Store {
  pairs: IPair[];
  queue: IPair[];
  greenlock: any;
  constructor(greenlock: any) {
    this.pairs = [];
    this.queue = [];
    this.greenlock = greenlock;

    Worker(
      this.queue,
      this.registerHandler.bind(this),
      this.addedNewHandler.bind(this)
    ).catch((er) => console.warn(er));
    // axios.get()
  }

  get(hostname: string): string | undefined {
    return this.pairs.find((r) => r.hostname === hostname)?.template;
  }
  async addNew(pair: IPair) {
    if (this.pairs.some((f) => f.hostname == pair.hostname)) {
      console.warn("Adding already paired hostname", pair);
      return;
    }

    try {
      const site = await this.greenlock.get({ servername: pair.hostname });
      if (!site) {
        console.log("Certificate doesn't exists. Adding to queue");
        this.queue.push(pair);
      } else {
        console.log("Certificate already exists, adding to pairs");
        this.addedNewHandler(pair);
      }
    } catch (er) {
      console.warn(er);
    }
  }

  async registerHandler(pair: IPair) {
    console.log(">>>Register pair", pair);
    try {
      await this.greenlock.add({
        subject: pair.hostname,
        altnames: [pair.hostname],
      });
    } catch (er) {
      console.warn("[STORE] Greenlock registration failed");
      console.warn(er);
      return false;
    }
    return true;
  }
  addedNewHandler(pair: IPair) {
    this.pairs.push(pair);
  }
  delete(hostname: string) {
    let i = this.pairs.findIndex((h) => h.hostname === hostname);
    if (i > 0) {
      this.pairs.splice(i, 1);
    }
  }
}
