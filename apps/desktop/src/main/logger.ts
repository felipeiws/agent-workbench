import pino from "pino";

export const logger = pino({
  name: "agent-workbench",
  level: process.env.LOG_LEVEL ?? "info"
});
