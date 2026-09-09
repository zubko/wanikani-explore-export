export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`Server error (${status})`);
    this.name = "HttpStatusError";
  }
}
