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
  const gap = 1000 * 60 * 25; // 25 minutes gap
  while (true) {
    if (queue.length > 0) {
      const pair = queue.shift();
      if (!pair) continue;
      console.log("[WORKER] Processing Pair", pair);
      if (validatePair(pair) === false) {
        console.warn("[Worker] Invalid Pair ", pair);
        continue;
      }
      try {
        console.log("[Worker] Registering ", pair);
        if (await registerFunc(pair)) {
          console.log("[Worker] Registered, Calling addedNew handler", pair);
          addedNew(pair);
        } else console.log("[Worker] Registration failed", pair);
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
      console.log("[STORE] Failed to check for ", pair);
      console.warn(er);
    }
  }

  async registerHandler(pair: IPair) {
    console.log("[STORE] Geenlock registering pair", pair);
    try {
      await this.greenlock
        .add({
          subject: pair.hostname,
          altnames: [pair.hostname],
        })
        .catch((er: any) => console.warn(">>>FAIL"));
      const pems = await this.greenlock
        .get({ servername: pair.hostname })
        .catch((er: any) => console.log(">>>>>FFF"));

      if (pems && pems.privkey && pems.cert && pems.chain) {
        console.info("[STORE] Pems exist");
      } else console.log("[STORE] Pems not exists");
      //console.log(pems);
      return true;
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

      this.greenlock
        .remove({
          subject: hostname,
        })
        .then(function (siteConfig: any) {
          console.log("[STORE] Removed", hostname);
        });
    }
  }
}
