// Vercel Function: catches every /api/* request and hands it to the bundled
// Express server (built to dist/api-handler.mjs by `pnpm build`).
import apiHandler from "../dist/api-handler.mjs";

export default apiHandler;