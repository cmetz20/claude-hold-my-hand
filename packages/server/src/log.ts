/** stdout belongs to the MCP stdio transport — all logging goes to stderr. */
export function log(...args: unknown[]): void {
  console.error("[chmh]", ...args);
}
