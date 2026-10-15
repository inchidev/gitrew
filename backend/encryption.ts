import { Buffer } from "node:buffer";
import { HttpError } from "./security";

export class EncryptedStore {
  constructor(protected secret: string) {}
  private async key() {
    if (this.secret.length < 32)
      throw new HttpError(
        503,
        "Set SETUP_TOKEN to a random key of at least 32 characters in your hosting settings before setup.",
      );
    return crypto.subtle.importKey(
      "raw",
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode("gitrew-storage-v1:" + this.secret),
      ),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  }
  async seal(value: unknown, scope: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(scope) },
      await this.key(),
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return (
      Buffer.from(iv).toString("base64url") +
      "." +
      Buffer.from(encrypted).toString("base64url")
    );
  }
  async open(value: string, scope: string): Promise<unknown> {
    const [iv, data] = value.split(".");
    if (!iv || !data)
      throw new HttpError(503, "Stored configuration is unavailable.");
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(iv, "base64url"),
        additionalData: new TextEncoder().encode(scope),
      },
      await this.key(),
      Buffer.from(data, "base64url"),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }
}
