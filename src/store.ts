import axios from "axios";
const ROOT_SERVER = "http://10.116.0.2:3000";
interface IPair {
  hostname: string;
  template: string;
}

const PAIRS: IPair[] = [];

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
  registerFunc: (pair: IPair) => Promise<boolean>
) {
  const gap = 1000 * 60 * 25; // 25 minutes gap
  while (true) {
    if (queue.length > 0) {
      const pair = queue.shift();
      if (!pair) continue;
      console.log("[Worker] Processing Pair", pair);
      if (validatePair(pair) === false) {
        console.warn("[Worker] Invalid Pair ", pair);
        continue;
      }
      try {
        console.log("[Worker] Registering ", pair);

        if (await registerFunc(pair)) {
          console.log("[Worker] Registration Process Finished", pair);
          // addedNew(pair);
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
  inProgress: IPair[];
  greenlock: any;
  constructor(greenlock: any) {
    this.pairs = [];
    this.queue = [];
    this.inProgress = [];
    this.greenlock = greenlock;

    Worker(this.queue, this.registerHandler.bind(this)).catch((er) =>
      console.warn("[STORE] Worker Async Exception:", er)
    );
    try {
      console.log("[STORE] Booting");
      this.boot();
    } catch (er) {
      console.error("[STORE]", er);
    }
  }

  async boot() {
    try {
      console.log("[STORE] Botting");
      const { data } = await axios.get(ROOT_SERVER + "/api/domains/list"); // get all domains
      if (data.ok === true) {
        const domains = data.domains;
        console.log("[STORE] Domains: ", domains);
        for (let d of domains) {
          try {
            console.log("[STORE] BOOT Adding ", d);
            // this.addNew({ hostname: d.domain, template: d.template });
          } catch (er) {
            console.warn("[STORE] [FAIL] Boot Adding fail for", d);
          }
        }
      } else console.warn("[STORE] Boot RCV response is not ok");
    } catch (er) {
      console.error("[STORE] Boot failed", er);
    }

    // [domain, template]
  }

  get(hostname: string): string | undefined {
    return this.pairs.find((r) => r.hostname === hostname)?.template;
  }
  update(hostname: string, newTemplate: string): void {
    const pair = this.pairs.find((r) => r.hostname === hostname);
    if (
      pair &&
      validatePair({ hostname: pair.hostname, template: newTemplate })
    ) {
      console.log(
        "[STORE] [UPDATE] ",
        pair.hostname,
        " Template ",
        pair.template,
        "to",
        newTemplate
      );
    } else
      console.log(
        "[STORE] [UPDATE] Failed to update ",
        hostname,
        "template to",
        newTemplate
      );
  }

  getHostnameInStore(hostname: string): IPair | null {
    const inPairs = this.pairs.find((f) => f.hostname == hostname);
    if (inPairs) return inPairs;

    const inQueue = this.queue.find((f) => f.hostname == hostname);
    if (inQueue) return inQueue;
    const inProgress = this.inProgress.find((f) => f.hostname == hostname);
    if (inProgress) return inProgress;

    return null;
  }
  async addNew(pair: IPair) {
    if (this.pairs.some((f) => f.hostname == pair.hostname)) {
      console.warn("[STORE] ERROR: Adding already paired hostname", pair);
      return;
    }

    if (this.queue.some((f) => f.hostname == pair.hostname)) {
      console.warn("[STORE] ERROR: Adding already QUEUED hostname", pair);
      return;
    }
    if (this.inProgress.some((f) => f.hostname == pair.hostname)) {
      console.warn("[STORE] ERROR: Adding in-progress hostname", pair);
      return;
    }

    try {
      const site = await this.greenlock.get({ servername: pair.hostname });
      if (!site) {
        console.log("[STORE] Certificate doesn't exists. Adding to queue");
        this.queue.push(pair);
      } else {
        console.log("[STORE] Certificate already exists, adding to pairs");
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
      this.inProgress.push(pair);
      await this.greenlock.add({
        subject: pair.hostname,
        altnames: [pair.hostname],
      });

      const pems = await this.greenlock.get({ servername: pair.hostname });

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
  }
  addedNewHandler(pair: IPair) {
    console.log("[STORE] Added to active pairs", pair);
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
