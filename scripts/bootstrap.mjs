const [major] = process.versions.node.split(".").map(Number);

if (major < 22) {
  console.error("Agent Workbench requires Node.js 22 or newer.");
  process.exit(1);
}

console.log("Node.js version is compatible.");
