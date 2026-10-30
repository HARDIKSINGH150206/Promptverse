import { config } from "../src/config";

config.THOMPSON_SAMPLING = "off";
config.LLM_PROVIDER = "mock";
config.DECISION_PROVIDER = "mock";
config.TELEGRAM_BOT_TOKEN = "";
config.MATCHING = "on"; // the domain tests exercise matching even if .env pauses it for a demo
