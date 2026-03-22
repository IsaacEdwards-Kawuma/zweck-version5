import pino from "pino";

const level = process.env.LOG_LEVEL?.trim() || (process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger = pino({ level });
