export async function register() {
  // Only start the background scheduler in the real Node.js server process.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
