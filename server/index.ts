import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

// Trust the first proxy (Railway terminates TLS at its edge). This is required
// for express-rate-limit to see the real client IP and for cookies to be marked
// secure correctly.
app.set("trust proxy", 1);

// Security headers. CSP is left off because the app uses inline styles from
// Tailwind and dynamic image sources; we can tighten this later if needed.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Gzip compression for HTML, JSON, JS, CSS. Skips already-compressed images.
app.use(compression());

// Global rate limit: 600 requests per IP per minute. Plenty of headroom for a
// busy inspector doing photo uploads, blocks abuse.
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Tighter limit on /api/login to slow down brute force attempts.
app.use(
  "/api/login",
  rateLimit({
    windowMs: 15 * 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts. Try again in a few minutes." },
  }),
);

// Health check for Railway. Returns 200 OK as soon as the process is up.
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Allow JSON bodies up to 10MB so base64 photo previews and large checklists
// import cleanly. Photo uploads use multer (multipart) and have their own limit.
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Graceful shutdown. Railway sends SIGTERM during deploys and gives the
  // process ~10 seconds to finish in-flight requests before SIGKILL.
  const shutdown = (signal: string) => {
    log(`received ${signal}, closing http server`);
    httpServer.close((err) => {
      if (err) {
        console.error("error during shutdown", err);
        process.exit(1);
      }
      log("http server closed cleanly");
      process.exit(0);
    });
    // Force exit if we hang for more than 9 seconds.
    setTimeout(() => {
      console.error("forced shutdown after timeout");
      process.exit(1);
    }, 9000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
