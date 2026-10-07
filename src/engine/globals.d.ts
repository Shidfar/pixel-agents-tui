// The hooks runtime has Uint8Array.prototype.toBase64; the es2023 lib does not declare it yet.
interface Uint8Array { toBase64(): string }
