/// <reference path="./ambient.d.ts" />
import { createApp, logStartup } from "./app.js";
import { apiHost, apiPort } from "./config.js";

const port = apiPort();
const host = apiHost();
const server = createApp();

server.listen(port, host, () => {
  logStartup(port, host);
});
