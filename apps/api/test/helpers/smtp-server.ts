import { createServer, type Server, type Socket } from "node:net";

/** The reply of each step of a scripted SMTP server; `null` never answers (a hanging server). */
export interface Script {
  greeting?: string | null;
  auth?: string;
  mailFrom?: string;
  rcptTo?: string;
  data?: string;
}

export interface Received {
  commands: string[];
  data: string;
}

/** A plain-text SMTP server on 127.0.0.1 that answers by `script` and records what it got. */
export async function smtpServer(script: Script): Promise<{ port: number; received: Received; close: () => Promise<void> }> {
  const received: Received = { commands: [], data: "" };
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let inData = false;
    let buffer = "";
    const reply = (line: string) => socket.write(`${line}\r\n`);
    if (script.greeting !== null) reply(script.greeting ?? "220 teste ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index: number;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            reply(script.data ?? "250 2.0.0 aceito");
          } else received.data += `${line}\n`;
          continue;
        }
        received.commands.push(line);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO") reply(script.auth ? "250-teste\r\n250 AUTH PLAIN" : "250 teste");
        else if (verb === "HELO") reply("250 teste");
        else if (verb === "AUTH") reply(script.auth ?? "235 2.7.0 ok");
        else if (verb === "MAIL") reply(script.mailFrom ?? "250 2.1.0 ok");
        else if (verb === "RCPT") reply(script.rcptTo ?? "250 2.1.5 ok");
        else if (verb === "DATA") {
          inData = true;
          reply("354 envie");
        } else if (verb === "QUIT") {
          reply("221 tchau");
          socket.end();
        } else reply("502 5.5.2 não implementado");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    port,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** An unused local port (a server opened and closed): connecting to it is refused. */
export async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
