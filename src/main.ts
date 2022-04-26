const Greenlock = require("greenlock");
import HttpProxy from "http-proxy";
import { RPC } from "./RPC";
import { Store } from "./store";
let store: Store | null = null;
const greenlock = Greenlock.create({
  packageRoot: __dirname,
  packageAgent: "fabric-proxy" + "/" + "1.0.0",
  // contact for security and critical bug notices
  configDir: "../greenlock.d",
  staging: true,
  // whether or not to run at cloudscale
  cluster: false,
  maintainerEmail: "asvdas@gmail.com",
  notify: function (event: any, details: any) {
    console.log("[Ev]");

    if (event === "cert_issue") {
      console.log("[Main] [Event] Cert Issued to", details.subject);
      if (!store) return;
      const pairInd = store.inProgress.findIndex(
        (p) => p.hostname === details.subject
      );

      if (pairInd < 0) return;
      const pair = store.inProgress.splice(pairInd, 1);
      if (pair && pair.length > 0) store.addedNewHandler(pair[0]);
    }

    if ("error" === event) {
      // `details` is an error object in this case
      // console.error(details);
      console.log("[Ev] is Error");
    }
    console.log(event, details);
  },
});
store = new Store(greenlock);
greenlock.manager.defaults({
  agreeToTerms: true,
  subscriberEmail: "asvdas@gmail.com",
});

require("greenlock-express")
  .init({ greenlock })
  // Serves on 80 and 443
  // Get's SSL certificates magically!
  // .ready(httpWorker)
  .serve(httpsWorker);

function httpsWorker(glx: any) {
  if (!store) {
    console.error("Store is not initialized");
    return;
  }
  handlerHTTP(glx);
  console.log("Creating Store");

  const proxy = HttpProxy.createProxyServer({ xfwd: true });

  // catches error events during proxying
  proxy.on("error", function (err, req, res: any) {
    console.error(err);
    res.statusCode = 500;
    res.end();
    return;
  });

  proxy.on("proxyReq", (proxyReq, req, res, options) => {
    const hostname = req.headers.host;
    if (!hostname) {
      res.statusCode = 404;
      res.end("Invalid domain");
      return;
    }
    console.log(hostname);
    const template = store?.get(hostname);
    console.log("Template is", template);
    if (!template) {
      res.statusCode = 404;
      res.end("Not Found!");
      return;
    }

    proxyReq.setHeader("x-custom-domain", hostname);
    proxyReq.setHeader("host", `${template}.relcanonical.com`);
  });

  glx.serveApp(function (req: any, res: any) {
    proxy.web(req, res, { target: "http://206.189.201.77:3000" });
  });

  console.log("Running RPC");
  if (store) RPC(store);
}

function handlerHTTP(glx: any) {
  var httpServer = glx.httpServer(function (req: any, res: any) {
    res.statusCode = 301;
    res.setHeader("Location", "https://" + req.headers.host + req.path);
    res.end("Insecure connections are not allowed. Redirecting...");
  });

  httpServer.listen(80, "0.0.0.0", function () {
    console.info("Listening on ", httpServer.address());
  });
}
