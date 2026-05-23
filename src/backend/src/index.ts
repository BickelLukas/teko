import Fastify from "fastify";
import health from "./routes/health";

async function main(): Promise<void> {
  const port = parseInt(process.env["PORT"] ?? "3000", 10);
  const fastify = Fastify({ logger: true });

  await fastify.register(health);
  await fastify.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
