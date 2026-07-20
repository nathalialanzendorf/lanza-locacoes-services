/// <reference path="./ambient.d.ts" />
/** Entrypoint local (`npm start`) — na Vercel usa api/index.mjs + server.mjs. */
import { getGatewayServer } from "./handler.js";
import { apiHost, apiPort } from "./config.js";

const port = apiPort();
const host = apiHost();
const server = getGatewayServer();

server.listen(port, host, () => {
  void import("./app.js").then(({ logStartup }) => logStartup(port, host));
});

export default server;
