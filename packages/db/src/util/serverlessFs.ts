/** Vercel/Lambda: `/var/task` é read-only; Postgres é a fonte da verdade. */
export function isReadOnlyServerlessFs(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
