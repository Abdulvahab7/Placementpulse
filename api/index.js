import "dotenv/config";
import { createApp } from "../src/app.js";

const app = createApp();

// Vercel serverless functions require the app to be exported
export default app;
