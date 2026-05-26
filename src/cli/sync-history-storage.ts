import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

interface StorageManifest {
  generatedAt: string;
  manifestVersion: number;
  scope: "latest-run" | "history";
  storage: {
    recommendedProvider: string;
    baseKey: string;
    futureEnvVars: string[];
  };
  runCount: number;
  fileCount: number;
  totalBytes: number;
  files: StorageManifestFile[];
}

interface StorageManifestFile {
  relativePath: string;
  kind: string;
  runId?: string;
  byteSize: number;
  sha256: string;
  destinationKey: string;
}

interface CliOptions {
  manifestPath: string;
  dryRun: boolean;
  requireEnv: boolean;
}

const requiredEnvVars = [
  "QA_HISTORY_S3_BUCKET",
  "QA_HISTORY_S3_ACCESS_KEY_ID",
  "QA_HISTORY_S3_SECRET_ACCESS_KEY"
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(options.manifestPath, "utf8")) as StorageManifest;

  if (options.dryRun) {
    printManifestSummary(manifest, options.manifestPath, "dry-run");
    return;
  }

  const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
  if (missingEnvVars.length > 0) {
    const message = `History storage sync skipped: missing ${missingEnvVars.join(", ")}.`;
    if (options.requireEnv) {
      throw new Error(message);
    }
    console.log(message);
    printManifestSummary(manifest, options.manifestPath, "skipped");
    return;
  }

  const client = new S3Client({
    region: process.env.QA_HISTORY_S3_REGION || "auto",
    endpoint: process.env.QA_HISTORY_S3_ENDPOINT || undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("QA_HISTORY_S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("QA_HISTORY_S3_SECRET_ACCESS_KEY")
    }
  });

  const bucket = requiredEnv("QA_HISTORY_S3_BUCKET");
  const stats = {
    uploaded: 0,
    unchanged: 0,
    missingLocal: 0,
    failed: 0,
    bytesUploaded: 0
  };

  for (const file of manifest.files) {
    const absolutePath = path.join(process.cwd(), file.relativePath);
    try {
      const localStats = await stat(absolutePath);
      if (localStats.size !== file.byteSize) {
        console.warn(`Size mismatch before upload: ${file.relativePath} manifest=${file.byteSize} actual=${localStats.size}`);
      }

      if (await remoteObjectHasSameHash(client, bucket, file)) {
        stats.unchanged += 1;
        continue;
      }

      const body = await readFile(absolutePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: file.destinationKey,
          Body: body,
          ContentType: contentTypeForPath(file.relativePath),
          Metadata: {
            sha256: file.sha256,
            kind: file.kind,
            runid: file.runId ?? "",
            scope: manifest.scope,
            generatedat: manifest.generatedAt
          }
        })
      );
      stats.uploaded += 1;
      stats.bytesUploaded += body.byteLength;
      console.log(`Uploaded ${file.relativePath} -> ${file.destinationKey}`);
    } catch (error) {
      if (isFileMissingError(error)) {
        stats.missingLocal += 1;
        console.warn(`Missing local file: ${file.relativePath}`);
      } else {
        stats.failed += 1;
        console.error(`Failed to upload ${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        status: stats.failed > 0 ? "failed" : "completed",
        manifest: path.relative(process.cwd(), options.manifestPath),
        scope: manifest.scope,
        bucket,
        uploaded: stats.uploaded,
        unchanged: stats.unchanged,
        missingLocal: stats.missingLocal,
        failed: stats.failed,
        bytesUploaded: stats.bytesUploaded
      },
      null,
      2
    )
  );

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  let manifestPath = path.join(process.cwd(), "reports", "latest", "storage-manifest.json");
  let dryRun = false;
  let requireEnv = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--require-env") {
      requireEnv = true;
    } else if (arg === "--manifest") {
      const value = args[index + 1];
      if (!value) throw new Error("--manifest requires a path");
      manifestPath = path.resolve(value);
      index += 1;
    } else if (arg.startsWith("--manifest=")) {
      manifestPath = path.resolve(arg.slice("--manifest=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { manifestPath, dryRun, requireEnv };
}

function printManifestSummary(manifest: StorageManifest, manifestPath: string, status: "dry-run" | "skipped"): void {
  console.log(
    JSON.stringify(
      {
        status,
        manifest: path.relative(process.cwd(), manifestPath),
        manifestVersion: manifest.manifestVersion,
        scope: manifest.scope,
        recommendedProvider: manifest.storage.recommendedProvider,
        runCount: manifest.runCount,
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        destinationSamples: manifest.files.slice(0, 5).map((file) => file.destinationKey)
      },
      null,
      2
    )
  );
}

async function remoteObjectHasSameHash(client: S3Client, bucket: string, file: StorageManifestFile): Promise<boolean> {
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: file.destinationKey
      })
    );
    return result.Metadata?.sha256?.toLowerCase() === file.sha256.toLowerCase();
  } catch {
    return false;
  }
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isFileMissingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
