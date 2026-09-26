import "dotenv/config";
import { createApp } from "./app.js";

const app = createApp();
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Placement Pulse backend listening on port ${port}`);
});
