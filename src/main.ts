const Greenlock = require("greenlock");
import HttpProxy from "http-proxy";
import { RPC } from "./RPC";
import { Store } from "./store";

const greenlock = Greenlock.create({
  packageRoot: __dirname,
  packageAgent: "pkg" + "/" + "1.0",
  // contact for security and critical bug notices
  configDir: "../greenlock.d",
  staging: true,
  // whether or not to run at cloudscale
  cluster: false,
  maintainerEmail: "asvdas@gmail.com",
});
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
  handlerHTTP(glx);
  console.log("Creating Store");
  const store = new Store(greenlock);

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
    const template = store.get(hostname);
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
  RPC(store);
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
