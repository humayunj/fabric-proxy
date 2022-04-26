import express from "express";
import { hostname } from "os";
import { Store, validatePair } from "./store";

export function RPC(store: Store) {
  const rpc = express();

  rpc.use(express.json());
  rpc.use(express.urlencoded({ extended: true }));

  const registerHandler: express.RequestHandler = (req, res) => {
    const { domain, template } = req.body;
    console.log("[RPC] Register", domain, template);

    if (store.get(domain)) {
      res.status(500).json({ ok: false, error: "Domain already registered" });
      return;
    }
    const pair = { hostname: domain, template: template };
    if (!validatePair(pair)) {
      res.status(500).json({ ok: false, error: "Invalid pair" });
      return;
    }
    store.addNew(pair);

    res.status(201).json({ ok: true });
  };
  const updateHandler: express.RequestHandler = (req, res) => {
    console.log("[RPC] Update", req.body.domain, req.body.template);
    const { domain, template } = req.body;
    try {
      store.update(domain, template);
      res.json({ ok: true });
    } catch (er) {
      res.json({ ok: false });
    }
  };
  const deleteHandler: express.RequestHandler = (req, res) => {
    console.log("[RPC] Delete", req.query.domain);
    const hostname = req.query.domain;
    if (!hostname) {
      return res.json({ ok: false });
    }

    try {
      store.delete(hostname as any);
      res.json({ ok: true });
    } catch (er) {
      res.json({ ok: false });
    }
  };
  rpc
    .route("/domains")
    .post(registerHandler)
    .patch(updateHandler)
    .delete(deleteHandler);

  const PORT = 6000;
  rpc.listen(PORT, () => {
    console.log("[RPC] Listening on", PORT);
  });
}
