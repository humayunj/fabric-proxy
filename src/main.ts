const Greenlock = require("greenlock");
import HttpProxy from "http-proxy";

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

var altnames = ["fabric.kenefit.com"];

greenlock
  .add({
    subject: altnames[0],
    altnames: altnames,
  })
  .then(function () {
    // saved config to db (or file system)
  });

require("greenlock-express")
  .init({ greenlock })
  // Serves on 80 and 443
  // Get's SSL certificates magically!
  // .ready(httpWorker)
  .serve(httpsWorker);

function httpsWorker(glx: any) {
  var httpServer = glx.httpServer(function (req: any, res: any) {
    res.statusCode = 301;
    res.setHeader("Location", "https://" + req.headers.host + req.path);
    res.end("Insecure connections are not allowed. Redirecting...");
  });

  httpServer.listen(80, "0.0.0.0", function () {
    console.info("Listening on ", httpServer.address());
  });

  const proxy = HttpProxy.createProxyServer({ xfwd: true });

  // catches error events during proxying
  proxy.on("error", function (err, req, res: any) {
    console.error(err);
    res.statusCode = 500;
    res.end();
    return;
  });

  glx.serveApp(function (req: any, res: any) {
    res.end("Hello, World!");
  });
}
