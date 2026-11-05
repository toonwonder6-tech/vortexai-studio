/**
 * Next.js instrumentation — runs on server startup.
 * Adds crash protection so background video tasks can't kill the server.
 *
 * NOTE: This file runs in the Node.js runtime (not Edge). The process.on
 * handlers are guarded so they only register in Node-compatible environments.
 */
export async function register() {
  // Only register in Node.js runtime (not Edge)
  if (typeof process !== "undefined" && process.on) {
    process.on("unhandledRejection", (reason) => {
      console.error("[unhandledRejection]", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("[uncaughtException]", err?.message || err);
    });
  }
}

// Force this module to run in the Node.js runtime, not Edge
export const config = {
  runtime: "nodejs",
};
